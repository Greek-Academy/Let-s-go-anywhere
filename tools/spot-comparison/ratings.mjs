import { decodePlaceRating } from '../../src/domain/placeRating.ts'
import municipalityData from './gsi-municipalities.json' with { type: 'json' }

const endpoint = 'https://places.googleapis.com/v1/places:searchText'
const fields =
  'places.id,places.displayName,places.addressComponents,places.location,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.attributions'
const normalize = (s) =>
  typeof s === 'string'
    ? s
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s・「」『』]/gu, '')
    : ''

function address(place) {
  const components = Array.isArray(place?.addressComponents) ? place.addressComponents : []
  const part = (type) => components.find((c) => Array.isArray(c?.types) && c.types.includes(type))
  return {
    country: part('country')?.shortText,
    prefecture: normalize(part('administrative_area_level_1')?.longText),
    municipality: normalize(part('locality')?.longText),
  }
}

function sameNameInJapan(spot, place) {
  return (
    Boolean(normalize(spot.name)) &&
    normalize(spot.name) === normalize(place?.displayName?.text) &&
    address(place).country === 'JP'
  )
}

function matchesArea(spot, prefecture, municipality) {
  const area = normalize(spot.area)
  return (
    Boolean(prefecture && municipality) &&
    /[市区町村]$/u.test(municipality) &&
    area.includes(prefecture) &&
    area.includes(municipality)
  )
}

/** Exact name plus prefecture and municipality. Never guess from rank or proximity. */
export function matchesRatingPlace(spot, place) {
  const { prefecture, municipality } = address(place)
  return sameNameInJapan(spot, place) && matchesArea(spot, prefecture, municipality)
}

const municipalities = Object.fromEntries(
  Object.entries(municipalityData.municipalities).map(([code, value]) => [
    code,
    value.split(',').map(normalize),
  ]),
)

function needsLocationMatch(spot, place) {
  if (!sameNameInJapan(spot, place)) return false
  const { prefecture, municipality } = address(place)
  const area = normalize(spot.area)
  // Missing is different from contradictory: never override an explicit other address.
  if ((prefecture && !area.includes(prefecture)) || (municipality && !area.includes(municipality)))
    return false
  if (prefecture && municipality) return false
  if (!Object.values(municipalities).some(([pref, city]) => matchesArea(spot, pref, city)))
    return false
  const types = Array.isArray(place.types) ? place.types : []
  if (!types.some((type) => ['natural_feature', 'lake', 'mountain_peak'].includes(type)))
    return false
  if (types.some((type) => ['parking', 'restaurant', 'cafe', 'lodging', 'store'].includes(type)))
    return false
  const { latitude, longitude } = place.location ?? {}
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 20 &&
    latitude <= 46 &&
    longitude >= 122 &&
    longitude <= 154
  )
}

async function limitedJson(response) {
  if (!response.ok || !response.body) throw new Error('unavailable')
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 256_000) throw new Error('oversized')
      chunks.push(Buffer.from(value))
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function withAbort(task, signal) {
  if (signal.aborted) throw new Error('timeout')
  let abort
  const stopped = new Promise((_, reject) => {
    abort = () => reject(new Error('timeout'))
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    return await Promise.race([task(), stopped])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

/** Only final visible candidates, one Places request each, no retries or persistent cache. */
export async function addPlaceRatings(
  spots,
  { apiKey, demo = false, fetcher = fetch, timeoutMs = 8000 } = {},
) {
  // Remove any rating supplied by an earlier source; only this lookup can attach one.
  const output = spots.map(({ googleRating: _rating, ...spot }) => spot)
  const usage = {
    configured: Boolean(apiKey),
    attempted: 0,
    matched: 0,
    unavailable: 0,
    failed: 0,
    skipped: spots.length,
    locationChecks: 0,
    locationMatched: 0,
  }
  if (demo || !apiKey || !spots.length) return { spots: output, usage }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let next = 0
  // The optional public geocoder is used serially, within the same overall deadline.
  let locationQueue = Promise.resolve()
  function matchByLocation(spot, place) {
    const task = locationQueue.then(() =>
      withAbort(async () => {
        usage.locationChecks++
        const url = new URL('https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress')
        // Only the public place's position from Google, never the user's position or AI coordinates.
        url.searchParams.set('lat', String(place.location.latitude))
        url.searchParams.set('lon', String(place.location.longitude))
        const data = await limitedJson(
          await fetcher(url.href, { redirect: 'error', signal: controller.signal }),
        )
        const code = data?.results?.muniCd
        const region =
          typeof code === 'string' && /^\d{4,5}$/.test(code)
            ? municipalities[code.padStart(5, '0')]
            : undefined
        if (!region || !matchesArea(spot, ...region) || controller.signal.aborted) return undefined
        usage.locationMatched++
        return place
      }, controller.signal),
    )
    locationQueue = task.catch(() => {})
    return task
  }
  async function worker() {
    while (next < Math.min(spots.length, 10) && !controller.signal.aborted) {
      const index = next++
      const spot = output[index]
      usage.attempted++
      usage.skipped--
      try {
        const data = await withAbort(
          async () =>
            limitedJson(
              await fetcher(endpoint, {
                method: 'POST',
                redirect: 'error',
                signal: controller.signal,
                headers: {
                  'Content-Type': 'application/json',
                  'X-Goog-Api-Key': apiKey,
                  'X-Goog-FieldMask': fields,
                },
                body: JSON.stringify({
                  textQuery: `${spot.name} ${spot.area}`,
                  languageCode: 'ja',
                  regionCode: 'JP',
                  pageSize: 5,
                }),
              }),
            ),
          controller.signal,
        )
        const places = Array.isArray(data?.places) ? data.places : []
        const matches = places.filter((p) => matchesRatingPlace(spot, p))
        const unresolved = places.filter((p) => needsLocationMatch(spot, p))
        const place =
          matches.length === 1 && unresolved.length === 0
            ? matches[0]
            : matches.length === 0 && unresolved.length === 1
              ? await matchByLocation(spot, unresolved[0])
              : undefined
        const now = Date.now()
        const googleRating =
          place && typeof place.id === 'string' && /^[\w-]{5,200}$/.test(place.id)
            ? decodePlaceRating(
                {
                  rating: place.rating,
                  count: place.userRatingCount,
                  mapsUrl: place.googleMapsUri,
                  checkedAt: new Date(now).toISOString(),
                  expiresAt: new Date(now + 600_000).toISOString(),
                  attributions:
                    place.attributions === undefined
                      ? []
                      : Array.isArray(place.attributions)
                        ? place.attributions.map((a) => ({ name: a.provider, url: a.providerUri }))
                        : null,
                },
                now,
              )
            : undefined
        if (googleRating && !controller.signal.aborted) {
          output[index] = { ...spot, googleRating }
          usage.matched++
        } else usage.unavailable++
      } catch {
        usage.failed++
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(5, spots.length) }, worker))
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  return { spots: output, usage }
}
