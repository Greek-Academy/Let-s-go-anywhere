import { expect, test } from '@playwright/test'
import { evaluateExternalRequest, outboundHttpsUrl } from '../src/domain/externalLinks'
import type { ConfirmedSite, ExternalRequest, ListingLinks } from '../src/domain/externalLinks'
import { sampleFact } from '../src/data/arrivalGuides'
import { createContentCatalog } from '../src/content/catalog'
import { sampleCatalog } from '../src/content/sampleCatalog'

const at = '2026-09-16'
const website = (url = 'https://official.example/stations/1'): ConfirmedSite => ({
  availability: 'available',
  evidence: sampleFact({ url, host: 'official.example' }),
})
const request = (
  kind: 'official' | 'map' | 'sns',
  links: ListingLinks,
  source: 'sample' | 'approved' = 'approved',
): ExternalRequest => ({
  type: 'listing',
  catalogSource: source,
  kind,
  links,
})

test('outbound URLs require public HTTPS without credentials, private/IP hosts or active schemes', () => {
  for (const value of [
    '',
    'http://example.org/a',
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///tmp/a',
    'intent://maps',
    'https://user:password@example.org/',
    'https://localhost/a',
    'https://a.local/',
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://2130706433/',
    'https://0x7f000001/',
    'https://example.org:8443/',
    'https://x.com/\na',
    'https://example.org/%0a',
    'https://x.com\\@example.org/a',
    'https://a.home/',
    'https://bad_host.example/',
    'https://example.org/' + 'a'.repeat(2048),
    'https://example.org/' + '海'.repeat(300),
  ]) {
    expect(() => outboundHttpsUrl(value), value).toThrow()
    expect(
      evaluateExternalRequest({ type: 'personal', url: value }, at).destination,
    ).toBeUndefined()
  }
  expect(outboundHttpsUrl('https://EXAMPLE.ORG./a').href).toBe('https://example.org/a')
})

test('personal URLs remain unverified, retain their own query semantics and do not grant catalog approval', () => {
  const url = 'https://external.example/post?section=one&signature=abc#details'
  const result = evaluateExternalRequest({ type: 'personal', url }, at)
  expect(result).toEqual({ kind: 'sns', destination: { url, host: 'external.example' } })
  expect(evaluateExternalRequest(request('sns', { sns: website() }, 'sample'), at)).toEqual({
    kind: 'sns',
    block: 'sample',
  })
  expect(() => createContentCatalog({ ...sampleCatalog, source: 'approved' } as never)).toThrow()
})

test('published site links require current evidence and exact approved host boundaries', () => {
  const link = website()
  expect(
    evaluateExternalRequest(request('official', { official: link }), at).destination?.url,
  ).toBe(link.evidence.value!.url)
  for (const url of [
    'https://official.example.evil.example/a',
    'https://evilofficial.example/a',
    'https://sub.official.example/a',
    'https://official.example/a?memo=private',
    'https://official.example/a#private',
  ]) {
    const bad = website(url)
    expect(evaluateExternalRequest(request('official', { official: bad }), at)).toMatchObject({
      block: 'invalid',
    })
  }
  for (const patch of [
    { source: '' },
    { checkedAt: '2026-09-17' },
    { reviewBy: null },
    { checkedAt: '2026-02-30' },
    { value: null },
  ]) {
    const bad = website()
    Object.assign(bad.evidence, patch)
    expect(
      evaluateExternalRequest(request('official', { official: bad }), at).destination,
    ).toBeUndefined()
  }
  expect(
    evaluateExternalRequest(request('official', { official: link }), '2026-12-31').destination,
  ).toBeDefined()
  expect(evaluateExternalRequest(request('official', { official: link }), '2027-01-01').block).toBe(
    'expired',
  )
  link.evidence.status = 'withdrawn'
  expect(evaluateExternalRequest(request('official', { official: link }), at).block).toBe(
    'unavailable',
  )
})

test('sample or stopped listings cannot activate even well formed site, app and coordinate data', () => {
  const links: ListingLinks = {
    official: website(),
    app: website(),
    sns: website(),
    map: {
      availability: 'available',
      evidence: sampleFact({ type: 'coordinates', latitude: 35, longitude: 139 }),
    },
  }
  for (const kind of ['official', 'map', 'sns'] as const) {
    expect(evaluateExternalRequest(request(kind, links, 'sample'), at)).toEqual({
      kind,
      block: 'sample',
    })
    expect(
      evaluateExternalRequest({ ...request(kind, links), stopped: true } as ExternalRequest, at),
    ).toEqual({ kind, block: 'unavailable' })
  }
})

test('app links require a valid official Web fallback and use HTTPS only', () => {
  const official = website(),
    app = website('https://official.example/app')
  expect(evaluateExternalRequest(request('official', { official, app }), at).app?.url).toBe(
    app.evidence.value!.url,
  )
  app.evidence.value!.url = 'custom-app://booking'
  const invalidApp = evaluateExternalRequest(request('official', { official, app }), at)
  expect(invalidApp.app).toBeUndefined()
  expect(invalidApp.destination?.url).toBe(official.evidence.value!.url)
  official.availability = 'unavailable'
  expect(
    evaluateExternalRequest(request('official', { official, app: website() }), at),
  ).toMatchObject({ block: 'unavailable', app: undefined })
})

test('maps encode only confirmed destination coordinates or address; privacy fields never become parameters', () => {
  const links: ListingLinks = {
    map: {
      availability: 'available',
      evidence: sampleFact({ type: 'coordinates', latitude: 35.123, longitude: 139.456 }),
    },
  }
  const input = {
    ...request('map', links),
    profile: 'private-name',
    quiz: 'private-answer',
    memo: 'private-memo',
    origin: 'private-home',
  }
  const result = evaluateExternalRequest(input, at)
  const url = new URL(result.destination!.url)
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/')
  expect([...url.searchParams]).toEqual([
    ['api', '1'],
    ['query', '35.123,139.456'],
  ])
  expect(result.destination!.url).not.toContain('private-')
  links.map!.evidence.value = {
    type: 'address',
    address: '確認済み住所の形式テスト & origin=別の値 #1',
  }
  const addressUrl = new URL(evaluateExternalRequest(request('map', links), at).destination!.url)
  expect(addressUrl.searchParams.get('query')).toBe(links.map!.evidence.value.address)
  expect([...addressUrl.searchParams.keys()]).toEqual(['api', 'query'])
  for (const value of [
    { type: 'coordinates', latitude: NaN, longitude: 0 },
    { type: 'coordinates', latitude: 91, longitude: 139 },
    { type: 'coordinates', latitude: 0, longitude: -181 },
    { type: 'address', address: '' },
    { type: 'address', address: '海'.repeat(300) },
    { type: 'address', address: 'a\nother' },
  ]) {
    links.map!.evidence.value = value as never
    expect(evaluateExternalRequest(request('map', links), at).destination).toBeUndefined()
  }
})

test('broken or unconfirmed map/SNS links can fall back only to separately confirmed official Web', () => {
  const links: ListingLinks = {
    official: website(),
    sns: { ...website(), availability: 'unavailable' },
  }
  for (const kind of ['map', 'sns'] as const) {
    const result = evaluateExternalRequest(request(kind, links), at)
    expect(result.destination).toBeUndefined()
    expect(result.fallback?.url).toBe(links.official!.evidence.value!.url)
    expect(evaluateExternalRequest(request(kind, links), '2027-01-01').fallback).toBeUndefined()
  }
  links.official!.evidence.status = 'withdrawn'
  expect(evaluateExternalRequest(request('sns', links), at).fallback).toBeUndefined()
})
