import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { braveQueries, braveEvidence, searchBrave } from '../../spot-comparison/brave.mjs'
import { runComparison } from '../../spot-comparison/providers.mjs'
import { createComparison } from '../../spot-comparison/service.mjs'
import { comparisonSample } from '../../spot-comparison/sample.mjs'
import {
  validateComparisonQuery,
  parseComparisonResponse,
  buildGeminiEvidenceRequest,
} from '../../spot-comparison/core.mjs'
import { driveQuery, driveTheme } from '../../../src/domain/driveSearch.ts'
import { createPilot } from '../server.mjs'
import { eventDates } from '../../../src/domain/eventSearch.ts'

const drive = driveQuery('default', undefined, ['自然', 'グルメ', '温泉'])
const query = validateComparisonQuery({ stationId: '1130208', theme: driveTheme(drive), drive })
function fixture() {
  const samples = JSON.parse(
    comparisonSample('gemini', query).candidates[0].content.parts[0].text,
  ).spots
  const spots = Array.from({ length: 30 }, (_, i) => ({
    ...samples[i % 10],
    name: `架空の検証候補${i}`,
    area: '東京都新宿区',
    sourceId: `s${i % 10}`,
  }))
  return {
    context: {
      grounding: {
        generic: samples.map((s) => ({ url: s.sourceUrl, title: s.name, snippets: [s.summary] })),
      },
    },
    extraction: {
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ spots }) }] } },
      ],
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 500 },
    },
  }
}
test('Brave plans bounded region searches covering all hobbies without GPS; free and conditions remain independent', () => {
  const gps = validateComparisonQuery({
    location: { lat: 35.681, lng: 139.767 },
    theme: driveTheme(drive),
    drive,
  })
  for (const q of [query, gps]) {
    const searches = braveQueries(q)
    assert.equal(searches.length, 3)
    for (const hobby of drive.hobbies) assert.ok(searches.some((s) => s.includes(hobby)))
    assert.match(searches.join(' '), /1〜5時間/)
    assert.doesNotMatch(searches.join(' '), /35\.681|139\.767|undefined/)
  }
  const free = braveQueries({ ...query, theme: '夜景', drive: driveQuery('free') }).join(' ')
  assert.match(free, /夜景/)
  assert.doesNotMatch(free, /自然|グルメ|温泉/)
  const conditions = driveQuery('conditions', {
    ...drive,
    activities: ['海を見たい'],
    duration: '1〜2時間',
    road: '一般道でゆっくり',
  })
  assert.match(
    braveQueries({ ...query, drive: conditions, theme: driveTheme(conditions) }).join(' '),
    /海を見たい 一般道|海を見たい/,
  )
})
test('Brave evidence rejects private/unsupported sources and distributes bounded context across searches', () => {
  const context = {
    grounding: {
      generic: [
        { url: 'https://localhost/private', snippets: ['no'] },
        { url: 'https://example.com/empty', snippets: [] },
        ...Array.from({ length: 50 }, (_, i) => ({
          url: `https://example.com/a${i}`,
          snippets: ['a'.repeat(10000)],
        })),
      ],
    },
  }
  const other = {
    grounding: { generic: [{ url: 'https://example.org/hobby', snippets: ['別の趣味'] }] },
  }
  const evidence = braveEvidence([context, other])
  assert.ok(evidence.sources.some((s) => s.claims.includes('\n別の趣味')))
  assert.ok(evidence.sources.reduce((n, s) => n + s.claims.join('').length, 0) <= 48000)
  assert.ok(
    evidence.sources.every((s) => !s.url.includes('localhost') && !s.url.endsWith('/empty')),
  )
  assert.throws(() => braveEvidence([{}]), /情報を取得できません/)
})
test('Brave pipeline uses three authenticated context calls, one tool-free Gemini call, one Routes call, ten rating lookups and ten balanced cards', async () => {
  const { context, extraction } = fixture()
  const calls = []
  const result = await runComparison({
    query,
    searchProvider: 'brave',
    braveApiKey: 'brave-secret',
    geminiApiKey: 'gemini-secret',
    routesApiKey: 'routes-secret',
    placesApiKey: 'places-secret',
    fetcher: async (url, options) => {
      calls.push(url)
      if (url.startsWith('https://api.search.brave.com/')) {
        assert.equal(options.headers['X-Subscription-Token'], 'brave-secret')
        assert.equal(options.redirect, 'manual')
        assert.equal(new URL(url).searchParams.get('search_lang'), 'jp')
        return Response.json(context)
      }
      const body = JSON.parse(options.body)
      if (url.includes('generativelanguage')) {
        assert.equal(options.headers['x-goog-api-key'], 'gemini-secret')
        assert.equal(body.tools, undefined)
        assert.equal(JSON.parse(body.contents[0].parts[0].text).conditions.targetTotal, 30)
        return Response.json(extraction)
      }
      if (url.includes('places.googleapis.com')) {
        assert.ok(calls.some((call) => call.includes('routes.googleapis.com')))
        assert.equal(options.headers['X-Goog-Api-Key'], 'places-secret')
        return Response.json({
          places: [
            {
              id: 'ChIJ_test',
              displayName: { text: body.textQuery.replace(' 東京都新宿区', '') },
              addressComponents: [
                { shortText: 'JP', types: ['country'] },
                { longText: '東京都', types: ['administrative_area_level_1'] },
                { longText: '新宿区', types: ['locality'] },
              ],
              rating: 4.3,
              userRatingCount: 128,
              googleMapsUri: 'https://maps.google.com/?cid=123',
            },
          ],
        })
      }
      assert.equal(body.destinations.length, 30)
      return Response.json(
        body.destinations.map((_, i) => ({
          originIndex: 0,
          destinationIndex: i,
          status: {},
          condition: 'ROUTE_EXISTS',
          duration: '7200s',
          distanceMeters: 100000,
        })),
      )
    },
  })
  assert.equal(calls.length, 15)
  assert.equal(result.placeRatings.matched, 10)
  assert.ok(result.spots.every((s) => s.googleRating?.count === 128))
  assert.equal(result.reports[0].braveSearchCalls, 3)
  assert.equal(result.reports[0].usage.searchCalls, 0)
  assert.equal(result.searchBackend, 'brave')
  assert.equal(result.searchAttribution, undefined)
  assert.equal(result.spots.length, 10)
  for (const hobby of drive.hobbies) assert.ok(result.spots.some((s) => s.hobby === hobby))
  assert.ok(result.spots.every((s) => s.travel.status === 'calculated'))
})
test('Brave failures and empty context stop before Gemini, never retry/fallback or leak an upstream error', async () => {
  for (const status of [401, 403, 429, 500, 200]) {
    let calls = 0
    const result = await runComparison({
      query,
      searchProvider: 'brave',
      braveApiKey: 'secret',
      geminiApiKey: 'secret',
      fetcher: async (url) => {
        assert.ok(url.includes('api.search.brave.com'))
        calls++
        return Response.json({ secret: 'private-key' }, { status })
      },
    })
    assert.equal(calls, 3)
    assert.equal(result.reports[0].state, 'failed')
    assert.equal(result.reports[0].braveSearchCalls, 3)
    assert.equal(result.spots.length, 0)
    assert.ok(!JSON.stringify(result).includes('private-key'))
  }
})
test('Gemini cannot introduce new source IDs or URLs into Brave results; old Google mode still requires attribution', () => {
  const { context, extraction } = fixture()
  const evidence = braveEvidence([context])
  assert.equal(buildGeminiEvidenceRequest(query, evidence).tools, undefined)
  const body = JSON.parse(extraction.candidates[0].content.parts[0].text)
  body.spots[0].sourceId = 'invented'
  body.spots[0].sourceUrl = 'https://example.com/shops/1'
  extraction.candidates[0].content.parts[0].text = JSON.stringify(body)
  assert.equal(
    parseComparisonResponse('gemini', extraction, query, undefined, evidence).spots.length,
    29,
  )
  assert.throws(() => parseComparisonResponse('gemini', extraction, query), /Web検索の実行/)
})

