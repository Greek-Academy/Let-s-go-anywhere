import assert from 'node:assert/strict'
import test from 'node:test'
import { balanceHobbyCandidates, hobbyTargets } from '../../../src/domain/hobbyBalance.ts'
import { driveQuery, driveTheme } from '../../../src/domain/driveSearch.ts'
import { interests } from '../../../src/data/options.ts'
import { addDrivingTimes } from '../../spot-comparison/routes.mjs'
import {
  buildComparisonRequest,
  parseComparisonResponse,
  combineCandidates,
} from '../../spot-comparison/core.mjs'
import { comparisonSample } from '../../spot-comparison/sample.mjs'
import { runComparison } from '../../spot-comparison/providers.mjs'

const hobbies = ['自然', 'グルメ', '温泉']
const drive = driveQuery('default', undefined, hobbies)
const query = { stationId: '1130208', region: '東京都 新宿駅周辺', theme: driveTheme(drive), drive }
const counts = (spots) => hobbies.map((hobby) => spots.filter((s) => s.hobby === hobby).length)
const pool = (sizes) =>
  sizes.flatMap((size, h) =>
    Array.from({ length: size }, (_, i) => ({
      name: `${h}-${i}`,
      area: '架空',
      matchedHobbies: [hobbies[h]],
    })),
  )
const payload = (response, provider) =>
  provider === 'openai' ? response.output[1].content[0] : response.content[2]

test('three hobbies fill 4/3/3 slots in alternating order even when the input is grouped; shortage spills without duplicate places', () => {
  const original = pool([7, 6, 5])
  const snapshot = structuredClone(original)
  const result = balanceHobbyCandidates(original, hobbies)
  assert.deepEqual(counts(result), [4, 3, 3])
  assert.deepEqual(
    result.slice(0, 3).map((s) => s.hobby),
    hobbies,
  )
  assert.equal(new Set(result.map((s) => s.name)).size, 10)
  assert.deepEqual(original, snapshot)
  assert.deepEqual(counts(balanceHobbyCandidates(pool([6, 1, 7]), hobbies)), [5, 1, 4])
  assert.deepEqual(counts(balanceHobbyCandidates(pool([1, 0, 1]), hobbies)), [1, 0, 1])
  assert.deepEqual(balanceHobbyCandidates([{ name: 'unknown' }], hobbies), [])
  assert.deepEqual(balanceHobbyCandidates(original, []), original.slice(0, 10))
})

test('a multi-hobby place can move slots to preserve scarce hobbies and is never counted twice', () => {
  const candidates = [
    { name: 'A', matchedHobbies: ['自然', '温泉'] },
    { name: 'B', matchedHobbies: ['自然', 'グルメ'] },
    { name: 'C', matchedHobbies: ['グルメ'] },
  ]
  const result = balanceHobbyCandidates(candidates, hobbies)
  assert.deepEqual(counts(result), [1, 1, 1])
  assert.equal(result.find((s) => s.hobby === '温泉').name, 'A')
  assert.equal(new Set(result.map((s) => s.name)).size, 3)
  for (const s of result) assert.ok(s.matchedHobbies.includes(s.hobby))
  const all = interests.map((i) => i.name)
  const many = balanceHobbyCandidates(
    Array.from({ length: 20 }, (_, i) => ({ name: `${i}`, matchedHobbies: all })),
    all,
  )
  assert.equal(new Set(many.map((s) => s.hobby)).size, 10)
  assert.equal(new Set(many.map((s) => s.name)).size, 10)
})

test('both providers get explicit hobby targets and a restricted match schema; independent search modes get neither', () => {
  assert.deepEqual(
    hobbyTargets(hobbies).map((t) => t.count),
    [4, 3, 3],
  )
  for (const provider of ['openai', 'anthropic']) {
    const request = buildComparisonRequest(provider, query)
    const input = JSON.parse(provider === 'openai' ? request.input : request.messages[0].content)
    assert.deepEqual(input.hobbyTargets, hobbyTargets(hobbies))
    assert.match(provider === 'openai' ? request.instructions : request.system, /matchedHobbies/)
  }
  const field = buildComparisonRequest('openai', query).text.format.schema.properties.spots.items
    .properties.matchedHobbies
  assert.deepEqual(field.items.enum, hobbies)
  for (const mode of ['free', 'conditions']) {
    const d = driveQuery(mode)
    const request = buildComparisonRequest('openai', {
      ...query,
      drive: d,
      theme: driveTheme(d, '海へ'),
    })
    assert.equal(JSON.parse(request.input).hobbyTargets, undefined)
    assert.equal(
      request.text.format.schema.properties.spots.items.properties.matchedHobbies,
      undefined,
    )
  }
})

test('missing, duplicated or unselected hobby matches are excluded rather than fabricated; duplicate proposals retain both matches', () => {
  for (const provider of ['openai', 'anthropic']) {
    for (const matches of [undefined, [], ['自然', '自然'], ['買い物'], ['<script>'], '自然']) {
      const response = comparisonSample(provider, query)
      const part = payload(response, provider)
      const data = JSON.parse(part.text)
      data.spots[0].matchedHobbies = matches
      part.text = JSON.stringify(data)
      const parsed = parseComparisonResponse(provider, response, query)
      assert.equal(parsed.omitted, 1)
      assert.equal(parsed.spots.length, 9)
    }
  }
  const first = parseComparisonResponse('openai', comparisonSample('openai', query), query).spots[0]
  const other = {
    ...first,
    matchedHobbies: ['温泉'],
    recommendations: [{ provider: 'anthropic', sourceUrl: first.sourceUrl, reason: '温泉の根拠' }],
  }
  const combined = combineCandidates([{ spots: [first] }, { spots: [other] }])
  assert.equal(combined.spots.length, 1)
  assert.deepEqual(combined.spots[0].matchedHobbies, ['自然', '温泉'])
  assert.equal(combined.spots[0].recommendations.length, 2)
})

test('allocation happens after duration exclusions, so lower-ranked eligible hobbies still appear', async () => {
  const candidates = pool([7, 6, 5])
  let calls = 0
  const result = await addDrivingTimes(candidates, query, {
    apiKey: 'fixture',
    fetcher: async () => {
      calls++
      return Response.json(
        candidates.map((_, i) => ({
          destinationIndex: i,
          status: {},
          condition: 'ROUTE_EXISTS',
          duration: i < 3 ? '3600s' : '9000s',
          distanceMeters: 100000,
        })),
      )
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.excluded, 3)
  assert.deepEqual(counts(result.spots), [4, 3, 3])
  assert.ok(result.spots.every((s) => s.travel.durationSeconds === 9000))
})

test('full pipeline preserves balance with duplicates and a failed provider, without extra API calls', async () => {
  for (const failed of [null, 'anthropic']) {
    const calls = []
    const result = await runComparison({
      query,
      routesApiKey: 'fixture',
      fetcher: async (url, init) => {
        calls.push(url)
        if (url.includes('routes.googleapis.com')) {
          const body = JSON.parse(init.body)
          return Response.json(
            body.destinations.map((_, i) => ({
              destinationIndex: i,
              status: {},
              condition: 'ROUTE_EXISTS',
              duration: '9000s',
              distanceMeters: 100000,
            })),
          )
        }
        const provider = url.includes('openai') ? 'openai' : 'anthropic'
        return provider === failed
          ? new Response('', { status: 503 })
          : Response.json(comparisonSample(provider, query))
      },
    })
    assert.equal(calls.length, 3)
    assert.deepEqual(counts(result.spots), [4, 3, 3])
    assert.equal(new Set(result.spots.map((s) => s.name)).size, 10)
  }
})
