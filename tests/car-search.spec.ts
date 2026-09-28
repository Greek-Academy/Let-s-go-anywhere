import { expect, test } from '@playwright/test'
import { carProviders } from '../src/data/carProviders'
import { carSearchAreaError, carSearchDestination } from '../src/domain/carSearch'
import type { CarSearchRequest } from '../src/domain/carSearch'
import { evaluateExternalRequest } from '../src/domain/externalLinks'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'

test('car search encodes only the explicit area and category; provider entrances receive no personal fields', () => {
  for (const provider of carProviders) {
    const result = carSearchDestination({
      type: 'car-search',
      target: 'map',
      area: ' 京都駅 & 駅前#東 ',
      service: provider.type,
      provider: provider.id,
    })
    const url = new URL(result.url)
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/')
    expect([...url.searchParams.entries()]).toEqual([
      ['api', '1'],
      ['query', `京都駅 & 駅前#東 ${provider.name}`],
    ])
    expect(url.hash).toBe('')
    expect(
      evaluateExternalRequest({ type: 'car-search', target: 'provider', provider: provider.id })
        .destination?.url,
    ).toBe(provider.searchUrl)
    expect(new URL(provider.searchUrl).search).toBe('')
  }
  expect(carSearchAreaError(' ')).toBeTruthy()
  expect(carSearchAreaError('x'.repeat(81))).toBeTruthy()
  expect(carSearchAreaError('京都\n駅')).toBeTruthy()
  expect(carSearchAreaError('京都駅')).toBeNull()
})

test('malformed requests, unknown providers and incompatible types fail closed without changing sample guards', () => {
  const good = {
    type: 'car-search',
    target: 'map',
    area: '京都',
    service: 'カーシェア',
    provider: null,
  }
  for (const input of [
    { ...good, area: '' },
    { ...good, area: 'x'.repeat(81) },
    { ...good, area: null },
    { ...good, area: '京都\u0000' },
    { ...good, service: '飛行機' },
    { ...good, provider: 'toyota' },
    { ...good, provider: 'https://evil.example' },
    { ...good, target: 'other' },
    { type: 'car-search', target: 'provider', provider: '__proto__' },
  ])
    expect(evaluateExternalRequest(input as CarSearchRequest)).toMatchObject({ block: 'invalid' })
  expect(
    evaluateExternalRequest({ type: 'listing', catalogSource: 'sample', kind: 'map' }).block,
  ).toBe('sample')
})

test('existing saves migrate without loss and new car conditions round-trip; unknown provider IDs protect storage', () => {
  const initial = createInitialState()
  initial.savedStations = ['times-shibuya']
  initial.carSearch = { area: '京都駅', type: 'レンタカー', provider: 'toyota' }
  expect(decodeStoredState(JSON.stringify(initial))).toEqual({ state: initial, problem: null })
  const { carSearch: _, ...legacy } = initial
  const migrated = decodeStoredState(JSON.stringify(legacy))
  expect(migrated.problem).toBeNull()
  expect(migrated.state.savedStations).toEqual(initial.savedStations)
  expect(migrated.state.carSearch).toEqual(createInitialState().carSearch)
  expect(
    decodeStoredState(
      JSON.stringify({ ...initial, carSearch: { ...initial.carSearch, provider: 'unknown' } }),
    ).problem,
  ).toBe('invalid')
})
