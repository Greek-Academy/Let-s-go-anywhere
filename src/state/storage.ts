import { createInitialState } from './model'
import { stateStore } from '../platform/stateStore'
import { isNativeApp } from '../platform/runtime'
import type { AppState } from './model'
import { conditionsError, drivingScenes } from '../domain/tripConditions'
import type { TripConditions } from '../domain/tripConditions'
import { validTimestamp } from '../domain/dates'
import { prefectures } from '../data/regions'

export const STORAGE_KEY = 'driveplus.mock.v1'
export const MAX_STORAGE_LENGTH = 2 * 1024 * 1024 // UTF-16 code units, checked before JSON.parse
const MAX_ITEMS = 1000
const MAX_TEXT = 20_000
export type StorageProblem = 'invalid' | 'limit' | 'unavailable' | 'changed' | 'write-failed'
type Rule = (value: unknown) => unknown
const bad = (): never => {
  throw new Error('Invalid stored state')
}
const own = (o: object, key: string) => Object.hasOwn(o, key)
const forbidden = (key: string) => ['__proto__', 'prototype', 'constructor'].includes(key)
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad()
  const keys = Object.keys(value)
  if (keys.length > MAX_ITEMS || keys.some(forbidden)) return bad()
  return value as Record<string, unknown>
}
const text: Rule = (v) => (typeof v === 'string' && v.length <= MAX_TEXT ? v : bad())
const bool: Rule = (v) => (typeof v === 'boolean' ? v : bad())
const id: Rule = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v) && !forbidden(v) ? v : bad()
const oneOf =
  (values: readonly unknown[]): Rule =>
  (v) =>
    values.includes(v) ? v : bad()
const number =
  (min: number, max: number, integer = false): Rule =>
  (v) =>
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= min &&
    v <= max &&
    (!integer || Number.isInteger(v))
      ? v
      : bad()
const date: Rule = (v) =>
  typeof v === 'string' && validTimestamp(v.replace(/\.\d{1,3}(?=Z|[+-])/, '')) ? v : bad()
const nullable =
  (rule: Rule): Rule =>
  (v) =>
    v === null ? null : rule(v)
const list =
  (rule: Rule, uniqueIds = false): Rule =>
  (v) => {
    if (!Array.isArray(v) || v.length > MAX_ITEMS) return bad()
    const result = v.map(rule)
    if (
      uniqueIds &&
      new Set(result.map((item) => (item as { id: string }).id)).size !== result.length
    )
      return bad()
    return result
  }
const dict =
  (rule: Rule): Rule =>
  (v) =>
    Object.fromEntries(Object.entries(object(v)).map(([key, value]) => [id(key), rule(value)]))
const shape =
  (
    fields: Record<string, Rule>,
    defaults: Record<string, unknown> = {},
    optional: string[] = [],
  ): Rule =>
  (v) => {
    const source = object(v)
    if (Object.keys(source).some((key) => !own(fields, key))) return bad()
    return Object.fromEntries(
      Object.entries(fields).flatMap(([key, rule]) => {
        if (own(source, key)) return [[key, rule(source[key])]]
        if (own(defaults, key)) return [[key, structuredClone(defaults[key])]]
        if (optional.includes(key)) return []
        return bad()
      }),
    )
  }
