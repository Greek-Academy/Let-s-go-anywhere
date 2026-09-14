import type { ArrivalGuide } from '../data/arrivalGuides'
import type { LearningContent, Outing, Question, School, Station } from '../data/types'
import type { TripFacts } from '../domain/tripConditions'

// This is a trusted, typed snapshot, not a validator for arbitrary API responses.
// An API adapter must validate and normalize its response before supplying a catalog.
export interface ContentCatalog {
  readonly source: 'sample'
  readonly outings: readonly Outing[]
  readonly stations: readonly Station[]
  readonly drivingSchools: readonly School[]
  readonly quizQuestions: readonly Question[]
  readonly learningContents: readonly LearningContent[]
  readonly arrivalGuides: Readonly<Record<string, ArrivalGuide>>
  readonly tripFacts: Readonly<Record<string, TripFacts>>
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export function createContentCatalog(input: ContentCatalog): ContentCatalog {
  if (input.source !== 'sample') {
    throw new Error('Approved content is not connected. A sample fallback is not allowed.')
  }
  const catalog = structuredClone(input)
  for (const key of [
    'outings',
    'stations',
    'drivingSchools',
    'quizQuestions',
    'learningContents',
  ] as const) {
    const ids = new Set<string>()
    for (const item of catalog[key]) {
      if (!item.id.trim() || ids.has(item.id)) throw new Error(`Invalid or duplicate ${key} id`)
      ids.add(item.id)
    }
  }
  const outingIds = new Set(catalog.outings.map((item) => item.id))
  for (const [id, guide] of Object.entries(catalog.arrivalGuides)) {
    if (!outingIds.has(id) || guide.outingId !== id)
      throw new Error('Arrival guide has no matching outing')
  }
  for (const id of Object.keys(catalog.tripFacts)) {
    if (!outingIds.has(id)) throw new Error('Trip facts have no matching outing')
  }
  return freeze(catalog)
}
