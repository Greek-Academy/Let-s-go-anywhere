import { expect, test } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { decodeStoredState, MAX_STORAGE_LENGTH } from '../src/state/storage'

const stamp = '2026-09-16T03:00:00.000Z'
function sample() {
  return {
    ...createInitialState(),
    onboarded: true,
    profile: { name: '確認用', area: '横浜', companion: '友人', interests: ['自然'] },
    savedEvents: ['fuji'],
    savedStations: ['times-shibuya'],
    learned: ['parking'],
    learningDates: { parking: stamp },
    memo: {
      goal: '休日の旅行',
      when: '来月',
      vehicle: '相談して決めたい',
      questions: '車庫入れを相談',
    },
    links: [
      {
        id: 'link-1',
        url: 'https://example.com/',
        title: '候補',
        source: 'example.com',
        addedAt: stamp,
      },
    ],
    consultations: [
      {
        id: 'c-1',
        schoolId: 'shirokuma',
        createdAt: stamp,
        consentAt: stamp,
        status: '送信済み（デモ）',
        shared: ['goal'],
        snapshot: { goal: '休日の旅行' },
      },
    ],
  }
}

test('valid saved data round-trips and known missing v1 sections receive independent defaults', () => {
  const data = sample()
  expect(decodeStoredState(JSON.stringify(data))).toEqual({ state: data, problem: null })
  const legacy = JSON.stringify({ profile: { name: '以前の設定' }, savedEvents: ['fuji'] })
  const first = decodeStoredState(legacy)
  const second = decodeStoredState(legacy)
  expect(first.problem).toBeNull()
  expect(first.state.profile.name).toBe('以前の設定')
  expect(first.state.savedEvents).toEqual(['fuji'])
  expect(first.state.quiz.answers).toEqual({})
  first.state.profile.interests.push('自然')
  expect(second.state.profile.interests).toEqual([])
})

test('invalid sections cannot enter the UI while valid independent sections remain readable', () => {
  const result = decodeStoredState(
    JSON.stringify({
      ...sample(),
      links: {},
      memo: null,
      map: { offset: null },
      quiz: { answers: { 'q-road': { x: 1 } } },
      settings: { largeText: 'yes' },
      outingConditions: { fuji: { avoid: ['未定義'] } },
    }),
  )
  expect(result.problem).toBe('invalid')
  expect(result.state.savedEvents).toEqual(['fuji'])
  expect(result.state.profile.name).toBe('確認用')
  expect(result.state.memo).toEqual(createInitialState().memo)
  expect(result.state.quiz.answers).toEqual({})
  expect(result.state.links).toEqual([])
  expect(result.state.map.offset).toEqual({ x: 0, y: 0 })
})

test('unknown fields and prototype keys are not copied or treated as trusted catalog configuration', () => {
  for (const extra of [
    '"contentSource":"approved"',
    '"__proto__":{"polluted":true}',
    '"constructor":{}',
  ]) {
    const raw = JSON.stringify(sample()).slice(0, -1) + ',' + extra + '}'
    const result = decodeStoredState(raw)
    expect(result.problem).toBe('invalid')
    expect(result.state).not.toHaveProperty('contentSource')
    expect(Object.hasOwn(result.state, '__proto__')).toBe(false)
  }
  const data = { ...sample(), goals: JSON.parse('{"__proto__":{"note":"test"}}') }
  expect(decodeStoredState(JSON.stringify(data)).problem).toBe('invalid')
  expect(Object.prototype).not.toHaveProperty('polluted')
})

test('malformed, oversized and excessive collections fail without coercion', () => {
  for (const raw of ['', '{', 'null', '[]', 'false', '{"version":99}']) {
    expect(decodeStoredState(raw).problem).toBe('invalid')
  }
  expect(decodeStoredState(' '.repeat(MAX_STORAGE_LENGTH + 1)).problem).toBe('limit')
  expect(
    decodeStoredState(JSON.stringify({ ...sample(), savedEvents: Array(1001).fill('fuji') }))
      .problem,
  ).toBe('invalid')
  for (const value of [null, {}, [null], [3], 'fuji']) {
    expect(decodeStoredState(JSON.stringify({ ...sample(), savedEvents: value })).problem).toBe(
      'invalid',
    )
  }
})

test('consultation history never gains missing consent or unselected snapshot fields during recovery', () => {
  const valid = sample()
  for (const patch of [
    { consentAt: '' },
    { consentAt: '2026-02-30T00:00:00.000Z' },
    { status: '予約確定' },
    { shared: ['unknown'] },
    { shared: [] },
    { snapshot: { goal: '休日の旅行', questions: '共有しなかった内容' } },
  ]) {
    const result = decodeStoredState(
      JSON.stringify({ ...valid, consultations: [{ ...valid.consultations[0], ...patch }] }),
    )
    expect(result.problem).toBe('invalid')
    expect(result.state.consultations).toEqual([])
    expect(result.state.memo.questions).toBe('車庫入れを相談')
  }
  const link = { ...valid.links[0], url: 'javascript:alert(1)' }
  // Legacy URL text is retained; activation stays behind the separate HTTPS guard.
  expect(decodeStoredState(JSON.stringify({ ...valid, links: [link] })).state.links[0].url).toBe(
    link.url,
  )
})
