import { test, expect } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'
import { parseWebSearchResult } from '../src/domain/webSearch'
import type { WebSpot } from '../src/domain/webSearch'
import { personalRecommendations, preferenceWeights } from '../src/domain/recommendations'
import { fromWebSpot } from '../src/sharing/candidates'
import { evaluateExternalRequest } from '../src/domain/externalLinks'
import { groupPlaces } from '../src/domain/placeIdentity'
import { sameWebSpot } from '../src/domain/webSearch'

const query = { region: '東京都', theme: 'カフェ' }
const candidate = (n: number, tag = 'カフェ') => ({
  name: `検証店舗${n}`,
  area: '東京都',
  summary: '架空の説明',
  matchReason: '架空の理由',
  sourceUrl: `https://example.com/shop/${n}`,
  verification: 'unconfirmed',
  tags: [tag],
  recommendations: [
    { provider: 'openai', sourceUrl: `https://example.com/shop/${n}`, reason: '架空の理由' },
  ],
})
const response = () => ({
  kind: 'comparison',
  query,
  mode: 'live',
  retrievedAt: '2026-10-04T01:00:00.000Z',
  spots: [candidate(1), candidate(2, '自然')],
  omitted: 0,
  duplicates: 0,
  reports: ['openai', 'anthropic'].map((provider) => ({
    provider,
    model: 'test-model',
    state: 'completed',
    count: provider === 'openai' ? 2 : 0,
    omitted: 0,
    elapsedMs: 100,
    usage: null,
    error: null,
  })),
})

