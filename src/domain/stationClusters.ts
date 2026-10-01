import { insideBounds, type Bounds, type RealStation } from './realStations'

export type StationGroup = { latitude: number; longitude: number; stations: RealStation[] }

/** Screen-space grid: bounded marker count at a nationwide scale, no stations discarded. */
export function groupStations(
  stations: readonly RealStation[],
  zoom: number,
  viewport: Bounds,
): StationGroup[] {
  const visible =
    stations.length > 60 ? stations.filter((s) => insideBounds(s, viewport)) : stations
  const cell = zoom >= 16 ? 36 : 64
  const scale = 256 * 2 ** zoom
  const groups = new Map<string, RealStation[]>()
  for (const station of visible) {
    const sin = Math.sin((station.latitude * Math.PI) / 180)
    const x = ((station.longitude + 180) / 360) * scale
    const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`
    const group = groups.get(key) || []
    group.push(station)
    groups.set(key, group)
  }
  return [...groups.values()].map((items) => ({
    latitude: items.reduce((sum, s) => sum + s.latitude, 0) / items.length,
    longitude: items.reduce((sum, s) => sum + s.longitude, 0) / items.length,
    stations: items,
  }))
}
