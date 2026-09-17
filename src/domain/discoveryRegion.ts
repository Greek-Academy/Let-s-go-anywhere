import { prefectures } from '../data/regions'
import type { DiscoveryRegion, Prefecture } from '../data/regions'
import type { Outing } from '../data/types'

/**
 * Read an explicit prefecture at the beginning of the user's area text.
 * Station/city names alone are intentionally not geocoded or guessed.
 */
export function originPrefecture(area: string): Prefecture | null {
  const value = area.normalize('NFKC').trim()
  for (const prefecture of prefectures) {
    if (value.startsWith(prefecture)) return prefecture
    if (prefecture === '北海道') continue
    const short = prefecture.slice(0, -1)
    if (
      value === short ||
      (value.startsWith(short) && /^[\s・、,/]/.test(value.slice(short.length)))
    )
      return prefecture
  }
  return null
}

export function resolveDiscoveryRegion(
  region: DiscoveryRegion,
  origin: string,
): Prefecture | 'all' | null {
  return region === 'origin' ? originPrefecture(origin) : region
}

export function inDiscoveryRegion(
  outing: Outing,
  region: ReturnType<typeof resolveDiscoveryRegion>,
): boolean {
  // A missing destination prefecture must never match a specific area.
  return region === 'all' || (region !== null && outing.prefecture === region)
}
