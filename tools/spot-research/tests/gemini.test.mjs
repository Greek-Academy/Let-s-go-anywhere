import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildComparisonRequest,
  parseComparisonResponse,
  comparisonUsage,
  validateComparisonQuery,
  MODELS,
} from '../../spot-comparison/core.mjs'
import { runComparison } from '../../spot-comparison/providers.mjs'
import { comparisonSample } from '../../spot-comparison/sample.mjs'
import { createComparison } from '../../spot-comparison/service.mjs'
import { createPilot } from '../server.mjs'
import { driveQuery, driveTheme } from '../../../src/domain/driveSearch.ts'
const drive = driveQuery('default', undefined, ['自然', 'グルメ', '温泉'])
const query = validateComparisonQuery({ stationId: '1130208', theme: driveTheme(drive), drive })
function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'driveplus-gemini-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('Gemini receives the same origin, hobby targets and conditions, with Google Search and structured output', () => {
  for (const q of [query, { ...query, drive: driveQuery('free'), theme: '海を見たい' }]) {
    const request = buildComparisonRequest('gemini', q)
    assert.deepEqual(
      JSON.parse(request.contents[0].parts[0].text),
      JSON.parse(buildComparisonRequest('openai', q).input),
    )
    assert.deepEqual(request.tools, [{ googleSearch: {} }])
    assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, 'minimal')
    assert.equal(request.generationConfig.responseFormat.text.schema.properties.spots.maxItems, 10)
  }
  const events = {
    ...query,
    purpose: 'events',
    theme: 'イベント',
    eventDates: { start: '2099-01-01', end: '2099-01-01' },
    drive: driveQuery('events', undefined, ['自然']),
  }
  // A current date is needed by the shared input validator.
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  events.eventDates = { start: date, end: date }
  const request = buildComparisonRequest('gemini', events)
  assert.ok(
    request.generationConfig.responseFormat.text.schema.properties.spots.items.required.includes(
      'event',
    ),
  )
  assert.equal(
    parseComparisonResponse('gemini', comparisonSample('gemini', events), events).spots.length,
    10,
  )
})

test('Gemini source verification rejects fabricated URLs and unsupported hobbies without guessing or repairing', () => {
  const response = comparisonSample('gemini', query)
  const part = response.candidates[0].content.parts[0]
  const data = JSON.parse(part.text)
  data.spots[0].sourceUrl = 'https://example.com/invented'
  data.spots[1].matchedHobbies = ['買い物']
  part.text = JSON.stringify(data)
  const result = parseComparisonResponse('gemini', response, query)
  assert.equal(result.spots.length, 8)
  assert.equal(result.omitted, 2)
  assert.ok(result.searchAttribution.html)
  assert.ok(result.spots.every((s) => s.recommendations[0].provider === 'gemini'))
})

test('Gemini requires a complete answer, actual search, attribution, and valid JSON', () => {
  for (const change of [
    (r) => {
      r.candidates[0].finishReason = 'MAX_TOKENS'
    },
    (r) => {
      r.candidates[0].groundingMetadata.webSearchQueries = []
    },
    (r) => {
      delete r.candidates[0].groundingMetadata.searchEntryPoint
    },
    (r) => {
      r.candidates[0].groundingMetadata.searchEntryPoint.renderedContent = 'x'.repeat(100001)
    },
    (r) => {
      r.candidates[0].content.parts[0].text = 'broken JSON'
    },
  ]) {
    const response = comparisonSample('gemini', query)
    change(response)
    assert.throws(() => parseComparisonResponse('gemini', response, query))
  }
})

test('Gemini sends exactly one model request then one Routes request; preserves hobby balancing and route filtering', async () => {
  const calls = []
  const result = await runComparison({
    query,
    searchProvider: 'gemini',
    geminiApiKey: 'gemini-only-test',
    routesApiKey: 'routes-only-test',
    fetcher: async (url, options) => {
      calls.push(url)
      if (url.includes('generativelanguage')) {
        assert.equal(options.headers['x-goog-api-key'], 'gemini-only-test')
        assert.equal(options.headers.Authorization, undefined)
        assert.ok(url.includes(MODELS.gemini))
        return Response.json(comparisonSample('gemini', query))
      }
      assert.ok(url.startsWith('https://routes.googleapis.com/'))
      const destinations = JSON.parse(options.body).destinations
      return Response.json(
        destinations.map((_, i) => ({
          originIndex: 0,
          destinationIndex: i,
          status: {},
          condition: 'ROUTE_EXISTS',
          duration: i === 0 ? '3600s' : '10800s',
          distanceMeters: 100000,
        })),
      )
    },
  })
  assert.equal(calls.length, 2)
  assert.equal(result.reports.length, 1)
  assert.equal(result.reports[0].state, 'completed')
  assert.equal(result.spots.length, 9)
  assert.equal(result.omitted, 1)
  assert.deepEqual(new Set(result.spots.map((s) => s.hobby)), new Set(drive.hobbies))
  assert.ok(result.spots.every((s) => s.travel.status === 'calculated'))
})

