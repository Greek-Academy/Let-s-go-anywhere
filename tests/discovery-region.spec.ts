import { expect, test } from '@playwright/test'
import {
  originPrefecture,
  inDiscoveryRegion,
  resolveDiscoveryRegion,
} from '../src/domain/discoveryRegion'
import { outings } from '../src/data/mockData'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'

test('explicit prefectures are recognized without guessing ambiguous stations or substring matches', () => {
  for (const [area, expected] of [
    ['東京都渋谷区', '東京都'],
    [' 東京・新宿駅周辺 ', '東京都'],
    ['神奈川 横浜駅', '神奈川県'],
    ['京都', '京都府'],
    ['北海道札幌市', '北海道'],
    ['府中駅', null],
    ['横浜', null],
    ['', null],
    ['東京ディズニーランド', null],
    ['東京都京都ホテル', '東京都'],
  ] as const)
    expect(originPrefecture(area), area).toBe(expected)
})

test('destination scope uses structured metadata and never changes the chosen origin', () => {
  const tokyo = resolveDiscoveryRegion('origin', '東京都 渋谷')
  expect(outings.filter((o) => inDiscoveryRegion(o, tokyo)).map((o) => o.id)).toEqual([
    'market',
    'forest',
    'cafe',
  ])
  expect(resolveDiscoveryRegion('神奈川県', '京都')).toBe('神奈川県')
  const unspecified = { ...outings[0], prefecture: undefined, area: '東京都' }
  expect(inDiscoveryRegion(unspecified, '東京都')).toBe(false)
  expect(inDiscoveryRegion(unspecified, null)).toBe(false)
  expect(inDiscoveryRegion(unspecified, 'all')).toBe(true)
})

test('legacy discovery preferences keep saved data and filters; invalid new scopes stay protected', () => {
  const initial = createInitialState()
  const legacy = {
    ...initial,
    savedEvents: ['fuji'],
    profile: { ...initial.profile, area: '京都', interests: ['自然'] },
    discover: { category: 'スポット', search: '湖', tag: '自然' },
    memo: { ...initial.memo, questions: '練習の相談メモ' },
  }
  const decoded = decodeStoredState(JSON.stringify(legacy))
  expect(decoded.problem).toBeNull()
  expect(decoded.state).toMatchObject({
    ...legacy,
    discover: { ...legacy.discover, region: 'origin' },
  })
  for (const region of [null, 13, {}, '全国', 'unknown']) {
    const result = decodeStoredState(
      JSON.stringify({
        ...legacy,
        discover: { ...legacy.discover, region },
      }),
    )
    expect(result.problem).toBe('invalid')
    expect(result.state.savedEvents).toEqual(['fuji'])
  }
})
