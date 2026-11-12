import { test, expect } from '@playwright/test'
import { hiddenSpotRecord, visibleWebSpots, sameHiddenSpot } from '../src/domain/hiddenSpots'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'
import type { WebSpot } from '../src/domain/webSearch'

const spot: WebSpot = {
  id: `web_live_${'a'.repeat(64)}`,
  name: '森のカフェ 新宿店',
  area: '東京都新宿区',
  mode: 'live',
  sourceUrl: 'https://example.com/first',
  recommendations: [
    { provider: 'gemini', sourceUrl: 'https://example.com/first', reason: '架空の理由' },
  ],
  tags: [],
  summary: '架空の説明',
  matchReason: '架空の理由',
  verification: 'unconfirmed',
  retrievedAt: '2026-11-13T01:00:00.000Z',
}

test('検索ID・出典・提案元が変わっても同じ候補を除外し、別支店・別地域・サンプルを巻き込まない', () => {
  const hidden = [hiddenSpotRecord(spot)]
  const again = {
    ...spot,
    id: 'other',
    name: '森のカフェ　新宿店',
    sourceUrl: 'https://other.example.com/new',
    recommendations: [
      {
        provider: 'gemini' as const,
        sourceUrl: 'https://other.example.com/new',
        reason: '別の希望',
      },
    ],
  }
  const otherArea = { ...spot, id: 'other-area', area: '神奈川県横浜市' }
  const otherBranch = { ...spot, id: 'other-branch', name: '森のカフェ 高田馬場店' }
  const sample = { ...spot, mode: 'sample' as const }
  expect(visibleWebSpots([spot, again, otherArea, otherBranch, sample], hidden)).toEqual([
    otherArea,
    otherBranch,
    sample,
  ])
  expect(visibleWebSpots([spot, again], [])).toEqual([spot, again])
})

test('確認済みの同一地点は住所の表記違いでも対象にし、未確認の類似住所は推測しない', () => {
  const a = hiddenSpotRecord({
    ...spot,
    name: '茂庵',
    area: '左京区 吉田山付近',
    sourceUrl: 'https://ja.kyoto.travel/tourism/single01.php?category_id=4&tourism_id=2861',
  })
  const b = hiddenSpotRecord({
    ...spot,
    name: '茂庵',
    area: '京都市左京区吉田神楽岡町8',
    sourceUrl: 'https://icotto.jp/presses/18579',
  })
  expect(sameHiddenSpot(a, b)).toBe(true)
  expect(sameHiddenSpot(a, { ...b, reviewedId: undefined })).toBe(false)
})

test('旧保存を移行して趣味・出発地・行きたいを残し、非表示には地点の識別情報だけを保存する', () => {
  const old = { ...createInitialState(), savedWebSpots: [spot], hiddenEvents: ['fuji'] }
  old.profile.interests = ['自然', 'グルメ']
  old.discover.region = 'station'
  old.discover.stationId = '1130208'
  const { hiddenWebSpots: _, ...legacy } = old
  expect(decodeStoredState(JSON.stringify(legacy))).toEqual({ state: old, problem: null })
  const full = {
    ...spot,
    googleRating: { rating: 4.5, count: 100, mapsUrl: 'https://maps.google.com/?cid=123' },
    travel: { durationSeconds: 7200 },
    location: { lat: 35, lng: 139 },
  } as unknown as WebSpot
  const record = hiddenSpotRecord(full)
  expect(record).toEqual({ name: spot.name, area: spot.area, mode: 'live' })
  const next = { ...old, hiddenWebSpots: [record] }
  expect(decodeStoredState(JSON.stringify(next))).toEqual({ state: next, problem: null })
  for (const invalid of [
    { ...record, googleRating: {} },
    { ...record, name: '' },
    { ...record, reviewedId: 'unknown' },
    { ...record, mode: 'unknown' },
  ]) {
    const decoded = decodeStoredState(JSON.stringify({ ...next, hiddenWebSpots: [invalid] }))
    expect(decoded.problem).toBe('invalid')
    expect(decoded.state.savedWebSpots).toEqual([spot])
  }
})
