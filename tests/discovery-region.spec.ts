import { expect, test } from '@playwright/test'
import { inDiscoveryRegion, resolveDiscoveryRegion } from '../src/domain/discoveryRegion'
import { railStation, railStations, findRailStations } from '../src/domain/railStations'
import { outings } from '../src/data/mockData'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'

test('station catalog searches readings, partial text and disambiguates same names', () => {
  expect(railStations.length).toBeGreaterThan(8500)
  for (const q of ['しんじゅく', 'シンジュク', 'ｼﾝｼﾞｭｸ', '新宿駅', ' 新宿 '])
    expect(findRailStations(q)[0].id).toBe('1130208')
  expect(findRailStations('しんじゅ').some((s) => s.id === '1130208')).toBeTruthy()
  expect(
    new Set(
      findRailStations('府中')
        .filter((s) => s.name === '府中')
        .map((s) => s.prefecture),
    ).size,
  ).toBe(3)
  expect(findRailStations('存在しない検証駅')).toEqual([])
  expect(findRailStations('')).toEqual([])
  expect(railStation('__proto__')).toBeNull()
})
test('destination and origin are separate; legacy or unknown stations are never guessed', () => {
  const origin = '1130208',
    destination = '1130812'
  expect(resolveDiscoveryRegion('origin', origin, destination)?.name).toBe('新宿')
  expect(resolveDiscoveryRegion('station', origin, destination)?.name).toBe('鎌倉')
  for (const legacy of ['all', '東京都', '京都府'] as const)
    expect(resolveDiscoveryRegion(legacy, origin, destination)).toBeNull()
  expect(resolveDiscoveryRegion('origin', null)).toBeNull()
  expect(resolveDiscoveryRegion('station', origin, 'missing')).toBeNull()
  const near = railStation('1130205')
  expect(outings.filter((s) => inDiscoveryRegion(s, near, true)).map((s) => s.id)).toEqual(['cafe'])
  expect(outings.some((s) => inDiscoveryRegion(s, near, false))).toBe(false)
})
test('old profile, prefecture and all-area settings preserve saved data without silently choosing a station', () => {
  for (const region of ['origin', 'all', '東京都'] as const) {
    const state = createInitialState()
    delete state.profile.stationId
    delete state.discover.stationId
    state.profile.area = '東京都 渋谷'
    state.savedEvents = ['fuji']
    state.memo.questions = '本人だけの学習メモ'
    state.discover.region = region
    const parsed = decodeStoredState(JSON.stringify(state))
    expect(parsed.problem).toBeNull()
    expect(parsed.state.profile.area).toBe('東京都 渋谷')
    expect(parsed.state.profile.stationId).toBeNull()
    expect(parsed.state.savedEvents).toEqual(['fuji'])
    expect(parsed.state.memo.questions).toBe('本人だけの学習メモ')
    expect(
      resolveDiscoveryRegion(
        parsed.state.discover.region,
        parsed.state.profile.stationId,
        parsed.state.discover.stationId,
      ),
    ).toBeNull()
  }
})
test('new station preferences persist while invalid structures remain protected', () => {
  const state = createInitialState()
  state.profile.stationId = '1130208'
  state.discover = { ...state.discover, region: 'station', stationId: '1130812' }
  expect(decodeStoredState(JSON.stringify(state)).state).toEqual(state)
  for (const bad of [{}, 123, '__proto__']) {
    const parsed = decodeStoredState(
      JSON.stringify({ ...state, discover: { ...state.discover, stationId: bad } }),
    )
    expect(parsed.problem).toBe('invalid')
  }
})