const sharedFields = [
  'goal',
  'when',
  'vehicle',
  'questions',
  'experience',
  'concerns',
  'knowledge',
] as const
const initial = createInitialState()
const conditionsShape = shape(
  { date: text, departAt: text, returnBy: text, budget: text, avoid: list(oneOf(drivingScenes)) },
  { ...initial.searchConditions },
)
const conditions: Rule = (v) => {
  const parsed = conditionsShape(v) as TripConditions
  return conditionsError(parsed) ? bad() : parsed
}
const consultationShape = shape({
  id,
  schoolId: id,
  createdAt: date,
  consentAt: date,
  status: oneOf(['送信済み（デモ）', '相談受付（デモ）', 'キャンセル（デモ）']),
  shared: list(oneOf(sharedFields)),
  snapshot: shape(Object.fromEntries(sharedFields.map((key) => [key, text])), {}, [
    ...sharedFields,
  ]),
})
const consultation: Rule = (v) => {
  const parsed = consultationShape(v) as AppState['consultations'][number]
  // A malformed history entry must never gain missing consent or extra shared fields.
  if (
    !parsed.shared.length ||
    new Set(parsed.shared).size !== parsed.shared.length ||
    parsed.shared.length !== Object.keys(parsed.snapshot).length ||
    parsed.shared.some((key) => !own(parsed.snapshot, key))
  )
    return bad()
  return parsed
}
const schema: Record<keyof AppState, Rule> = {
  onboarded: bool,
  profile: shape(
    { name: text, area: text, companion: text, interests: list(text) },
    { ...initial.profile },
  ),
  savedEvents: list(id),
  savedStations: list(id),
  hiddenEvents: list(id),
  learned: list(id),
  links: list(
    shape({ id, url: text, originalUrl: text, title: text, source: text, addedAt: date }, {}, [
      'originalUrl',
    ]),
    true,
  ),
  learningDates: dict(date),
  searchConditions: conditions,
  conditionFilter: oneOf(['all', 'match', 'mismatch', 'unknown']),
  outingConditions: dict(conditions),
  quiz: shape(
    {
      experience: text,
      concerns: list(text),
      answers: dict(nullable(number(0, 1000, true))),
      completed: bool,
    },
    { ...initial.quiz },
  ),
  memo: shape({ goal: text, when: text, vehicle: text, questions: text }),
  consultations: list(consultation, true),
  reflections: list(
    shape({ id, type: text, outcome: text, note: text, advice: text, createdAt: date }),
    true,
  ),
  goals: dict(shape({ companion: text, when: text, note: text })),
  map: shape(
    {
      type: oneOf(['すべて', 'レンタカー', 'カーシェア']),
      providers: list(text),
      area: text,
      query: text,
      mode: oneOf(['map', 'list']),
      selected: nullable(id),
      offset: shape({ x: number(-65, 65), y: number(-65, 65) }, { ...initial.map.offset }),
    },
    { ...initial.map },
  ),
  discover: shape(
    {
      category: oneOf(['おすすめ', '今週末', 'イベント', 'スポット']),
      search: text,
      tag: text,
      region: oneOf(['origin', 'all', ...prefectures]),
    },
    { region: initial.discover.region },
  ),
  schoolFilters: shape({ area: text, practice: text, budget: text, vehicle: text }),
  settings: shape({ largeText: bool, reducedMotion: bool }, { ...initial.settings }),
}

/** Decode only known v1 fields; all raw input stays outside the React state tree. */
export function decodeStoredState(raw: string | null): {
  state: AppState
  problem: StorageProblem | null
} {
  const state = createInitialState()
  if (raw === null) return { state, problem: null }
  if (raw.length > MAX_STORAGE_LENGTH) return { state, problem: 'limit' }
  try {
    const data = object(JSON.parse(raw))
    // Existing v1 records always have a profile and savedEvents. Other missing
    // sections are known legacy fields and receive defaults, not new approval.
    if (!own(data, 'profile') || !own(data, 'savedEvents')) return { state, problem: 'invalid' }
    let problem: StorageProblem | null = Object.keys(data).some((key) => !own(schema, key))
      ? 'invalid'
      : null
    for (const key of Object.keys(schema) as (keyof AppState)[]) {
      if (!own(data, key)) continue
      try {
        // Each rule builds a fresh, typed section and rejects unknown keys.
        Object.assign(state, { [key]: schema[key](data[key]) })
      } catch {
        problem = 'invalid'
      }
    }
    return { state, problem }
  } catch {
    return { state, problem: 'invalid' }
  }
}

export type StoredSnapshot = ReturnType<typeof decodeStoredState> & { raw: string | null }
let nativeSnapshot: StoredSnapshot | undefined

/** Finish the native read before mounting React, so defaults cannot overwrite saved data. */
export async function initializeStorage(): Promise<void> {
  if (!isNativeApp) return
  try {
    const raw = await stateStore.getItem(STORAGE_KEY)
    nativeSnapshot = { ...decodeStoredState(raw), raw }
  } catch {
    nativeSnapshot = { state: createInitialState(), problem: 'unavailable', raw: null }
  }
}

export function readStoredState(): StoredSnapshot {
  if (isNativeApp)
    return nativeSnapshot ?? { state: createInitialState(), problem: 'unavailable', raw: null }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return { ...decodeStoredState(raw), raw }
  } catch {
    return { state: createInitialState(), problem: 'unavailable', raw: null }
  }
}

export async function writeStoredState(
  state: AppState,
  expected: string | null,
): Promise<{ raw: string | null; problem: StorageProblem | null }> {
  try {
    const raw = JSON.stringify(state)
    // Apply the same boundary to writes, so data created here can be read back.
    const { problem } = decodeStoredState(raw)
    if (problem) return { raw: expected, problem: problem === 'limit' ? 'limit' : 'write-failed' }
    const current = isNativeApp
      ? await stateStore.getItem(STORAGE_KEY)
      : localStorage.getItem(STORAGE_KEY)
    if (current !== expected) return { raw: expected, problem: 'changed' }
    // Keep the browser compare/write in one synchronous task, as before.
    if (isNativeApp) await stateStore.setItem(STORAGE_KEY, raw)
    else localStorage.setItem(STORAGE_KEY, raw)
    return { raw, problem: null }
  } catch {
    return { raw: expected, problem: 'write-failed' }
  }
}
