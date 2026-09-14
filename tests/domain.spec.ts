import { expect, test } from '@playwright/test'
import { confirmedValue, evidenceState } from '../src/domain/evidence'
import { sampleFact } from '../src/data/arrivalGuides'
import { emptyConditions, evaluateConditions, overallMatch } from '../src/domain/tripConditions'
import { tripFacts } from '../src/data/tripFacts'
import { normalizeSavedUrl, savedUrlKey } from '../src/domain/savedUrls'

test('evidence fails closed for expired, revoked, future, malformed and incomplete records', () => {
  const fact = sampleFact('車の入口')
  expect(confirmedValue(fact, '2026-09-14')).toBe('車の入口')
  expect(evidenceState(fact, '2026-12-31')).toBe('confirmed')
  expect(evidenceState(fact, '2027-01-01')).toBe('expired')
  for (const patch of [
    { status: 'withdrawn' as const },
    { checkedAt: '2026-09-15' },
    { checkedAt: '2026-02-30' },
    { reviewBy: null },
    { source: '' },
    { value: null },
  ]) {
    expect(confirmedValue({ ...fact, ...patch }, '2026-09-14')).toBeNull()
  }
})

const conditions = {
  ...emptyConditions(),
  date: '2026-09-19',
  departAt: '09:00',
  returnBy: '18:00',
  budget: '8000',
  avoid: ['夜間' as const],
}
const origin = '東京・渋谷駅周辺'
const at = '2026-09-14'
test('matching needs complete cost and route context; expiry and updates invalidate a previous match', () => {
  expect(
    overallMatch(
      evaluateConditions(
        conditions,
        { ...tripFacts.cafe, returnAt: sampleFact('08:00') },
        origin,
        at,
      ),
    ),
  ).toBe('unknown')
  expect(overallMatch(evaluateConditions(conditions, tripFacts.cafe, origin, at))).toBe('match')
  for (const [c, o, date] of [
    [{ ...conditions, date: '2026-09-20' }, origin, at],
    [conditions, '新宿', at],
    [conditions, origin, '2027-01-01'],
  ] as const) {
    expect(overallMatch(evaluateConditions(c, tripFacts.cafe, o, date))).toBe('unknown')
  }
  expect(
    overallMatch(
      evaluateConditions(
        conditions,
        { ...tripFacts.cafe, returnAt: sampleFact('19:00') },
        origin,
        at,
      ),
    ),
  ).toBe('mismatch')
  expect(
    overallMatch(
      evaluateConditions(
        conditions,
        {
          ...tripFacts.cafe,
          totalCost: sampleFact({ min: 2000, max: 3000, complete: false, scope: '入場のみ' }),
        },
        origin,
        at,
      ),
    ),
  ).toBe('unknown')
  expect(
    overallMatch(evaluateConditions({ ...conditions, budget: '3000' }, tripFacts.cafe, origin, at)),
  ).toBe('mismatch')
})

test('avoided scenes are independent of popularity; missing routes cannot pass and invalid data cannot certify a match', () => {
  expect(overallMatch(evaluateConditions(conditions, tripFacts.fireworks, origin, at))).toBe(
    'mismatch',
  )
  expect(
    overallMatch(
      evaluateConditions({ ...conditions, avoid: ['高速道路'] }, tripFacts.fireworks, origin, at),
    ),
  ).toBe('mismatch')
  expect(
    overallMatch(
      evaluateConditions({ ...conditions, avoid: ['狭い道'] }, tripFacts.cafe, origin, at),
    ),
  ).toBe('unknown')
  expect(overallMatch(evaluateConditions(conditions, undefined, origin, at))).toBe('unknown')
  expect(
    overallMatch(
      evaluateConditions({ ...conditions, returnBy: '08:00' }, tripFacts.cafe, origin, at),
    ),
  ).toBe('unknown')
  expect(
    overallMatch(
      evaluateConditions(
        conditions,
        {
          ...tripFacts.cafe,
          totalCost: sampleFact({ min: -100, max: -10, complete: true, scope: 'invalid' }),
        },
        origin,
        at,
      ),
    ),
  ).toBe('unknown')
})

test('SNS normalization uses exact domain boundaries and only known post identities', () => {
  expect(savedUrlKey('https://twitter.com/u/status/123?s=20')).toBe(
    savedUrlKey('https://x.com/i/web/status/123#fragment'),
  )
  expect(savedUrlKey('https://www.tiktok.com/@u/video/456?utm_source=a')).toBe(
    savedUrlKey('https://www.tiktok.com/@u/video/456?utm_source=b'),
  )
  expect(normalizeSavedUrl('https://eviltiktok.com/a').source).toBe('eviltiktok.com')
  expect(normalizeSavedUrl('https://tiktok.com.example.org/a').source).toBe(
    'tiktok.com.example.org',
  )
  expect(normalizeSavedUrl('https://vm.tiktok.com/example/').source).toBe('TikTok')
  const arbitrary = 'https://example.org/a?signature=abc&section=one#details'
  expect(normalizeSavedUrl(arbitrary).url).toBe(arbitrary)
  expect(savedUrlKey('https://example.org/a#one')).not.toBe(
    savedUrlKey('https://example.org/a#two'),
  )
})

test('invalid schemes, credentials, local addresses and obfuscated IP inputs are refused', () => {
  for (const url of [
    '',
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/a',
    'https://user:secret@x.com/a',
    'http://localhost/a',
    'http://a.local/a',
    'http://127.0.0.1/a',
    'http://2130706433/a',
    'http://0x7f000001/a',
    'http://[::1]/',
    'https://x.com:8443/u/status/123',
    'https://x.com/\na',
    'https://x.com\\@example.com/a',
    'https://x.com/' + 'x'.repeat(2048),
  ]) {
    expect(() => normalizeSavedUrl(url), url).toThrow()
  }
})
