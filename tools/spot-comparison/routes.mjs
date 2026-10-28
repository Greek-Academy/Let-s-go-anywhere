import { durationRange } from '../../src/domain/driveSearch.ts'
import { balanceHobbyCandidates, searchHobbies } from '../../src/domain/hobbyBalance.ts'
import { railStation } from '../../src/domain/railStations.ts'

const ENDPOINT = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
/** One bounded request per explicit search. No route geometry, logs, retries or stored response. */
export async function addDrivingTimes(
  spots,
  query,
  { apiKey = '', demo = false, fetcher = fetch, now = Date.now } = {},
) {
  if (!query.drive) return { spots, excluded: 0 }
  const candidates = spots.slice(0, 20)
  const [min, max] = durationRange(query.drive.duration)
  const checkedAt = new Date(now()).toISOString()
  const expiresAt = new Date(Date.parse(checkedAt) + 600000).toISOString()
  let travel = candidates.map(() => ({ status: 'unconfirmed' }))
  if (demo)
    travel = candidates.map((_, i) => ({
      status: 'sample',
      durationSeconds: (min + ((max - min) * (i + 1)) / 21) * 60,
      distanceMeters: (i + 1) * 10000,
      checkedAt,
      expiresAt,
    }))
  else if (apiKey && candidates.length) {
    const station = railStation(query.stationId)
    const center = query.location ?? station
    if (center) {
      try {
        const response = await fetcher(ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(12000),
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'originIndex,destinationIndex,status,condition,duration,distanceMeters',
          },
          body: JSON.stringify({
            origins: [
              {
                waypoint: { location: { latLng: { latitude: center.lat, longitude: center.lng } } },
                routeModifiers: {
                  avoidFerries: true,
                  ...(query.drive.road === '一般道でゆっくり' ? { avoidHighways: true } : {}),
                },
              },
            ],
            destinations: candidates.map((spot) => ({
              waypoint: { address: `日本 ${spot.area} ${spot.event?.venue ?? spot.name}` },
            })),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
            languageCode: 'ja',
            regionCode: 'jp',
          }),
        })
        if (!response.ok) throw new Error('Routes unavailable')
        const text = await response.text()
        if (text.length > 65536) throw new Error('Route response too large')
        const rows = JSON.parse(text)
        if (!Array.isArray(rows) || rows.length > candidates.length)
          throw new Error('Invalid routes')
        const seen = new Set()
        for (const row of rows) {
          const i = row.destinationIndex ?? 0
          if (
            (row.originIndex ?? 0) !== 0 ||
            !Number.isInteger(i) ||
            i < 0 ||
            i >= candidates.length ||
            seen.has(i)
          )
            throw new Error('Invalid route index')
          seen.add(i)
          if (
            !row.status ||
            (row.status.code ?? 0) !== 0 ||
            row.condition !== 'ROUTE_EXISTS' ||
            !/^\d+(\.\d+)?s$/.test(row.duration ?? '') ||
            !Number.isFinite(row.distanceMeters) ||
            row.distanceMeters < 0 ||
            row.distanceMeters > 3000000
          )
            continue
          const seconds = Number(row.duration.slice(0, -1))
          if (seconds > 172800) continue
          travel[i] = {
            status: 'calculated',
            durationSeconds: seconds,
            distanceMeters: row.distanceMeters,
            checkedAt,
            expiresAt,
          }
        }
      } catch {
        // Never synthesize driving times or expose a provider error containing request details.
        travel = candidates.map(() => ({ status: 'unconfirmed' }))
      }
    }
  }
  let excluded = 0
  const withTimes = candidates.flatMap((spot, i) => {
    const time = travel[i]
    if (
      time.status !== 'unconfirmed' &&
      (time.durationSeconds < min * 60 || time.durationSeconds > max * 60)
    ) {
      excluded++
      return []
    }
    return [{ ...spot, travel: time }]
  })
  return { spots: balanceHobbyCandidates(withTimes, searchHobbies(query.drive)), excluded }
}