test('transport failures identify the failing service with safe diagnostics and no automatic retry', async () => {
  const { context } = fixture()
  const secret = 'private-key-or-location'
  const cases = [
    {
      make: () => new TypeError('fetch failed', { cause: { code: 'ENOTFOUND', message: secret } }),
      code: 'ENOTFOUND',
      text: /接続できません/,
    },
    {
      make: () =>
        new TypeError('fetch failed', {
          cause: new AggregateError([Object.assign(new Error(secret), { code: 'ECONNREFUSED' })]),
        }),
      code: 'ECONNREFUSED',
      text: /接続できません/,
    },
    { make: () => new DOMException(secret, 'TimeoutError'), code: 'timeout', text: /時間内に応答/ },
    { make: () => new TypeError('fetch failed'), code: 'network', text: /接続できません/ },
    { make: () => new SyntaxError(secret), code: 'invalid_response', text: /回答を読み取れません/ },
    {
      make: () => Object.assign(new Error(secret), { cause: { code: secret, errors: secret } }),
      code: 'unknown',
      text: /通信または回答/,
    },
  ]
  for (const target of ['brave', 'gemini']) {
    for (const scenario of cases) {
      let braveCalls = 0,
        geminiCalls = 0
      const result = await runComparison({
        query,
        searchProvider: 'brave',
        braveApiKey: secret,
        geminiApiKey: secret,
        routesApiKey: secret,
        fetcher: async (url) => {
          if (url.includes('api.search.brave.com')) {
            braveCalls++
            if (target === 'brave') throw scenario.make()
            return Response.json(context)
          }
          assert.ok(url.includes('generativelanguage'), 'must not call Routes on failure')
          geminiCalls++
          throw scenario.make()
        },
      })
      const report = result.reports[0]
      assert.equal(report.state, 'failed')
      assert.equal(report.errorCode, scenario.code)
      assert.match(report.error, target === 'brave' ? /^Brave検索サービス/ : /^Gemini/)
      assert.match(report.error, scenario.text)
      assert.equal(braveCalls, 3)
      assert.equal(geminiCalls, target === 'brave' ? 0 : 1)
      assert.equal(result.spots.length, 0)
      assert.ok(!JSON.stringify(result).includes(secret))
    }
  }
})
test('Brave service requires both keys and never persists context or generated search results', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'driveplus-brave-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let calls = 0
  const options = {
    directory,
    searchProvider: 'brave',
    fetcher: async () => {
      calls++
      return Response.json({}, { status: 403 })
    },
  }
  const missing = createComparison({ ...options, geminiApiKey: 'secret' })
  assert.equal(missing.status().configured, false)
  await assert.rejects(missing.search(query), /Brave SearchとGemini/)
  assert.equal(calls, 0)
  const service = createComparison({ ...options, braveApiKey: 'secret', geminiApiKey: 'secret' })
  await service.search(query)
  assert.deepEqual(readdirSync(directory), ['usage.json'])
  assert.equal(service.lastResult(), null)
  assert.doesNotMatch(
    readFileSync(join(directory, 'usage.json'), 'utf8'),
    /secret|新宿|snippets|sourceUrl/,
  )
  const sample = await runComparison({
    query,
    searchProvider: 'brave',
    demo: true,
    fetcher: () => {
      throw new Error('No network')
    },
  })
  assert.equal(sample.spots.length, 10)
  assert.equal(sample.searchAttribution, undefined)
})
test('rating success and failure keep the final cards; ledger stores counts but no Google content or secrets', async (t) => {
  const { context, extraction } = fixture()
  for (const fail of [false, true]) {
    const directory = mkdtempSync(join(tmpdir(), 'driveplus-ratings-ledger-'))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    const service = createComparison({
      directory,
      searchProvider: 'brave',
      braveApiKey: 'secret',
      geminiApiKey: 'secret',
      placesApiKey: 'secret',
      fetcher: async (url, options) => {
        if (url.includes('api.search.brave.com')) return Response.json(context)
        if (url.includes('generativelanguage')) return Response.json(extraction)
        assert.ok(url.includes('places.googleapis.com'))
        if (fail) return Response.json({ message: 'secret' }, { status: 429 })
        return Response.json({
          places: [
            {
              id: 'ChIJ_test',
              displayName: {
                text: JSON.parse(options.body).textQuery.replace(' 東京都新宿区', ''),
              },
              addressComponents: [
                { shortText: 'JP', types: ['country'] },
                { longText: '東京都', types: ['administrative_area_level_1'] },
                { longText: '新宿区', types: ['locality'] },
              ],
              rating: 4.3,
              userRatingCount: 128,
              googleMapsUri: 'https://maps.google.com/?cid=123',
              attributions: [
                { provider: 'テスト提供元', providerUri: 'https://example.com/attribution' },
              ],
            },
          ],
        })
      },
    })
    const result = await service.search(query)
    assert.equal(result.spots.length, 10)
    assert.equal(result.spots.filter((s) => s.googleRating).length, fail ? 0 : 10)
    assert.deepEqual(readdirSync(directory), ['usage.json'])
    const ledger = readFileSync(join(directory, 'usage.json'), 'utf8')
    assert.equal(JSON.parse(ledger).attempts[0].usage.placeRatings.attempted, 10)
    assert.doesNotMatch(
      ledger,
      /secret|googleRating|userRatingCount|maps.google|テスト提供元|新宿|4\.3/,
    )
    assert.equal(service.status().ratingsConfigured, true)
  }
})
test('all outstanding Brave requests settle before a failed batch releases the app lock', async () => {
  let release
  const wait = new Promise((r) => {
    release = r
  })
  let calls = 0,
    finished = false
  const pending = searchBrave(query, {
    apiKey: 'test',
    fetcher: async () => {
      calls++
      if (calls === 1) return Response.json({}, { status: 429 })
      await wait
      return Response.json(fixture().context)
    },
  }).catch(() => {
    finished = true
  })
  await new Promise((r) => setImmediate(r))
  assert.equal(finished, false)
  release()
  await pending
  assert.equal(finished, true)
})

