import { decodePlaceRating } from '../../src/domain/placeRating.ts'

const endpoint = 'https://places.googleapis.com/v1/places:searchText'
const fields =
  'places.id,places.displayName,places.addressComponents,places.rating,places.userRatingCount,places.googleMapsUri,places.attributions'
const normalize = (s) =>
  typeof s === 'string'
    ? s
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[\s・「」『』]/gu, '')
    : ''

/** Exact name plus prefecture and municipality. Never guess a branch from rank or proximity. */
export function matchesRatingPlace(spot, place) {
  if (!normalize(spot.name) || normalize(spot.name) !== normalize(place?.displayName?.text))
    return false
  const components = Array.isArray(place.addressComponents) ? place.addressComponents : []
  const part = (type) => components.find((c) => Array.isArray(c.types) && c.types.includes(type))
  const prefecture = normalize(part('administrative_area_level_1')?.longText)
  const municipality = normalize(part('locality')?.longText)
  const area = normalize(spot.area)
  return (
    part('country')?.shortText === 'JP' &&
    Boolean(prefecture && municipality) &&
    /[市区町村]$/u.test(municipality) &&
    area.includes(prefecture) &&
    area.includes(municipality)
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

/** Only final visible candidates, one request each, no retries and no persistent cache. */
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
  }
  if (demo || !apiKey || !spots.length) return { spots: output, usage }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let next = 0
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
        const matches = Array.isArray(data?.places)
          ? data.places.filter((p) => matchesRatingPlace(spot, p))
          : []
        const place = matches.length === 1 ? matches[0] : undefined
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
