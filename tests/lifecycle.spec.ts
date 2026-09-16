import { expect, test } from '@playwright/test'
import { events, spots } from '../src/data/mockData'
import {
  evaluateOuting,
  duplicateCandidates,
  occursThisWeekend,
} from '../src/domain/outingLifecycle'
import type { Outing } from '../src/data/types'

const now = new Date('2026-09-16T03:00:00Z')
const event = (): Outing => structuredClone(events[0])
const evaluate = (o: Outing, time = now.toISOString()) => evaluateOuting(o, new Date(time))

test('start is inclusive and end exclusive; equivalent UTC timestamps and JST year boundaries agree', () => {
  const o = event()
  for (const [time, state] of [
    ['2026-09-19T18:29:59+09:00', 'scheduled'],
    ['2026-09-19T18:30:00+09:00', 'ongoing'],
    ['2026-09-19T10:59:59Z', 'ongoing'],
    ['2026-09-19T11:00:00Z', 'ended'],
  ])
    expect(evaluate(o, time).state).toBe(state)
  o.lifecycle!.occurrence = {
    ...o.lifecycle!.occurrence!,
    eventYear: 2027,
    startsAt: '2026-12-31T15:00:00Z',
    endsAt: '2027-01-01T02:00:00+09:00',
  }
  expect(evaluate(o, '2026-12-31T23:59:59+09:00').state).toBe('scheduled')
  o.lifecycle!.occurrence.eventYear = 2026
  expect(evaluate(o).recommendable).toBe(false)
})

test('review deadlines include the whole JST day and saved records are not mutated', () => {
  const o = structuredClone(spots[0])
  const before = JSON.stringify(o)
  expect(evaluate(o, '2026-12-31T23:59:59+09:00').recommendable).toBe(true)
  const expired = evaluate(o, '2026-12-31T15:00:00Z')
  expect(expired).toMatchObject({
    state: 'needs-review',
    recommendable: false,
    photoVisible: false,
  })
  expect(expired.reasons.join('')).toContain('確認期限を過ぎています')
  expect(JSON.stringify(o)).toBe(before)
})

test('missing, malformed, future, withdrawn or unavailable evidence cannot recommend a listing', () => {
  const patches: ((o: Outing) => void)[] = [
    (o) => {
      delete o.lifecycle
    },
    (o) => {
      o.lifecycle!.checks.schedule.state = 'unconfirmed'
    },
    (o) => {
      o.lifecycle!.checks.title.checkedAt = '2026-09-17'
    },
    (o) => {
      o.lifecycle!.checks.title.reviewBy = '2026-02-30'
    },
    (o) => {
      o.lifecycle!.checks.location.state = 'withdrawn'
    },
    (o) => {
      o.lifecycle!.checks.title.sourceIds = ['missing']
    },
    (o) => {
      o.lifecycle!.checks.title.sourceIds = ['sample-sns']
    },
    (o) => {
      o.lifecycle!.sources[0].available = false
    },
    (o) => {
      o.lifecycle!.sources.push({ ...o.lifecycle!.sources[0] })
    },
    (o) => {
      o.lifecycle!.occurrence!.startsAt = '2026-02-30T10:00:00+09:00'
    },
    (o) => {
      o.lifecycle!.occurrence!.startsAt = '2026-09-19T18:30:00'
    },
    (o) => {
      o.lifecycle!.occurrence!.endsAt = o.lifecycle!.occurrence!.startsAt
    },
    (o) => {
      o.lifecycle!.occurrence!.venueId = ''
    },
  ]
  for (const patch of patches) {
    const o = event()
    patch(o)
    expect(evaluate(o), String(patch)).toMatchObject({
      state: 'needs-review',
      recommendable: false,
    })
  }
  expect(evaluateOuting(event(), new Date(NaN))).toMatchObject({
    recommendable: false,
    photoVisible: false,
  })
})

test('explicit cancellation, postponement and withdrawal stay excluded after old dates expire', () => {
  for (const notice of ['cancelled', 'postponed'] as const) {
    const o = event()
    o.lifecycle!.notice = notice
    for (const time of [now.toISOString(), '2027-01-01T00:00:00Z'])
      expect(evaluate(o, time)).toMatchObject({ state: notice, recommendable: false })
    o.lifecycle!.availability = 'withdrawn'
    expect(evaluate(o)).toMatchObject({
      state: 'withdrawn',
      recommendable: false,
      photoVisible: false,
    })
  }
})

test('photo removal does not remove independently supported facts; loss of their sole source does', () => {
  const o = event()
  o.lifecycle!.photo.sourceIds = ['sample-sns']
  o.lifecycle!.sources[1].available = false
  expect(evaluate(o)).toMatchObject({
    state: 'scheduled',
    recommendable: true,
    photoVisible: false,
  })
  o.lifecycle!.sources[1].available = true
  o.lifecycle!.photo.state = 'withdrawn'
  expect(evaluate(o)).toMatchObject({ recommendable: true, photoVisible: false })
  o.lifecycle!.sources[0].available = false
  expect(evaluate(o)).toMatchObject({
    state: 'needs-review',
    recommendable: false,
    photoVisible: false,
  })
})

test('duplicates require same series, venue, year and exact instants; suggestions preserve separate sources', () => {
  const a = event(),
    b = event()
  b.id = 'same-occurrence-second-source'
  b.lifecycle!.occurrence!.startsAt = '2026-09-19T09:30:00Z'
  b.lifecycle!.sources[0].id = 'independent-second-source'
  for (const c of Object.values(b.lifecycle!.checks)) c.sourceIds = ['independent-second-source']
  const before = JSON.stringify([a, b])
  expect(duplicateCandidates([a, b], now)).toEqual([[a.id, b.id]])
  expect(JSON.stringify([a, b])).toBe(before)
  const venue = structuredClone(b)
  venue.lifecycle!.occurrence!.venueId = 'other-venue'
  const year = structuredClone(b)
  year.lifecycle!.occurrence = {
    ...year.lifecycle!.occurrence!,
    eventYear: 2027,
    startsAt: '2027-09-19T09:30:00Z',
    endsAt: '2027-09-19T11:00:00Z',
  }
  const time = structuredClone(b)
  time.lifecycle!.occurrence!.endsAt = '2026-09-19T12:00:00Z'
  const unknown = structuredClone(b)
  unknown.lifecycle!.checks.schedule.state = 'unconfirmed'
  for (const other of [venue, year, time, unknown])
    expect(duplicateCandidates([a, other], now)).toEqual([])
})

test('weekend is computed in JST from overlapping confirmed periods, not an old fixture flag', () => {
  expect(occursThisWeekend(event(), now)).toBe(true)
  expect(occursThisWeekend(event(), new Date('2026-09-20T01:00:00Z'))).toBe(false)
  expect(occursThisWeekend(events[1], new Date('2026-09-20T01:00:00Z'))).toBe(true)
  expect(occursThisWeekend(events[1], new Date('2026-09-21T00:00:00Z'))).toBe(false)
  expect(occursThisWeekend(spots[0], now)).toBe(false)
  const o = event()
  o.lifecycle!.occurrence!.endsAt = '2026-09-19T00:00:00+09:00'
  o.lifecycle!.occurrence!.startsAt = '2026-09-18T20:00:00+09:00'
  expect(occursThisWeekend(o, now)).toBe(false)
  o.lifecycle!.occurrence!.startsAt = '2026-09-21T00:00:00+09:00'
  o.lifecycle!.occurrence!.endsAt = '2026-09-21T01:00:00+09:00'
  expect(occursThisWeekend(o, now)).toBe(false)
})