test('Gemini failures do not retry, fall back to another provider or call Routes; errors never echo keys', async () => {
  for (const status of [400, 401, 402, 403, 429, 500]) {
    let calls = 0
    const result = await runComparison({
      query,
      searchProvider: 'gemini',
      geminiApiKey: 'private-test-key',
      routesApiKey: 'private-route-key',
      fetcher: async () => {
        calls++
        return Response.json({ error: { message: 'private-test-key' } }, { status })
      },
    })
    assert.equal(calls, 1)
    assert.equal(result.spots.length, 0)
    assert.equal(result.reports[0].state, 'failed')
    assert.ok(!JSON.stringify(result).includes('private-test-key'))
    if (status === 402) assert.match(result.reports[0].error, /クレジット/)
  }
  let calls = 0
  const failed = await runComparison({
    query,
    searchProvider: 'gemini',
    geminiApiKey: 'key',
    fetcher: async () => {
      calls++
      throw new Error('secret timeout detail')
    },
  })
  assert.equal(calls, 1)
  assert.equal(failed.reports[0].state, 'failed')
  assert.ok(!JSON.stringify(failed).includes('secret timeout detail'))
})

test('usage keeps token counts including thoughts but does not manufacture a zero cost', () => {
  const response = comparisonSample('gemini', query)
  response.usageMetadata = {
    promptTokenCount: 500,
    candidatesTokenCount: 700,
    thoughtsTokenCount: 10,
  }
  assert.deepEqual(comparisonUsage('gemini', response), {
    inputTokens: 500,
    outputTokens: 710,
    searchCalls: 1,
    estimatedUsd: null,
    pricingDate: null,
  })
  response.usageMetadata.promptTokenCount = -1
  assert.equal(comparisonUsage('gemini', response), null)
})

test('Gemini requires only its own key; never stores results or suggestions or reads old comparison cache', async (t) => {
  const dir = directory(t)
  const old = JSON.stringify({ privateOldResult: true })
  writeFileSync(join(dir, 'result.json'), old)
  const service = createComparison({
    directory: dir,
    searchProvider: 'gemini',
    geminiApiKey: 'test-key',
    fetcher: async () => Response.json(comparisonSample('gemini', query)),
  })
  assert.equal(service.status().configured, true)
  assert.deepEqual(
    service.status().providers.map((p) => p.provider),
    ['gemini'],
  )
  assert.equal(service.status().maxSearchesPerProvider, null)
  assert.equal(service.lastResult(), null)
  const result = await service.search(query)
  assert.equal(result.reports[0].state, 'completed')
  assert.equal(service.lastResult(), null)
  assert.equal(readFileSync(join(dir, 'result.json'), 'utf8'), old)
  assert.equal(service.status().attempts.length, 1)
  assert.ok(!JSON.stringify(service.status()).includes('test-key'))
  for (const file of readdirSync(dir))
    assert.ok(!readFileSync(join(dir, file), 'utf8').includes('renderedContent'))
  assert.equal(service.status().busy, false)
})

test('missing key and unknown provider fail before sending requests or reserving an attempt', async (t) => {
  let calls = 0
  const options = {
    directory: directory(t),
    searchProvider: 'gemini',
    fetcher: async () => {
      calls++
      throw new Error('unexpected network')
    },
  }
  const service = createComparison(options)
  assert.equal(service.status().configured, false)
  await assert.rejects(service.search(query), /GeminiのAPIキー/)
  assert.equal(service.status().attempts.length, 0)
  assert.equal(calls, 0)
  assert.throws(() => createComparison({ ...options, searchProvider: 'unknown' }))
})

test('Gemini HTTP server advertises the mode, handles a compare request and refuses the legacy endpoint', async (t) => {
  const server = createPilot({ directory: directory(t), demo: true, searchProvider: 'gemini' })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const origin = `http://127.0.0.1:${server.address().port}`
  const status = await (await fetch(`${origin}/api/comparison-status`)).json()
  assert.equal(status.searchProvider, 'gemini')
  const options = {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Pilot-Token': status.token },
    body: JSON.stringify(query),
  }
  const response = await fetch(`${origin}/api/compare`, options)
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.reports[0].provider, 'gemini')
  assert.equal(data.spots.length, 10)
  assert.equal((await fetch(`${origin}/api/last-comparison`)).status, 404)
  assert.equal((await fetch(`${origin}/api/search`, options)).status, 400)
})
