import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'
import { createRamenState } from '../src/ramen/model'
import type { RamenAnswer } from '../src/ramen/model'
import profile from '../src/ramen/profile.json' with { type: 'json' }
import data from '../src/ramen/questions.json' with { type: 'json' }
import protocol from '../src/ramen/protocol.json' with { type: 'json' }
import provenance from '../src/ramen/provenance.json' with { type: 'json' }
import sources from '../src/ramen/sources.json' with { type: 'json' }
import scoring from '../src/ramen/vendor/scoring.js'

const original = createRequire(import.meta.url)(
  './fixtures/ramen/scoring-original.cjs',
) as typeof scoring
const digest = (file: string) =>
  createHash('sha256')
    .update(readFileSync(resolve(file)))
    .digest('hex')

test('fixed 100 questions, original photo bytes, 16 types, and scoring source provenance are retained', () => {
  expect(data.questions).toEqual(protocol.questions)
  expect(data.questions).toHaveLength(100)
  expect(new Set(data.questions.map((q) => q.photo_id)).size).toBe(100)
  expect(profile.types).toHaveLength(16)
  for (const [name, value] of [
    ['questions.json', data],
    ['profile.json', profile],
  ] as const) {
    expect(createHash('sha256').update(JSON.stringify(value)).digest('hex')).toBe(
      provenance.semanticSha256[name],
    )
  }
  expect(digest('tests/fixtures/ramen/scoring-original.cjs')).toBe(
    provenance.files['dist/scoring.js'],
  )
  for (const q of data.questions) {
    expect(digest(`public/images/ramen/${q.photo_id}.jpg`)).toBe(
      provenance.files.photos[q.photo_id as keyof typeof provenance.files.photos],
    )
    expect(profile.photos.find((p) => p.id === q.photo_id)?.image_sha256).toBe(
      provenance.files.photos[q.photo_id as keyof typeof provenance.files.photos],
    )
    expect(sources.filter((s) => s.id === q.photo_id)).toHaveLength(1)
  }
})

test('all outputs match the original 100-photo scoring factory for uniform, mixed, missing, and 16 directional response sets', () => {
  const cases: RamenAnswer[][] = ['yes', 'maybe', 'no', 'skip'].map((v) =>
    data.questions.map(() => v as RamenAnswer),
  )
  cases.push(data.questions.map((_, i) => (['yes', 'maybe', 'no', 'skip'] as const)[i % 4]))
  for (const type of profile.types)
    cases.push(
      data.questions.map((q) => {
        const p = profile.photos.find((p) => p.id === q.photo_id)!
        const affinity = profile.axes.reduce(
          (sum, axis, i) =>
            sum +
            (p.axes[axis.id as keyof typeof p.axes] ?? 0) *
              (type.code[i] === axis.letters[1] ? 1 : -1),
          0,
        )
        return affinity > 0 ? 'yes' : affinity < 0 ? 'no' : 'maybe'
      }),
    )
  let seed = 19427
  for (let i = 0; i < 20; i++)
    cases.push(
      data.questions.map(() => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return (['yes', 'maybe', 'no', 'skip'] as const)[seed >>> 30]
      }),
    )
  for (const values of cases) {
    const answers = data.questions.map((q, i) => ({ photo_id: q.photo_id, value: values[i] }))
    const result = scoring.score(profile, answers)
    expect(result).toEqual(original.score(profile, answers))
    expect(scoring.toText(result, profile)).toBe(original.toText(result, profile))
  }
  for (const n of [0, 1, 5, 10, 25, 50]) {
    const partial = data.questions
      .slice(0, n)
      .map((q, i) => ({ photo_id: q.photo_id, value: (i % 2 ? 'yes' : 'no') as RamenAnswer }))
    expect(scoring.score(profile, partial)).toEqual(original.score(profile, partial))
  }
})

test('all neutral is undecided and unreadable photos are excluded rather than rated neutral', () => {
  const answers = data.questions.map((q) => ({ photo_id: q.photo_id, value: 'maybe' as const }))
  const neutral = scoring.score(profile, answers)
  expect(neutral).toMatchObject({
    code: null,
    closest_code: null,
    maybe: 100,
    valid: 100,
    skipped: 0,
    enoughVariation: false,
  })
  const skipped = scoring.score(
    profile,
    answers.map((a) => ({ ...a, value: 'skip' })),
  )
  expect(skipped).toMatchObject({
    code: null,
    closest_code: null,
    maybe: 0,
    valid: 0,
    skipped: 100,
  })
  expect(skipped.axes.every((a) => a.status === 'insufficient')).toBe(true)
  expect(neutral.axes.every((a) => a.minus.rate === 0.5 && a.plus.rate === 0.5)).toBe(true)
})

test('ramen state migrates without losing outings, accepts all 100 ids, and protects malformed or incompatible records', () => {
  const initial = { ...createInitialState(), savedEvents: ['fuji'] }
  const legacy = { ...initial } as Partial<typeof initial>
  delete legacy.ramen
  expect(decodeStoredState(JSON.stringify(legacy))).toEqual({ state: initial, problem: null })
  const full = {
    ...initial,
    ramen: {
      ...createRamenState(),
      cursor: 99,
      answers: Object.fromEntries(data.questions.map((q) => [q.id, 'maybe'])),
    },
  }
  expect(decodeStoredState(JSON.stringify(full))).toEqual({ state: full, problem: null })
  for (const invalid of [
    { cursor: 100 },
    { cursor: -1 },
    { dataset: 'different' },
    { answers: { q000: 'yes' } },
    { answers: { q101: 'maybe' } },
    { answers: { q001: 'bad' } },
  ]) {
    const decoded = decodeStoredState(
      JSON.stringify({ ...initial, ramen: { ...initial.ramen, ...invalid } }),
    )
    expect(decoded.problem).toBe('invalid')
    expect(decoded.state.savedEvents).toEqual(['fuji'])
    expect(decoded.state.ramen).toEqual(createRamenState())
  }
})
