import { eventDates } from '../../../src/domain/eventSearch.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { addDrivingTimes } from '../../spot-comparison/routes.mjs'
import {
  validateComparisonQuery,
  buildComparisonRequest,
  driveCandidateText,
  parseComparisonResponse,
} from '../../spot-comparison/core.mjs'
import { comparisonSample } from '../../spot-comparison/sample.mjs'
import { runComparison } from '../../spot-comparison/providers.mjs'
import {
  driveQuery,
  driveTheme,
  emptyDriveChoices,
  decodeDriveQuery,
  decodeDriveTravel,
} from '../../../src/domain/driveSearch.ts'
import { withoutSearchCoordinates } from '../../../src/domain/discoveryLocation.ts'

const query = (mode = 'default', changes = {}) => {
  const drive = driveQuery(mode, { ...emptyDriveChoices(), ...changes }, ['音楽'])
  return {
    region: '取得した現在地の周辺',
    location: { lat: 35.691, lng: 139.7 },
    theme: driveTheme(drive, '海辺のカフェ'),
    drive,
    ...(mode === 'events'
      ? { purpose: 'events', eventDates: eventDates({ mode: 'today', date: '' }) }
      : {}),
  }
}
const spots = Array.from({ length: 20 }, (_, i) => ({ name: '架空の候補' + i, area: '検証エリア' }))
const row = (i, seconds = 9000) => ({
  originIndex: 0,
  destinationIndex: i,
  status: {},
  condition: 'ROUTE_EXISTS',
  duration: seconds + 's',
  distanceMeters: 100000,
})
const ok = (data) => new Response(JSON.stringify(data))
test('drive modes are independently validated and expand beyond the former 2km walking area', () => {
  for (const mode of ['default', 'free', 'conditions', 'events']) {
    const q = query(mode, { activities: ['夜景を見たい'], road: '高速道路を走りたい' })
    assert.deepEqual(validateComparisonQuery(q), q)
    const prompt = JSON.stringify(buildComparisonRequest('openai', q))
    assert.match(prompt, /Do not use a 2 km radius/)
    assert.match(prompt, /oneWayMinutes/)
    if (mode !== 'conditions') assert.deepEqual(q.drive.activities, [])
    assert.deepEqual(q.drive.hobbies, ['default', 'events'].includes(mode) ? ['音楽'] : [])
  }
  assert.throws(() => decodeDriveQuery({ ...driveQuery('free'), hobbies: ['自然'] }))
  assert.throws(() => decodeDriveQuery({ ...driveQuery('default'), road: '一般道でゆっくり' }))
  assert.throws(() => validateComparisonQuery({ ...query('events'), purpose: 'places' }))
  assert.throws(() => validateComparisonQuery({ ...query(), privateMemo: 'private' }))
})
test('both providers receive the chosen hobbies for the home, while free and condition searches stay independent', () => {
  for (const hobbies of [[], ['自然', '温泉']]) {
    const drive = driveQuery('default', undefined, hobbies)
    const q = { ...query(), drive }
    const openai = buildComparisonRequest('openai', q)
    const anthropic = buildComparisonRequest('anthropic', q)
    const input = JSON.parse(openai.input)
    assert.deepEqual(input.drive.hobbies, hobbies)
    assert.deepEqual(JSON.parse(anthropic.messages[0].content), input)
    assert.deepEqual(input.approximateCurrentLocation, { latitude: 35.691, longitude: 139.7 })
    assert.match(openai.instructions, /For mode default, use the supplied hobbies/)
    assert.deepEqual(decodeDriveQuery(drive), drive)
  }
  for (const mode of ['free', 'conditions']) {
    assert.deepEqual(driveQuery(mode, undefined, ['自然']).hobbies, [])
    assert.throws(() => decodeDriveQuery({ ...driveQuery(mode), hobbies: ['自然'] }))
  }
  assert.throws(() => decodeDriveQuery({ ...driveQuery('default'), hobbies: ['not-a-hobby'] }))
})
test('one bounded matrix call uses only rounded origin, candidate addresses and requested road modifier', async () => {
  const q = query('conditions', { road: '一般道でゆっくり' })
  let calls = 0
  const result = await addDrivingTimes(spots, q, {
    apiKey: 'fixture',
    fetcher: async (url, options) => {
      calls++
      assert.equal(url, 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix')
      assert.equal(options.headers['X-Goog-Api-Key'], 'fixture')
      const body = JSON.parse(options.body)
      assert.equal(body.destinations.length, 20)
      assert.equal(body.routingPreference, 'TRAFFIC_UNAWARE')
      assert.equal(body.origins[0].routeModifiers.avoidHighways, true)
      assert.deepEqual(body.origins[0].waypoint.location.latLng, {
        latitude: 35.691,
        longitude: 139.7,
      })
      return ok(spots.map((_, i) => row(i)).reverse())
    },
  })
  assert.equal(calls, 1)
  assert.equal(result.spots.length, 10)
  assert.equal(result.spots[0].travel.status, 'calculated')
})
test('AI duration prose is removed before display/storage while Google times remain separate', () => {
  const description = '自然景観とドライブの両方を楽しめます。'
  for (const claim of [
    '東京から約2時間でアクセス。',
    '車で２時間半。',
    '約1.5時間の移動。',
    '半日で到着。',
    '車で三十分。',
  ])
    assert.equal(driveCandidateText(claim + description), description)
  assert.equal(
    driveCandidateText('自然の景色と温泉を楽しめます。'),
    '自然の景色と温泉を楽しめます。',
  )
  assert.equal(driveCandidateText('東京から約2時間。'), '詳しい特徴は出典で確認してください。')
  const q = query()
  const response = comparisonSample('openai', q)
  const output = response.output
    .find((item) => item.type === 'message')
    .content.find((item) => item.type === 'output_text')
  const json = JSON.parse(output.text)
  json.spots[0].summary = '東京から約2時間でアクセス。' + description
  json.spots[0].matchReason = '車で２時間。' + description
  output.text = JSON.stringify(json)
  const spot = parseComparisonResponse('openai', response, q).spots[0]
  assert.equal(spot.summary, description)
  assert.equal(spot.matchReason, description)
  assert.equal(spot.recommendations[0].reason, description)
})
test('time boundaries are inclusive; missing routes stay unconfirmed and out-of-range routes are excluded', async () => {
  const result = await addDrivingTimes(spots.slice(0, 6), query(), {
    apiKey: 'fixture',
    fetcher: async () =>
      ok([
        row(0, 7199),
        row(1, 7200),
        row(2, 18000),
        row(3, 18001),
        { ...row(4), status: { code: 5 } },
      ]),
  })
  assert.equal(result.excluded, 2)
  assert.deepEqual(
    result.spots.map((s) => s.name),
    [1, 2, 4, 5].map((i) => '架空の候補' + i),
  )
  assert.deepEqual(
    result.spots.slice(2).map((s) => s.travel),
    [{ status: 'unconfirmed' }, { status: 'unconfirmed' }],
  )
})
test('no key never calls Google; provider errors, duplicate indices and invalid replies cannot invent a time or retry', async () => {
  const noKey = await addDrivingTimes(spots, query(), { fetcher: () => assert.fail('no network') })
  assert.equal(noKey.spots.length, 10)
  assert.ok(noKey.spots.every((s) => s.travel.status === 'unconfirmed'))
  for (const response of [
    new Response('', { status: 403 }),
    ok([row(0), row(0)]),
    ok([row(99)]),
    ok({ duration: '1s' }),
  ]) {
    let calls = 0
    const r = await addDrivingTimes(spots, query(), {
      apiKey: 'fixture',
      fetcher: async () => {
        calls++
        return response
      },
    })
    assert.equal(calls, 1)
    assert.ok(r.spots.every((s) => s.travel.status === 'unconfirmed'))
  }
})
test('samples are labelled and no coordinates or route data enter persisted search results, including station searches', async () => {
  const q = query()
  const result = await runComparison({
    query: q,
    demo: true,
    fetcher: () => assert.fail('no external API'),
  })
  assert.equal(result.spots.length, 10)
  assert.ok(result.spots.every((s) => s.travel.status === 'sample'))
  const stored = withoutSearchCoordinates(result)
  assert.equal(stored.query.location, undefined)
  assert.ok(stored.query.locationSearch)
  assert.ok(stored.spots.every((s) => !('travel' in s)))
  assert.ok(result.spots[0].travel)
  const station = withoutSearchCoordinates({
    ...result,
    query: { region: '東京都 新宿駅周辺', theme: '試験', stationId: '1130208' },
  })
  assert.ok(station.spots.every((s) => !('travel' in s)))
  assert.throws(() => decodeDriveTravel(result.spots[0].travel, 'live'))
  assert.throws(() => decodeDriveTravel({ ...result.spots[0].travel, checkedAt: 42 }, 'sample'))
})
