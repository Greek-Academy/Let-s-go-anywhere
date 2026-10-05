import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPilot } from '../server.mjs'
import { Ledger } from '../ledger.mjs'
import { createComparison } from '../../spot-comparison/service.mjs'
import {
  buildComparisonRequest,
  validateComparisonQuery,
  parseComparisonResponse,
  combineCandidates,
  comparisonUsage,
  sourceUrl,
} from '../../spot-comparison/core.mjs'
import { comparisonSample } from '../../spot-comparison/sample.mjs'
const query = { region: '京都府', theme: '自然とカフェ' }
const directory = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'driveplus-comparison-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}
const options = (t) => ({
  directory: directory(t),
  demo: false,
  apiKey: 'test-openai',
  anthropicApiKey: 'test-anthropic',
  timeoutMs: 1000,
})
function fakeFetch(url) {
  return Promise.resolve(
    Response.json(comparisonSample(url.includes('anthropic') ? 'anthropic' : 'openai', query)),
  )
}

test('same conditions, at most two searches per provider and no hidden format-repair call', () => {
  const q = validateComparisonQuery(query)
  const o = buildComparisonRequest('openai', q),
    a = buildComparisonRequest('anthropic', q)
  assert.deepEqual(JSON.parse(o.input), JSON.parse(a.messages[0].content))
  assert.equal(o.store, false)
  assert.equal(o.max_tool_calls, 2)
  assert.equal(a.tools[0].max_uses, 2)
  assert.equal(o.max_output_tokens, 6000)
  assert.equal(a.max_tokens, 6000)
  assert.equal(a.output_config, undefined) // citations + strict JSON is unsupported
  for (const bad of [
    null,
    { ...query, region: 'all' },
    { ...query, theme: 'x'.repeat(81) },
    { ...query, privateNote: 'secret' },
  ])
    assert.throws(() => validateComparisonQuery(bad))
})
test('public sources only; fabricated source URLs are dropped for both providers', () => {
  for (const bad of [
    'http://example.com',
    'https://127.0.0.1',
    'https://[::1]',
    'https://localhost',
    'https://router.lan',
    'https://x:secret@example.com',
    'https://example.com/%0a',
    'https://examp le.com',
  ]) {
    assert.equal(sourceUrl(bad), null)
  }
  assert.equal(sourceUrl('https://example.com:444/a'), null)
  for (const provider of ['openai', 'anthropic']) {
    const response = comparisonSample(provider, query)
    const part = provider === 'openai' ? response.output[1].content[0] : response.content[2]
    const data = JSON.parse(part.text)
    data.spots[0].sourceUrl = 'https://invented-shop.example.com/no-evidence'
    part.text = JSON.stringify(data)
    const result = parseComparisonResponse(provider, response)
    assert.equal(result.spots.length, 9)
    assert.equal(result.omitted, 1)
    assert.equal(result.spots[0].verification, 'unconfirmed')
  }
})
test('Claude pause_turn, search errors and invalid JSON fail without continuing; empty response remains empty', () => {
  const original = comparisonSample('anthropic', query)
  for (const stop_reason of ['pause_turn', 'max_tokens', 'refusal'])
    assert.throws(() => parseComparisonResponse('anthropic', { ...original, stop_reason }))
  const error = structuredClone(original)
  error.content[1].content = { type: 'web_search_tool_result_error', error_code: 'unavailable' }
  assert.throws(() => parseComparisonResponse('anthropic', error), /実行を確認/)
  const invalid = structuredClone(original)
  invalid.content[2].text = 'not JSON'
  assert.throws(() => parseComparisonResponse('anthropic', invalid), /回答形式/)
  original.content[2].text = '```json\n{"spots":[]}\n```'
  assert.deepEqual(parseComparisonResponse('anthropic', original), { spots: [], omitted: 0 })
})
test('Claude preamble and inline citation markers are parsed locally, retaining source validation', () => {
  const response = comparisonSample('anthropic', query)
  const data = JSON.parse(response.content[2].text)
  data.spots[0].summary = '<cite index="1-2">架空の庭に面したカフェ</cite>。'
  data.spots[1].sourceUrl = 'https://invented-shop.example.com/unverified'
  response.content[2].text = `候補をまとめました。\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\``
  const result = parseComparisonResponse('anthropic', response)
  assert.equal(result.spots.length, 9)
  assert.equal(result.omitted, 1)
  assert.equal(result.spots[0].summary, '架空の庭に面したカフェ。')
  assert.equal(result.spots[0].sourceUrl, data.spots[0].sourceUrl)
  assert.equal(result.spots[0].verification, 'unconfirmed')
})
test('Claude malformed, multiple or ambiguous blocks fail; arbitrary markup is not displayed', () => {
  const response = comparisonSample('anthropic', query)
  for (const text of [
    '説明\n```json\n{"spots": [}\n```',
    '```json\n{"spots": []}\n```\n```json\n{"spots": []}\n```',
    '{"spots": []}\n```json\n{"spots": []}\n```',
    '```json\n{"spots": []}\n```\n追加のJSON: {"spots": []}',
  ]) {
    response.content[2].text = text
    assert.throws(() => parseComparisonResponse('anthropic', response), /回答形式/)
  }
  const clean = comparisonSample('anthropic', query)
  const data = JSON.parse(clean.content[2].text)
  data.spots[0].summary = '<script>unexpected markup</script>'
  clean.content[2].text = JSON.stringify(data)
  const parsed = parseComparisonResponse('anthropic', clean)
  assert.equal(parsed.spots.length, 9)
  assert.equal(parsed.omitted, 1)
})
test('combine preserves both reasons, keeps same-page different shops and distinct branches', () => {
  const results = ['openai', 'anthropic'].map((p) =>
    parseComparisonResponse(p, comparisonSample(p, query)),
  )
  const combined = combineCandidates(results)
  assert.equal(combined.spots.length, 18)
  assert.equal(combined.duplicates, 2)
  assert.equal(combined.spots[0].recommendations.length, 2)
  assert.equal(combined.spots[0].recommendations[1].provider, 'anthropic')
  const branch = structuredClone(results[0].spots[0])
  branch.name += '別支店'
  assert.equal(combineCandidates([{ spots: [results[0].spots[0], branch] }]).spots.length, 2)
})
test('reviewed area/address variants merge while retaining both providers; same-name branches remain separate', () => {
  const template = parseComparisonResponse('openai', comparisonSample('openai', query)).spots[0]
  const a = {
    ...template,
    name: '茂庵',
    area: '左京区 吉田山付近',
    sourceUrl: 'https://ja.kyoto.travel/tourism/single01.php?category_id=4&tourism_id=2861',
  }
  a.recommendations = [{ provider: 'openai', sourceUrl: a.sourceUrl, reason: '理由A' }]
  const b = {
    ...a,
    area: '京都市左京区吉田神楽岡町８',
    sourceUrl: 'https://icotto.jp/presses/18579',
  }
  b.recommendations = [{ provider: 'anthropic', sourceUrl: b.sourceUrl, reason: '理由B' }]
  const merged = combineCandidates([{ spots: [a] }, { spots: [b] }])
  assert.equal(merged.spots.length, 1)
  assert.equal(merged.duplicates, 1)
  assert.deepEqual(merged.spots[0].recommendations, [...a.recommendations, ...b.recommendations])
  assert.equal(a.recommendations.length, 1)
  for (const other of [
    { ...b, name: '茂庵 別支店' },
    { ...b, area: '京都市左京区吉田神楽岡町99' },
    { ...b, area: '京都市右京区' },
    { ...b, sourceUrl: 'https://unreviewed.example.com/shop' },
    { ...b, name: '同名チェーン', sourceUrl: a.sourceUrl },
  ])
    assert.equal(combineCandidates([{ spots: [a, other] }]).spots.length, 2)
  const chain = { ...a, name: '同名チェーン' }
  assert.equal(
    combineCandidates([{ spots: [chain, { ...chain, area: '京都市左京区別町10' }] }]).spots.length,
    2,
  )
})
test('cached results with more than ten cards regroup without rewriting the cache or spending a request', (t) => {
  const opt = options(t)
  const results = ['openai', 'anthropic'].map((p) =>
    parseComparisonResponse(p, comparisonSample(p, query)),
  )
  const input = { kind: 'comparison', ...combineCandidates(results) }
  input.spots.push(structuredClone(input.spots[0]))
  const file = join(opt.directory, 'result.json')
  writeFileSync(file, JSON.stringify(input))
  const original = readFileSync(file)
  const service = createComparison({
    ...opt,
    fetcher: () => assert.fail('no API during regrouping'),
  })
  for (let i = 0; i < 2; i++) {
    assert.equal(service.lastResult().spots.length, 18)
    assert.equal(service.lastResult().duplicates, 3)
    assert.equal(service.status().attempts.length, 0)
  }
  assert.deepEqual(readFileSync(file), original)
})
test('Claude usage includes search, cache and tokens; absent usage never becomes zero', () => {
  assert.equal(comparisonUsage('anthropic', {}), null)
  const usage = comparisonUsage('anthropic', {
    usage: {
      input_tokens: 1000,
      output_tokens: 2000,
      cache_read_input_tokens: 500,
      cache_creation_input_tokens: 100,
      server_tool_use: { web_search_requests: 2 },
    },
  })
  assert.equal(usage.estimatedUsd, 0.031175)
})
test('one pair is reserved before either provider call, survives restart and leaves the old ledger untouched', async (t) => {
  const opt = options(t)
  const old = new Ledger(join(opt.directory, '..', 'old-' + opt.directory.split('/').pop()))
  t.after(() => rmSync(old.directory, { recursive: true, force: true }))
  old.reserve()
  let calls = 0
  const fetcher = (url) => {
    calls++
    assert.equal(new Ledger(opt.directory, 1).read().attempts.length, 1)
    return fakeFetch(url)
  }
  const service = createComparison({ ...opt, fetcher })
  const result = await service.search(query)
  assert.equal(result.spots.length, 18)
  await assert.rejects(createComparison({ ...opt, fetcher }).search(query), /1回まで/)
  assert.equal(calls, 2)
  const cached = createComparison({
    ...opt,
    fetcher: () => assert.fail('cached read must never call API'),
  }).lastResult()
  assert.deepEqual(cached, result)
  assert.equal(old.read().attempts.length, 1)
})
test('missing second key prevents both charges; failure of one provider preserves the other and is not retried', async (t) => {
  const opt = options(t)
  let calls = 0
  await assert.rejects(
    createComparison({
      ...opt,
      anthropicApiKey: '',
      fetcher: () => {
        calls++
      },
    }).search(query),
    /両方/,
  )
  assert.equal(calls, 0)
  assert.equal(existsSync(join(opt.directory, 'usage.json')), false)
  const service = createComparison({
    ...opt,
    fetcher: (url) => {
      calls++
      return url.includes('anthropic')
        ? Promise.resolve(new Response('private upstream details test-anthropic', { status: 401 }))
        : fakeFetch(url)
    },
  })
  const result = await service.search(query)
  assert.equal(result.spots.length, 10)
  assert.deepEqual(
    result.reports.map((r) => r.state),
    ['completed', 'failed'],
  )
  assert.equal(result.reports[1].usage, null)
  assert.equal(JSON.stringify(result).includes('test-anthropic'), false)
  assert.equal(calls, 2)
  assert.equal(service.status().attempts[0].state, 'failed')
})
test('concurrent requests and provider exceptions cannot retry, leak secrets, or reset spent count', async (t) => {
  const opt = options(t)
  let release,
    calls = 0
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const service = createComparison({
    ...opt,
    fetcher: async () => {
      calls++
      await gate
      throw new Error('secret-test-anthropic')
    },
  })
  const pending = service.search(query)
  await assert.rejects(service.search(query), /比較検索中/)
  release()
  const result = await pending
  assert.equal(calls, 2)
  assert.equal(JSON.stringify(result).includes('secret-test'), false)
  assert.equal(result.spots.length, 0)
  await assert.rejects(service.search(query), /1回まで/)
})
test('HTTP demo goes through new origin/token guards and parser without a key or network', async (t) => {
  const dir = directory(t)
  const app = createPilot({
    demo: true,
    directory: dir,
    fetcher: () => assert.fail('network forbidden'),
  })
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    app.closeAllConnections()
    app.close()
  })
  const origin = `http://127.0.0.1:${app.address().port}`
  const status = await fetch(origin + '/api/comparison-status').then((r) => r.json())
  const post = (headers = {}) =>
    fetch(origin + '/api/compare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'X-Pilot-Token': status.token,
        ...headers,
      },
      body: JSON.stringify(query),
    })
  assert.equal((await post({ Origin: 'https://evil.example' })).status, 403)
  assert.equal((await post({ 'X-Pilot-Token': '' })).status, 403)
  const result = await post().then((r) => r.json())
  assert.equal((await fetch(origin + '/api/comparison-result')).status, 403)
  const cached = await fetch(origin + '/api/comparison-result', {
    headers: { 'X-Pilot-Token': status.token },
  }).then((r) => r.json())
  assert.deepEqual(cached, result)
  assert.equal(result.mode, 'sample')
  assert.equal(result.spots.length, 18)
  assert.equal(existsSync(join(dir, 'comparison-v1', 'usage.json')), false)
})
