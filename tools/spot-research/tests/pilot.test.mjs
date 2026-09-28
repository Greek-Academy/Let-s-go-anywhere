import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildRequest,
  parseResponse,
  measureUsage,
  validateQuery,
  safeSourceUrl,
} from '../core.mjs'
import { sampleResponse } from '../sample.mjs'
import { Ledger } from '../ledger.mjs'
import { createPilot } from '../server.mjs'
import { get } from 'node:http'

const query = { region: '京都市', theme: '自然とカフェ' }
function directory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'driveplus-search-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
async function server(t, options = {}) {
  const dir = directory(t)
  const app = createPilot({ directory: dir, ...options })
  await new Promise((r) => app.listen(0, '127.0.0.1', r))
  t.after(
    () =>
      new Promise((r) => {
        app.close(r)
        app.closeAllConnections()
      }),
  )
  const origin = `http://127.0.0.1:${app.address().port}`
  const status = await fetch(origin + '/api/status').then((r) => r.json())
  const post = (value = query, headers = {}) =>
    fetch(origin + '/api/search', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Pilot-Token': status.token,
        ...headers,
      },
      body: JSON.stringify(value),
    })
  return { origin, post, dir, app }
}

test('one bounded search, non-persistent response and only region/theme in API input', () => {
  const request = buildRequest(validateQuery({ ...query, privateNote: 'NEVER SEND' }))
  assert.equal(request.max_tool_calls, 1)
  assert.equal(request.max_output_tokens, 6000)
  assert.equal(request.store, false)
  assert.equal(request.tool_choice, 'required')
  assert.deepEqual(JSON.parse(request.input), query)
  assert.deepEqual(request.tools[0].filters.allowed_domains, ['kyoto.travel'])
})
test('invalid regions, blank/long text and controls are rejected', () => {
  for (const input of [
    null,
    { ...query, region: '東京' },
    { ...query, theme: ' ' },
    { ...query, theme: 'a'.repeat(81) },
    { ...query, theme: 'a\nb' },
  ])
    assert.throws(() => validateQuery(input))
})
test('sources require HTTPS, no credentials and the exact allowed domain boundary', () => {
  for (const url of [
    'javascript:alert(1)',
    'https://kyoto.travel.evil.com/a',
    'https://kyoto.travel@evil.com',
    'https://x:secret@kyoto.travel/',
    'http://kyoto.travel/',
    'https://127.0.0.1/',
    'https://kyoto.travel:444/',
  ])
    assert.equal(safeSourceUrl(url), null)
  assert.equal(safeSourceUrl('https://kyoto.travel/en/#part'), 'https://kyoto.travel/en/')
})
test('AI cannot invent a citation; unsupported candidates and duplicate names are omitted', () => {
  const r = sampleResponse()
  const part = r.output[1].content[0]
  const parsed = JSON.parse(part.text)
  parsed.spots[1].sourceUrl = 'https://kyoto.travel/fabricated-path'
  parsed.spots[2].name = parsed.spots[0].name
  part.text = JSON.stringify(parsed)
  const result = parseResponse(r)
  assert.equal(result.spots.length, 1)
  assert.equal(result.omitted, 2)
  assert.equal(result.spots[0].verification, 'unconfirmed')
  assert.equal(result.spots[0].unknowns.length, 4)
})
test('empty results are genuine; incomplete, no search, invalid JSON and refusals fail', () => {
  const empty = sampleResponse()
  empty.output[1].content[0].text = '{"spots":[]}'
  assert.deepEqual(parseResponse(empty), { spots: [], omitted: 0 })
  const incomplete = sampleResponse()
  incomplete.status = 'incomplete'
  const missingSearch = sampleResponse()
  missingSearch.output.shift()
  const invalid = sampleResponse()
  invalid.output[1].content[0].text = 'not json'
  const refusal = sampleResponse()
  refusal.output[1].content = [{ type: 'refusal' }]
  for (const r of [incomplete, missingSearch, invalid, refusal])
    assert.throws(() => parseResponse(r))
})
test('usage calculation counts billable search and cached/uncached tokens without claiming an invoice', () => {
  const r = sampleResponse()
  assert.equal(measureUsage(r).estimatedUsd, 0.0124)
  r.usage.input_tokens_details.cached_tokens = 2000
  assert.equal(measureUsage(r).estimatedUsd, 0.01195)
  delete r.usage
  assert.equal(measureUsage(r), null)
})
test('ledger keeps reservations across restarts and refuses a fourth attempt', (t) => {
  const dir = directory(t)
  new Ledger(dir).reserve()
  const next = new Ledger(dir)
  next.reserve()
  next.reserve()
  assert.throws(() => new Ledger(dir).reserve(), /3回/)
  assert.equal(next.read().attempts.length, 3)
})
test('corrupt or locked ledger fails closed without resetting usage', (t) => {
  const dir = directory(t)
  writeFileSync(join(dir, 'usage.json'), 'corrupted')
  assert.throws(() => new Ledger(dir).reserve(), /記録を読めません/)
  assert.equal(readFileSync(join(dir, 'usage.json'), 'utf8'), 'corrupted')
  writeFileSync(join(dir, 'usage.lock'), '')
  assert.throws(() => new Ledger(dir).reserve(), /記録中/)
})
test('demo never calls the provider, reads a key or creates a live ledger', async (t) => {
  const s = await server(t, { demo: true, fetcher: () => assert.fail('network forbidden') })
  const result = await s.post().then((r) => r.json())
  assert.equal(result.mode, 'sample')
  assert.equal(result.usage, null)
  assert.equal(result.spots.length, 3)
  assert.equal(existsSync(join(s.dir, 'usage.json')), false)
})
test('missing key, cross-origin request, missing token and invalid query spend nothing', async (t) => {
  const s = await server(t, { fetcher: () => assert.fail('network forbidden') })
  assert.equal((await s.post()).status, 503)
  assert.equal((await s.post(query, { Origin: 'https://attacker.example' })).status, 403)
  assert.equal((await s.post(query, { 'X-Pilot-Token': '' })).status, 403)
  assert.equal((await s.post({ ...query, region: '東京' })).status, 400)
  assert.equal(existsSync(join(s.dir, 'usage.json')), false)
  const hostStatus = await new Promise((resolve, reject) => {
    get(s.origin + '/api/status', { headers: { Host: 'attacker.example' } }, (response) => {
      response.resume()
      resolve(response.statusCode)
    }).on('error', reject)
  })
  assert.equal(hostStatus, 403)
})
test('only an explicit POST spends a request; key stays server-side, fourth request stops', async (t) => {
  let calls = 0
  const key = 'test-secret-key-must-not-leak'
  const s = await server(t, {
    apiKey: key,
    fetcher: async (url, options) => {
      calls++
      assert.equal(url, 'https://api.openai.com/v1/responses')
      assert.equal(options.headers.Authorization, `Bearer ${key}`)
      assert.equal(JSON.parse(options.body).max_tool_calls, 1)
      return Response.json(sampleResponse())
    },
  })
  for (const path of [
    '/',
    '/app.js',
    '/api/status',
    '/.env.research.local',
    '/server.mjs',
    '/../../.env.research.local',
  ]) {
    const text = await fetch(s.origin + path).then((r) => r.text())
    assert.ok(!text.includes(key))
  }
  assert.equal(calls, 0)
  for (let i = 0; i < 3; i++) {
    const r = await s.post()
    assert.equal(r.status, 200)
    assert.ok(!(await r.text()).includes(key))
  }
  assert.equal((await s.post()).status, 429)
  assert.equal(calls, 3)
  assert.ok(!readFileSync(join(s.dir, 'usage.json'), 'utf8').includes(key))
})
test('provider errors do not retry or echo secrets and remain in the ledger', async (t) => {
  let calls = 0
  const s = await server(t, {
    apiKey: 'secret',
    fetcher: async () => {
      calls++
      return new Response('secret upstream details', { status: 429 })
    },
  })
  const r = await s.post()
  assert.equal(r.status, 502)
  assert.ok(!(await r.text()).includes('secret'))
  assert.equal(calls, 1)
  assert.equal(new Ledger(s.dir).read().attempts[0].state, 'failed')
  assert.equal(new Ledger(s.dir).read().attempts[0].usage, null)
})
test('timeout counts as an attempt; double submit does not create a second paid request', async (t) => {
  let called
  const started = new Promise((r) => {
    called = r
  })
  const s = await server(t, {
    apiKey: 'secret',
    timeoutMs: 80,
    fetcher: async (_, { signal }) => {
      called()
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('timeout'))),
      )
    },
  })
  const first = s.post()
  await started
  assert.equal((await s.post()).status, 409)
  assert.equal((await first).status, 502)
  assert.equal(new Ledger(s.dir).read().attempts.length, 1)
})
test('incomplete provider output keeps known usage but never displays fabricated fallback cards', async (t) => {
  const r = sampleResponse()
  r.status = 'incomplete'
  const s = await server(t, { apiKey: 'secret', fetcher: async () => Response.json(r) })
  const response = await s.post()
  assert.equal(response.status, 502)
  assert.equal((await response.json()).spots, undefined)
  assert.equal(new Ledger(s.dir).read().attempts[0].usage.estimatedUsd, 0.0124)
})