test('比較候補は保存・復元でき、従来の京都候補と一緒に保持できる', async () => {
  const next = await parseWebSearchResult(response(), query)
  const oldQuery = { region: '京都市', theme: '散歩' }
  const old = await parseWebSearchResult(
    {
      mode: 'live',
      query: oldQuery,
      retrievedAt: response().retrievedAt,
      omitted: 0,
      spots: [
        {
          ...candidate(3),
          recommendations: undefined,
          tags: undefined,
          sourceUrl: 'https://kyoto.travel/test',
        },
      ],
    },
    oldQuery,
  )
  const savedWebSpots = [{ ...next.spots[0], likedFor: [] }, next.spots[1], ...old.spots]
  const state = { ...createInitialState(), savedWebSpots, savedEvents: ['fuji'] }
  expect(decodeStoredState(JSON.stringify(state))).toEqual({ state, problem: null })
  expect(fromWebSpot(next.spots[0])).not.toHaveProperty('likedFor')
  expect(fromWebSpot(next.spots[0])).not.toHaveProperty('tags')
})
test('不正な出典・提案元・参考料金を拒否し、壊れた保存を元データ保護へ回す', async () => {
  for (const patch of [
    { recommendations: [{ provider: 'unknown', sourceUrl: 'https://example.com', reason: 'x' }] },
    { sourceUrl: 'https://localhost/path' },
    { tags: ['安全に運転できる'] },
    { likedFor: ['自然'] },
  ]) {
    const input = response()
    Object.assign(input.spots[0], patch)
    await expect(parseWebSearchResult(input, query)).rejects.toThrow()
  }
  const next = await parseWebSearchResult(response(), query)
  const saved = {
    ...createInitialState(),
    savedWebSpots: [
      {
        ...next.spots[0],
        recommendations: [
          { provider: 'anthropic', sourceUrl: 'https://other.example.com/', reason: '別ページ' },
        ],
      },
    ],
    savedEvents: ['fuji'],
  }
  expect(decodeStoredState(JSON.stringify(saved)).problem).toBe('invalid')
  expect(decodeStoredState(JSON.stringify(saved)).state.savedEvents).toEqual(['fuji'])
  const r = response()
  Object.assign(r.reports[0], { usage: { estimatedUsd: -1 } })
  await expect(parseWebSearchResult(r, query)).rejects.toThrow()
})
test('いいねの有無・理由だけを使い、解除で元の順序に戻る。サンプルと実検索は混ぜない', async () => {
  const data = response()
  data.spots = Array.from({ length: 8 }, (_, n) => candidate(n, n < 4 ? '自然' : 'カフェ'))
  const { spots } = await parseWebSearchResult(data, query)
  expect(personalRecommendations(spots, [], 'live')).toEqual(spots)
  const liked = [spots[5]]
  const ranked = personalRecommendations(spots, liked, 'live')
  expect(ranked[0].tags).toEqual(['カフェ'])
  expect(ranked[3].id).toBe(spots[0].id) // general-order discovery slot
  expect(new Set(ranked.map((s) => s.id)).size).toBe(8)
  expect(preferenceWeights(liked, 'live').weights.get('自然')).toBeUndefined()
  expect(personalRecommendations(spots, [{ ...spots[5], likedFor: [] }], 'live')).toEqual(spots)
  expect(personalRecommendations(spots, [{ ...spots[5], mode: 'sample' }], 'live')).toEqual(spots)
  expect(personalRecommendations(spots, [], 'live')).toEqual(spots)
})
test('比較出典の公開HTTPSだけを開ける。従来検索の出典制限は維持する', async () => {
  const { spots } = await parseWebSearchResult(response(), query)
  const spot: WebSpot = spots[0]
  expect(
    evaluateExternalRequest({ type: 'research', url: spot.sourceUrl, comparison: true }).destination
      ?.host,
  ).toBe('example.com')
  expect(
    evaluateExternalRequest({ type: 'research', url: spot.sourceUrl }).destination,
  ).toBeUndefined()
  for (const url of ['https://127.0.0.1', 'https://router.local', 'javascript:alert(1)'])
    expect(
      evaluateExternalRequest({ type: 'research', url, comparison: true }).destination,
    ).toBeUndefined()
})
test('同一店舗の旧保存は1件として数え、理由・元ID・保存内容を残す', async () => {
  const data = response()
  Object.assign(data.spots[0], {
    name: '茂庵',
    area: '左京区 吉田山付近',
    sourceUrl: 'https://ja.kyoto.travel/tourism/single01.php?category_id=4&tourism_id=2861',
  })
  Object.assign(data.spots[1], {
    name: '茂庵',
    area: '京都市左京区吉田神楽岡町8',
    sourceUrl: 'https://icotto.jp/presses/18579',
  })
  data.spots.forEach((s, i) => {
    s.recommendations = [
      { provider: i === 0 ? 'openai' : 'anthropic', sourceUrl: s.sourceUrl, reason: `理由${i}` },
    ]
  })
  const { spots } = await parseWebSearchResult(data, query)
  expect(spots[0].id).not.toBe(spots[1].id)
  expect(sameWebSpot(spots[0], spots[1])).toBe(true)
  const saved = [{ ...spots[0], likedFor: [] }, spots[1]]
  const before = JSON.stringify(saved)
  const grouped = groupPlaces(saved)
  expect(grouped).toHaveLength(1)
  expect(grouped[0].id).toBe(spots[0].id)
  expect(grouped[0].recommendations).toHaveLength(2)
  expect(grouped[0].likedFor).toEqual(['自然'])
  expect(preferenceWeights(saved, 'live').likes).toBe(1)
  expect(preferenceWeights(saved, 'live').weights.get('自然')).toBe(1)
  expect(preferenceWeights(saved, 'live').weights.has('カフェ')).toBe(false)
  expect(JSON.stringify(saved)).toBe(before)
  expect(
    decodeStoredState(JSON.stringify({ ...createInitialState(), savedWebSpots: saved })).problem,
  ).toBe(null)
  expect(groupPlaces([spots[0], { ...spots[1], mode: 'sample' as const }])).toHaveLength(2)
  expect(fromWebSpot(grouped[0])).not.toHaveProperty('likedFor')
})
