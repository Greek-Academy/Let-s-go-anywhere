import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPhotoPilot, matchesPlace } from './core.ts'
import { decodePlacePhoto, googleMapsUrl, googlePhotoUrl } from '../../src/domain/placePhoto.ts'
import places from '../../src/data/photoPilotPlaces.json' with { type: 'json' }

const key = 'TEST_SECRET_DO_NOT_PERSIST'
function place(target = places[0]) {
  return {
    id: 'ChIJ_fake_place',
    displayName: { text: target.name },
    formattedAddress: `日本 ${target.address}`,
    photos: [
      {
        name: 'places/ChIJ_fake_place/photos/valid_resource',
        googleMapsUri: 'https://www.google.com/maps/place/?photo=example',
        authorAttributions: [
          {
            displayName: 'Test Author',
            uri: '//maps.google.com/maps/contrib/123',
            photoUri: 'https://lh3.googleusercontent.com/avatar',
          },
        ],
      },
    ],
  }
}
const media = { photoUri: 'https://lh3.googleusercontent.com/place-photo' }
async function fixture(t, override) {
  const directory = await mkdtemp(join(tmpdir(), 'driveplus-photos-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (override) return override(url, options)
    const target = places.find(
      (p) => options.method === 'POST' && JSON.parse(options.body).textQuery.startsWith(p.name),
    )
    return Response.json(target ? { places: [place(target)] } : media)
  }
  const make = (getKey = () => key) => createPhotoPilot({ directory, getKey, fetcher })
  return { directory, calls, make, pilot: make() }
}
test('3固定店舗のみ。未設定・不正IDは課金操作せず、設定後に取得できる', async (t) => {
  const f = await fixture(t)
  await assert.rejects(f.make(() => '').lookup(places[0].id), /APIキー/)
  for (const id of ['unknown', '../other', null, { id: places[0].id }])
    await assert.rejects(f.pilot.lookup(id), /指定した3店舗/)
  assert.equal(f.calls.length, 0)
  assert.equal((await f.pilot.status()).used, 0)
  for (const p of places) assert.ok((await f.pilot.lookup(p.id)).photo)
  assert.equal(f.calls.length, 6)
  assert.equal((await f.pilot.status()).used, 3)
  assert.ok(
    f.calls.every(
      (c) => c.options.headers['X-Goog-Api-Key'] === key && c.options.redirect === 'error',
    ),
  )
  assert.ok(f.calls.every((c) => !c.url.includes(key)))
  assert.ok(
    f.calls
      .filter((c) => c.options.method === 'POST')
      .every(
        (c) =>
          c.options.headers['X-Goog-FieldMask'] ===
          'places.id,places.displayName,places.formattedAddress,places.photos',
      ),
  )
})
test('同時操作・サーバー再生成でも店舗ごとに1回。秘密・写真情報は永続化しない', async (t) => {
  const f = await fixture(t)
  const outcomes = await Promise.allSettled([
    f.pilot.lookup(places[0].id),
    f.make().lookup(places[0].id),
    f.make().lookup(places[0].id),
  ])
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(f.calls.length, 2)
  await assert.rejects(f.make().lookup(places[0].id), /実行済み/)
  const files = await readdir(f.directory)
  assert.equal(files.length, 1)
  const raw = await readFile(join(f.directory, files[0]), 'utf8')
  for (const text of [key, 'googleusercontent', 'ChIJ', 'valid_resource', 'Test Author'])
    assert.ok(!raw.includes(text))
  assert.deepEqual([JSON.parse(raw).searchCalls, JSON.parse(raw).photoCalls], [1, 1])
})
test('同名別支店・番地の部分一致・重複候補には写真APIを使わない', async (t) => {
  assert.equal(matchesPlace(places[0], place()), true)
  assert.equal(
    matchesPlace(places[0], { ...place(), formattedAddress: '京都市中京区道祐町1400' }),
    false,
  )
  assert.equal(
    matchesPlace(places[0], { ...place(), formattedAddress: '京都市中京区道祐町140-1' }),
    false,
  )
  assert.equal(
    matchesPlace(places[0], { ...place(), displayName: { text: 'イノダコーヒ 三条店' } }),
    false,
  )
  assert.equal(
    matchesPlace(places[1], {
      ...place(places[1]),
      formattedAddress: '京都市右京区太秦帷子ケ辻町11-22',
    }),
    false,
  )
  for (const candidates of [
    [],
    [place(), place()],
    [{ ...place(), formattedAddress: '京都市中京区道祐町141' }],
  ]) {
    const f = await fixture(t, () => Response.json({ places: candidates }))
    const result = await f.pilot.lookup(places[0].id)
    assert.equal(result.photo, null)
    assert.match(result.reason, /同じ店舗/)
    assert.equal(f.calls.length, 1)
  }
})
test('写真なし・出典欠落・危険なURLはイラスト。秘密入り例外でも流出しない', async (t) => {
  const f = await fixture(t, () => Response.json({ places: [{ ...place(), photos: [] }] }))
  assert.equal((await f.pilot.lookup(places[0].id)).photo, null)
  assert.equal(f.calls.length, 1)
  const g = await fixture(t, () =>
    Response.json({
      places: [
        { ...place(), photos: [{ ...place().photos[0], googleMapsUri: 'javascript:alert(1)' }] },
      ],
    }),
  )
  await assert.rejects(g.pilot.lookup(places[0].id), /出典/)
  assert.equal(g.calls.length, 1)
  const h = await fixture(t, () => {
    throw new Error('fetch ' + key)
  })
  await assert.rejects(h.pilot.lookup(places[0].id), (e) => !e.message.includes(key))
  await assert.rejects(h.make().lookup(places[0].id), /実行済み/)
  assert.equal(h.calls.length, 1)
})
test('想定外の画像配信先・非HTTPS・偽ドメイン・任意URLは拒否', () => {
  for (const url of [
    'javascript:alert(1)',
    'https://googleusercontent.com.evil.example/p',
    'http://lh3.googleusercontent.com/p',
    'https://a:secret@lh3.googleusercontent.com/p',
    'https://127.0.0.1/p',
  ])
    assert.equal(googlePhotoUrl(url), undefined)
  for (const url of [
    'https://google.com.evil.example/maps/a',
    'https://www.google.com/url?url=https://evil.example',
    'https://maps.google.com:444/maps/x',
  ])
    assert.equal(googleMapsUrl(url), undefined)
  assert.throws(() =>
    decodePlacePhoto({
      imageUrl: media.photoUri,
      sourceUrl: place().photos[0].googleMapsUri,
      authors: [{ name: 'A', url: 'javascript:bad()' }],
    }),
  )
})
test('Googleが上限エラー・大きすぎる応答を返しても自動再試行しない', async (t) => {
  for (const response of [
    new Response('unavailable', { status: 429 }),
    new Response('x'.repeat(512001)),
  ]) {
    const f = await fixture(t, () => response)
    await assert.rejects(f.pilot.lookup(places[0].id))
    await assert.rejects(f.make().lookup(places[0].id), /実行済み/)
    assert.equal(f.calls.length, 1)
  }
})
