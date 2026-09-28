import { expect, test } from '@playwright/test'
import { decodeStoredState } from '../src/state/storage'
import { createInitialState } from '../src/state/model'
import { decodeSavedWebSpots, parseWebSearchResult, sourceIdentity } from '../src/domain/webSearch'
import { evaluateExternalRequest } from '../src/domain/externalLinks'

const query = { region: '京都市', theme: '自然とカフェ' }
const response = () => ({
  mode: 'live',
  query,
  retrievedAt: '2026-09-28T11:00:00.000Z',
  omitted: 0,
  spots: [
    {
      name: '架空の検証候補',
      area: '京都市・確認用',
      summary: '検証のための説明です。',
      matchReason: '検証のための理由です。',
      sourceUrl: 'https://ja.kyoto.travel/tourism/single01.php?tourism_id=99999&category_id=8',
      verification: 'unconfirmed',
    },
  ],
})

test('検索結果のIDは出典に対応し、再取得・URLの順序や追跡情報では増殖しない', async () => {
  const first = await parseWebSearchResult(response(), query)
  const next = response()
  next.spots[0].name = '表記変更後の候補'
  next.spots[0].sourceUrl =
    'https://ja.kyoto.travel/tourism/single01.php?category_id=8&tourism_id=99999&utm_source=test#top'
  const second = await parseWebSearchResult(next, query)
  expect(second.spots[0].id).toBe(first.spots[0].id)
  next.spots.push(next.spots[0])
  expect((await parseWebSearchResult(next, query)).spots).toHaveLength(1)
  expect(sourceIdentity(next.spots[0].sourceUrl)).not.toContain('utm_')
})

test('条件違い・不正出典・確認済みへの昇格・不正日時をAPI境界で拒否する', async () => {
  for (const url of [
    'javascript:alert(1)',
    'https://kyoto.travel.evil.example/a',
    'http://kyoto.travel/',
    'https://x:secret@kyoto.travel/',
    'https://127.0.0.1/',
    'https://kyoto.travel:444/',
  ]) {
    const next = response()
    next.spots[0].sourceUrl = url
    await expect(parseWebSearchResult(next, query)).rejects.toThrow()
    expect(evaluateExternalRequest({ type: 'research', url }).destination).toBeUndefined()
  }
  await expect(parseWebSearchResult(response(), { ...query, theme: '別条件' })).rejects.toThrow()
  await expect(
    parseWebSearchResult({ ...response(), retrievedAt: 'yesterday' }, query),
  ).rejects.toThrow()
  const next = response()
  next.spots[0].verification = 'confirmed'
  await expect(parseWebSearchResult(next, query)).rejects.toThrow()
})

test('旧データを保ち、保存候補は再読み込み可能。不正な新セクションは保護する', async () => {
  const { spots } = await parseWebSearchResult(response(), query)
  const state = { ...createInitialState(), savedEvents: ['fuji'], savedWebSpots: spots }
  expect(decodeStoredState(JSON.stringify(state))).toEqual({ state, problem: null })
  expect(
    decodeStoredState(JSON.stringify({ profile: {}, savedEvents: ['fuji'] })).state.savedWebSpots,
  ).toEqual([])
  for (const changed of [
    { ...spots[0], sourceUrl: 'https://example.com/' },
    { ...spots[0], verification: 'confirmed' },
    { ...spots[0], image: 'https://example.com/photo.jpg' },
  ]) {
    const parsed = decodeStoredState(JSON.stringify({ ...state, savedWebSpots: [changed] }))
    expect(parsed.problem).toBe('invalid')
    expect(parsed.state.savedEvents).toEqual(['fuji'])
    expect(parsed.state.savedWebSpots).toEqual([])
  }
  expect(() => decodeSavedWebSpots([...spots, ...spots])).toThrow()
})

test('出典は確認済み掲載にせず開ける。サンプル掲載の外部リンク制限は維持する', async () => {
  const { spots } = await parseWebSearchResult(response(), query)
  const decision = evaluateExternalRequest({ type: 'research', url: spots[0].sourceUrl })
  expect(decision.destination?.host).toBe('ja.kyoto.travel')
  expect(decision.destination?.checkedAt).toBeUndefined()
  expect(
    evaluateExternalRequest({ type: 'listing', catalogSource: 'sample', kind: 'official' }).block,
  ).toBe('sample')
})

test('静的配信版では検索サーバーへ接続せず、保存したWeb候補は開ける', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_SERVER !== 'preview', '静的ビルドの検証')
  const { spots } = await parseWebSearchResult(response(), query)
  const initial = createInitialState()
  initial.onboarded = true
  initial.discover.region = '京都府'
  initial.discover.search = query.theme
  initial.savedWebSpots = spots
  await page.addInitScript((state) => {
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
  }, initial)
  let requests = 0
  await page.route('**/api/spot-search/**', (route) => {
    requests++
    return route.abort()
  })
  await page.goto('/#/discover')
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('検索サーバーをまだ接続していません')
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: '架空の検証候補', exact: true })).toBeVisible()
  await expect(page.getByText('Web検索・内容未確認', { exact: true })).toBeVisible()
  expect(requests).toBe(0)
})
