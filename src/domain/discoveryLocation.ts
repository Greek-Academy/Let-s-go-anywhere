export type DiscoveryCenter = { lat: number; lng: number }
export const LOCATION_REGION = '取得した現在地の周辺'

/** Search only needs an approximate center; never transmit the full GPS fix. */
export function coarseCenter(point: DiscoveryCenter): DiscoveryCenter {
  return { lat: Number(point.lat.toFixed(3)), lng: Number(point.lng.toFixed(3)) }
}
export function validDiscoveryCenter(value: unknown): value is DiscoveryCenter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  return (
    Object.keys(p).length === 2 &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= 20 &&
    p.lat <= 46 &&
    p.lng >= 122 &&
    p.lng <= 154 &&
    p.lat === Number(p.lat.toFixed(3)) &&
    p.lng === Number(p.lng.toFixed(3))
  )
}
export function sameCenter(a?: DiscoveryCenter, b?: DiscoveryCenter) {
  return a?.lat === b?.lat && a?.lng === b?.lng
}
/** Persist only that this was a nearby search, never its coordinates. */
export function withoutSearchCoordinates<
  T extends {
    query: { region: string; theme: string; location?: DiscoveryCenter; locationSearch?: true }
  },
>(result: T): T {
  if (!result.query.location) return result
  const { location: _position, ...query } = result.query
  return { ...result, query: { ...query, locationSearch: true } }
}
