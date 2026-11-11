import test from 'node:test'
import assert from 'node:assert/strict'
import { addPlaceRatings } from '../../spot-comparison/ratings.mjs'
import { decodePlaceRating } from '../../../src/domain/placeRating.ts'
import { withoutSearchCoordinates } from '../../../src/domain/discoveryLocation.ts'
import { withoutDriveTravel } from '../../../src/domain/driveSearch.ts'

const spot = { name: '架空の森カフェ 本店', area: '長野県松本市' }
function place(overrides = {}) {
  return {
    id: 'ChIJ_test_rating',
    displayName: { text: spot.name },
    addressComponents: [
      { longText: '日本', shortText: 'JP', types: ['country'] },
      { longText: '長野県', types: ['administrative_area_level_1'] },
      { longText: '松本市', types: ['locality'] },
    ],
    rating: 4.3,
    userRatingCount: 128,
    googleMapsUri: 'https://maps.google.com/?cid=123',
    attributions: [{ provider: '架空の提供元', providerUri: 'https://example.com/source' }],
    ...overrides,
  }
}

test('only unambiguous exact names and prefecture/municipality receive ratings; missing/invalid data preserves spots', async () => {
  const wrongCity = place()
  wrongCity.addressComponents[2].longText = '長野市'
  const wrongCountry = place()
  wrongCountry.addressComponents[0].shortText = 'US'
  const cases = [
    [place()],
    [wrongCity],
    [wrongCountry],
    [place({ displayName: { text: '架空の森カフェ 支店' } })],
    [place(), place({ id: 'another_id' })],
    [],
    [place({ rating: undefined })],
    [place({ userRatingCount: 0 })],
    [place({ rating: 8 })],
    [place({ id: undefined })],
    [place({ attributions: 'invalid' })],
    [place({ userRatingCount: 2.5 })],
    [place({ googleMapsUri: 'https://maps.google.com.evil.example/test' })],
    [place({ attributions: [{ provider: 'Missing link' }] })],
  ]
  for (const [index, places] of cases.entries()) {
    const result = await addPlaceRatings([spot], {
      apiKey: 'secret',
      fetcher: async (url, options) => {
        assert.equal(url, 'https://places.googleapis.com/v1/places:searchText')
        assert.equal(options.redirect, 'error')
        assert.equal(options.headers['X-Goog-Api-Key'], 'secret')
        assert.ok(options.headers['X-Goog-FieldMask'].includes('places.userRatingCount'))
        assert.ok(!options.headers['X-Goog-FieldMask'].includes('photos'))
        assert.equal(JSON.parse(options.body).textQuery, `${spot.name} ${spot.area}`)
        return Response.json({ places })
      },
    })
    assert.equal(result.spots.length, 1)
    assert.equal(Boolean(result.spots[0].googleRating), index === 0)
    assert.equal(result.usage.attempted, 1)
  }
  for (const area of ['長野県', '松本市', '取得した現在地の周辺']) {
    const r = await addPlaceRatings([{ ...spot, area }], {
      apiKey: 'secret',
      fetcher: async () => Response.json({ places: [place()] }),
    })
    assert.equal(r.spots[0].googleRating, undefined)
  }
})

test('at most ten calls, five concurrent; no calls with missing key/demo and no acceptance of injected ratings', async () => {
  const spots = Array.from({ length: 30 }, () => ({ ...spot, googleRating: { rating: 5 } }))
  let active = 0,
    maximum = 0,
    calls = 0
  const fetcher = async () => {
    calls++
    active++
    maximum = Math.max(maximum, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active--
    return Response.json({ places: [place()] })
  }
  for (const options of [{}, { demo: true, apiKey: 'secret' }]) {
    const r = await addPlaceRatings(spots, { ...options, fetcher })
    assert.equal(calls, 0)
    assert.ok(r.spots.every((s) => s.googleRating === undefined))
  }
  const r = await addPlaceRatings(spots, { apiKey: 'secret', fetcher })
  assert.equal(calls, 10)
  assert.equal(maximum, 5)
  assert.equal(r.spots.filter((s) => s.googleRating).length, 10)
  assert.equal(r.usage.skipped, 20)
})

test('errors, invalid and oversized bodies never remove candidates or disclose upstream errors; one global deadline', async () => {
  for (const fetcher of [
    async () => Response.json({ key: 'secret' }, { status: 403 }),
    async () => Response.json({}, { status: 429 }),
    async () => new Response('not json'),
    async () => new Response('x'.repeat(256001)),
    async () => {
      throw new Error('secret')
    },
    async () => new Promise(() => {}),
  ]) {
    const started = Date.now()
    const result = await addPlaceRatings([spot], { apiKey: 'secret', fetcher, timeoutMs: 25 })
    assert.deepEqual(result.spots, [spot])
    assert.equal(result.usage.failed, 1)
    assert.ok(Date.now() - started < 1000)
    assert.ok(!JSON.stringify(result).includes('secret'))
  }
  const r = await addPlaceRatings(
    Array.from({ length: 10 }, () => spot),
    { apiKey: 'secret', fetcher: async () => new Promise(() => {}), timeoutMs: 25 },
  )
  assert.equal(r.usage.attempted, 5)
  assert.equal(r.usage.skipped, 5)
})

test('expired/invalid ratings are dropped; current ratings never reach saved or history data', async () => {
  const result = await addPlaceRatings([spot], {
    apiKey: 'secret',
    fetcher: async () => Response.json({ places: [place()] }),
  })
  const rated = result.spots[0]
  assert.equal(decodePlaceRating(rated.googleRating).rating, 4.3)
  assert.equal(
    decodePlaceRating(rated.googleRating, Date.parse(rated.googleRating.expiresAt)),
    undefined,
  )
  assert.equal(
    decodePlaceRating({ ...rated.googleRating, mapsUrl: 'javascript:alert(1)' }),
    undefined,
  )
  assert.equal(decodePlaceRating({ ...rated.googleRating, count: '128' }), undefined)
  assert.deepEqual(withoutDriveTravel(rated), spot)
  for (const location of [undefined, { lat: 35.681, lng: 139.767 }]) {
    const history = withoutSearchCoordinates({
      spots: [rated],
      query: { region: '東京', theme: '自然', location },
    })
    assert.deepEqual(history.spots, [spot])
    assert.equal(history.query.location, undefined)
    assert.ok(!JSON.stringify(history).includes('maps.google.com'))
  }
})
