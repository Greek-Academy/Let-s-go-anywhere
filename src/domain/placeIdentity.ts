import reviews from '../data/placeIdentityReviews.json' with { type: 'json' }

interface Candidate {
  name: string
  area: string
  sourceUrl: string
  recommendations?: { provider: string; sourceUrl: string; reason: string }[]
  tags?: string[]
  likedFor?: string[]
  mode?: string
}
const normalize = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s・「」『』]/gu, '')
function source(value: string) {
  const url = new URL(value)
  url.hash = ''
  for (const key of [...url.searchParams.keys()])
    if (/^utm_/i.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()
  return url.href
}
function reviewedIdentity(candidate: Candidate) {
  return reviews.find(
    (entry) =>
      entry.names.some((name) => normalize(name) === normalize(candidate.name)) &&
      entry.areas.some((area) => normalize(area) === normalize(candidate.area)) &&
      entry.sources.some((url) => source(url) === source(candidate.sourceUrl)),
  )?.id
}

/** Never infer that a shared name, ward or article URL identifies the same branch. */
export function samePlace(a: Candidate, b: Candidate) {
  if (a.mode !== b.mode || normalize(a.name) !== normalize(b.name)) return false
  if (normalize(a.area) === normalize(b.area)) return true
  const identity = reviewedIdentity(a)
  return Boolean(identity && identity === reviewedIdentity(b))
}
export function mergePlace<T extends Candidate>(first: T, second: T): T {
  const recommendations = [...(first.recommendations ?? [])]
  for (const proposal of second.recommendations ?? [])
    if (!recommendations.some((r) => r.provider === proposal.provider))
      recommendations.push(proposal)
  const explicit = first.likedFor !== undefined || second.likedFor !== undefined
  const selected = [
    ...new Set([
      ...(first.likedFor ?? first.tags ?? []),
      ...(second.likedFor ?? second.tags ?? []),
    ]),
  ]
  const tags = [
    ...new Set([...(explicit ? selected : []), ...(first.tags ?? []), ...(second.tags ?? [])]),
  ].slice(0, 3)
  return {
    ...first,
    recommendations,
    tags,
    ...(explicit ? { likedFor: selected.filter((tag) => tags.includes(tag)) } : {}),
  }
}
/** A view only: original snapshots, IDs and individual selections stay in storage. */
export function groupPlaces<T extends Candidate>(candidates: T[]): T[] {
  const result: T[] = []
  for (const candidate of candidates) {
    const index = result.findIndex(
      (previous) =>
        previous.recommendations && candidate.recommendations && samePlace(previous, candidate),
    )
    if (index < 0) result.push(candidate)
    else result[index] = mergePlace(result[index], candidate)
  }
  return result
}
