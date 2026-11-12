import { normalizePlaceText, reviewedPlaceIdentity } from './placeIdentity'
import reviews from '../data/placeIdentityReviews.json' with { type: 'json' }
import type { WebSpot } from './webSearch'

/** Personal exclusion only. No search IDs, GPS, routes, ratings or provider payloads. */
export type HiddenWebSpot = Pick<WebSpot, 'name' | 'area' | 'mode'> & { reviewedId?: string }
export const MAX_HIDDEN_SPOTS = 1000

export function hiddenSpotRecord(spot: WebSpot): HiddenWebSpot {
  const reviewedId = reviewedPlaceIdentity(spot)
  return {
    name: spot.name,
    area: spot.area,
    mode: spot.mode,
    ...(reviewedId ? { reviewedId } : {}),
  }
}

export function sameHiddenSpot(a: HiddenWebSpot, b: HiddenWebSpot): boolean {
  if (a.mode !== b.mode || normalizePlaceText(a.name) !== normalizePlaceText(b.name)) return false
  // Never use name alone or a shared article URL to merge different places/branches.
  return (
    normalizePlaceText(a.area) === normalizePlaceText(b.area) ||
    Boolean(a.reviewedId && a.reviewedId === b.reviewedId)
  )
}

export function visibleWebSpots(spots: WebSpot[], hidden: HiddenWebSpot[]): WebSpot[] {
  return spots.filter(
    (spot) => !hidden.some((item) => sameHiddenSpot(item, hiddenSpotRecord(spot))),
  )
}

export function decodeHiddenWebSpots(value: unknown): HiddenWebSpot[] {
  if (!Array.isArray(value) || value.length > MAX_HIDDEN_SPOTS)
    throw new Error('Invalid hidden spots')
  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).some((key) => !['name', 'area', 'mode', 'reviewedId'].includes(key)) ||
      !['name', 'area'].every(
        (key) => typeof item[key] === 'string' && item[key].trim() && item[key].length <= 20000,
      ) ||
      !['live', 'sample'].includes(item.mode) ||
      ('reviewedId' in item &&
        !reviews.some(
          (entry) =>
            entry.id === item.reviewedId &&
            entry.names.some(
              (name) => normalizePlaceText(name) === normalizePlaceText(item.name),
            ) &&
            entry.areas.some((area) => normalizePlaceText(area) === normalizePlaceText(item.area)),
        ))
    )
      throw new Error('Invalid hidden spot')
    return {
      name: item.name,
      area: item.area,
      mode: item.mode,
      ...(item.reviewedId ? { reviewedId: item.reviewedId } : {}),
    }
  })
}
