import { evidenceState, today } from './evidence'
import type { Evidence } from './evidence'
import { normalizeSavedUrl } from './savedUrls'

export type ExternalKind = 'official' | 'map' | 'sns'
/** Only a trusted, approved catalog adapter may supply these records. No private notes. */
export interface SiteTarget {
  url: string
  host: string
}
export interface ConfirmedSite {
  availability: 'available' | 'unavailable'
  evidence: Evidence<SiteTarget>
}
export type MapPlace =
  | { type: 'coordinates'; latitude: number; longitude: number }
  | { type: 'address'; address: string }
export interface ListingLinks {
  official?: ConfirmedSite
  app?: ConfirmedSite // HTTPS Universal / App Link, with an explicit official Web fallback.
  sns?: ConfirmedSite
  map?: { availability: 'available' | 'unavailable'; evidence: Evidence<MapPlace> }
}
export type ExternalRequest =
  | { type: 'personal'; url: string }
  | {
      type: 'listing'
      catalogSource: 'sample' | 'approved'
      kind: ExternalKind
      links?: ListingLinks
      stopped?: boolean
    }
export interface Destination {
  url: string
  host: string
  checkedAt?: string
}
export type LinkBlock = 'sample' | 'unconfirmed' | 'expired' | 'unavailable' | 'invalid'
export const linkBlockMessages: Record<LinkBlock, string> = {
  sample:
    'この掲載情報はサンプルです。確認済みのURL・所在地がないため、外部サイトや実際の地図は開きません。',
  unconfirmed: 'リンク先の確認が済んでいないため、今は開けません。',
  expired: 'リンク先の確認期限を過ぎています。再確認が済むまで案内を停止しています。',
  unavailable: 'このリンクは利用停止中です。利用できる別の案内があれば、そちらを確認してください。',
  invalid: 'このURLは開けません。HTTPSの公開ページURLか、元の投稿で確認してください。',
}
export interface LinkDecision {
  kind: ExternalKind
  block?: LinkBlock
  destination?: Destination
  app?: Destination
  fallback?: Destination
}

/** URL syntax is not proof that content is correct, official, or currently reachable. */
export function outboundHttpsUrl(input: string): URL {
  if (typeof input !== 'string' || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(input))
    throw new Error('Invalid URL')
  // Reuse public-host, credentials, IP, port, length, whitespace and scheme restrictions.
  normalizeSavedUrl(input)
  const url = new URL(input.trim())
  if (url.protocol !== 'https:') throw new Error('HTTPS required')
  if (url.href.length > 2048) throw new Error('Encoded URL is too long')
  url.hostname = url.hostname.replace(/\.$/, '')
  if (
    !/^[a-z0-9.-]+$/.test(url.hostname) ||
    url.hostname
      .split('.')
      .some((part) => !part || part.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))
  )
    throw new Error('Invalid host')
  if (['lan', 'home', 'test-local'].some((suffix) => url.hostname.endsWith('.' + suffix)))
    throw new Error('Private host')
  return url
}

function confirmation<T>(
  record: { availability: string; evidence: Evidence<T> } | undefined,
  at: string,
): LinkBlock | undefined {
  if (!record) return 'unconfirmed'
  if (record.availability !== 'available') return 'unavailable'
  const state = evidenceState(record.evidence, at)
  if (state === 'withdrawn') return 'unavailable'
  if (state === 'expired') return 'expired'
  return state === 'confirmed' ? undefined : 'unconfirmed'
}
function site(
  record: ConfirmedSite | undefined,
  at: string,
  allowQuery = false,
): { destination?: Destination; block?: LinkBlock } {
  const block = confirmation(record, at)
  if (block || !record?.evidence.value) return { block: block ?? 'unconfirmed' }
  const { url: input, host } = record.evidence.value
  const url = outboundHttpsUrl(input)
  // Host approval is exact, never a substring or wildcard. Official links start with path-only URLs.
  if (host !== url.hostname || (!allowQuery && (url.search || url.hash)))
    return { block: 'invalid' }
  return {
    destination: { url: url.href, host: url.hostname, checkedAt: record.evidence.checkedAt! },
  }
}
function safelySite(record: ConfirmedSite | undefined, at: string, allowQuery = false) {
  try {
    return site(record, at, allowQuery)
  } catch {
    return { block: 'invalid' as const }
  }
}

/** Pass a verified destination only; origin, user identity, notes and answers are not inputs. */
function mapDestination(
  record: ListingLinks['map'],
  at: string,
): { destination?: Destination; block?: LinkBlock } {
  const block = confirmation(record, at)
  if (block || !record?.evidence.value) return { block: block ?? 'unconfirmed' }
  const place = record.evidence.value
  let query: string
  if (place.type === 'coordinates') {
    const { latitude, longitude } = place
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return { block: 'invalid' }
    query = `${latitude},${longitude}`
  } else if (place.type === 'address') {
    if (
      typeof place.address !== 'string' ||
      !place.address.trim() ||
      place.address.length > 300 ||
      /[\u0000-\u001f\u007f]/.test(place.address)
    )
      return { block: 'invalid' }
    query = place.address.trim()
  } else return { block: 'invalid' }
  const url = new URL('https://www.google.com/maps/search/')
  url.searchParams.set('api', '1')
  url.searchParams.set('query', query)
  if (url.href.length > 2048) return { block: 'invalid' }
  return {
    destination: { url: url.href, host: url.hostname, checkedAt: record.evidence.checkedAt! },
  }
}

export function evaluateExternalRequest(request: ExternalRequest, at = today()): LinkDecision {
  const kind = request.type === 'personal' ? 'sns' : request.kind
  try {
    if (request.type === 'personal') {
      // This remains a personal, unverified link. It does not become published listing data.
      const url = outboundHttpsUrl(request.url)
      return { kind, destination: { url: url.href, host: url.hostname } }
    }
    if (request.catalogSource !== 'approved') return { kind, block: 'sample' }
    if (request.stopped) return { kind, block: 'unavailable' }
    const official = safelySite(request.links?.official, at)
    if (kind === 'official')
      return {
        kind,
        ...official,
        app: official.destination ? safelySite(request.links?.app, at).destination : undefined,
      }
    const primary =
      kind === 'map'
        ? mapDestination(request.links?.map, at)
        : safelySite(request.links?.sns, at, true)
    return { kind, ...primary, fallback: official.destination }
  } catch {
    return { kind, block: 'invalid' }
  }
}
