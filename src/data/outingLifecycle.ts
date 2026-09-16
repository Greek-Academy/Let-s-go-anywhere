import type { OutingLifecycle } from '../domain/outingLifecycle'

/** Fictional confirmations, not production approval or real photo permission records. */
export function sampleLifecycle(
  seriesId?: string,
  startsAt?: string,
  endsAt?: string,
): OutingLifecycle {
  const check = () => ({
    state: 'confirmed' as const,
    sourceIds: ['sample-official'],
    checkedAt: '2026-09-01',
    reviewBy: '2026-12-31',
  })
  return {
    availability: 'listed',
    notice: 'normal',
    sources: [
      { id: 'sample-official', kind: 'official', available: true },
      { id: 'sample-sns', kind: 'sns', available: true },
    ],
    checks: { title: check(), location: check(), schedule: check() },
    occurrence:
      seriesId && startsAt && endsAt
        ? {
            seriesId,
            venueId: seriesId + '-venue',
            eventYear: 2026,
            startsAt,
            endsAt,
          }
        : null,
    photo: check(),
  }
}
