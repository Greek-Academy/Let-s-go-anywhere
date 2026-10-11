import type { DiscoveryRegion } from '../data/regions'
import type { Outing } from '../data/types'
import { railStation } from './railStations'
import type { RailStation } from './railStations'

// Old prefectures, "all", and arbitrary profile text never become a guessed station.
export function resolveDiscoveryRegion(
  region: DiscoveryRegion,
  originId?: string | null,
  destinationId?: string | null,
): RailStation | null {
  return region === 'origin'
    ? railStation(originId)
    : region === 'station'
      ? railStation(destinationId)
      : null
}

// Fictional sample areas only. This does not assign coordinates to published real listings.
const sampleAreas: Record<string, string> = {
  fireworks: '9940118',
  fuji: '9940118',
  market: '1131525',
  forest: '1131525',
  cafe: '1130205',
  coast: '2500217',
}
export function inDiscoveryRegion(
  outing: Outing,
  station: RailStation | null,
  sample = false,
): boolean {
  if (!station || !sample) return false
  const center = railStation(sampleAreas[outing.id])
  if (!center) return false
  const r = Math.PI / 180
  const a =
    Math.sin(((center.lat - station.lat) * r) / 2) ** 2 +
    Math.cos(center.lat * r) *
      Math.cos(station.lat * r) *
      Math.sin(((center.lng - station.lng) * r) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 2000
}
