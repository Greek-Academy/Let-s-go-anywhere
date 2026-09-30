import { filterRealStations } from './realStations'
import type { Bounds, RealMapState } from './realStations'

export type LocationFix = { lat: number; lng: number; accuracy: number; timestamp: number }
export const nearbyRadius = 2000
export const locationLifetime = 10 * 60 * 1000
const radians = (degrees: number) => (degrees * Math.PI) / 180

/** Straight-line metres; never a travel distance, duration or route assessment. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const h =
    Math.sin(radians(b.lat - a.lat) / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))))
}
export function nearbyBounds(point: { lat: number; lng: number }): Bounds {
  const latitude = (nearbyRadius / 6371000) * (180 / Math.PI)
  const longitude = latitude / Math.cos(radians(point.lat))
  return {
    south: point.lat - latitude,
    north: point.lat + latitude,
    west: point.lng - longitude,
    east: point.lng + longitude,
  }
}
export function nearbyStations(map: RealMapState, point: LocationFix) {
  return filterRealStations({ ...map, bounds: nearbyBounds(point) })
    .map((station) => ({
      station,
      distance: distanceMetres(point, { lat: station.latitude, lng: station.longitude }),
    }))
    .filter(({ distance }) => distance <= nearbyRadius)
    .sort((a, b) => a.distance - b.distance)
    .map(({ station }) => station)
}