test('Brave HTTP mode preserves token guards, hides keys, rejects retired events before usage, and returns place cards without a Google widget', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'driveplus-brave-http-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const server = createPilot({
    directory,
    demo: true,
    searchProvider: 'brave',
    braveApiKey: 'private-brave-key',
    geminiApiKey: 'private-gemini-key',
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const status = await (await fetch(`${origin}/api/comparison-status`)).json()
  assert.equal(status.searchProvider, 'brave')
  assert.equal(status.configured, true)
  assert.doesNotMatch(JSON.stringify(status), /private-brave-key|private-gemini-key/)
  const events = {
    stationId: query.stationId,
    theme: 'イベント',
    purpose: 'events',
    drive: { ...driveQuery('default', undefined, ['自然']), mode: 'events' },
    eventDates: eventDates({ mode: 'weekend', date: '' }),
  }
  const options = {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
  }
  assert.equal((await fetch(`${origin}/api/compare`, options)).status, 403)
  options.headers['X-Pilot-Token'] = status.token
  const retired = await fetch(`${origin}/api/compare`, options)
  assert.equal(retired.status, 400)
  assert.match((await retired.json()).error, /イベント検索は終了/)
  assert.equal((await (await fetch(`${origin}/api/comparison-status`)).json()).attempts.length, 0)
  options.body = JSON.stringify(query)
  const response = await fetch(`${origin}/api/compare`, options)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.spots.length, 10)
  assert.ok(result.spots.every((s) => s.event === undefined))
  assert.equal(result.searchBackend, 'brave')
  assert.equal(result.searchAttribution, undefined)
  assert.equal((await fetch(`${origin}/api/search`, options)).status, 400)
})
