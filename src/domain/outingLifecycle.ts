import { evidenceState } from './evidence'
import type { EvidenceState } from './evidence'
import { japanDate, validTimestamp } from './dates'
import type { Outing } from '../data/types'

/** Trusted catalog projection. It carries no private permission notes or approval authority. */
export interface LifecycleSource {
  id: string
  kind: 'official' | 'onsite' | 'sns'
  available: boolean
}
export interface LifecycleCheck {
  state: 'confirmed' | 'unconfirmed' | 'withdrawn'
  sourceIds: string[]
  checkedAt: string | null
  reviewBy: string | null
}
export interface EventOccurrence {
  seriesId: string
  venueId: string
  eventYear: number
  startsAt: string
  endsAt: string
}
export interface OutingLifecycle {
  availability: 'listed' | 'withdrawn'
  notice: 'normal' | 'cancelled' | 'postponed'
  sources: LifecycleSource[]
  checks: Record<'title' | 'location' | 'schedule', LifecycleCheck>
  occurrence: EventOccurrence | null
  photo: LifecycleCheck
}
export type OutingState =
  | 'scheduled'
  | 'ongoing'
  | 'permanent'
  | 'ended'
  | 'cancelled'
  | 'postponed'
  | 'needs-review'
  | 'withdrawn'
export const outingStateLabels: Record<OutingState, string> = {
  scheduled: '開催予定',
  ongoing: '開催中',
  permanent: '常設スポット',
  ended: '終了',
  cancelled: '中止',
  postponed: '延期・日程未確定',
  'needs-review': '要確認',
  withdrawn: '掲載停止',
}
export interface OutingEvaluation {
  state: OutingState
  recommendable: boolean
  photoVisible: boolean
  reasons: string[]
  dateLabel: string
  checkedAt: string | null
}

function sourceState(
  lifecycle: OutingLifecycle,
  check: LifecycleCheck,
  at: string,
  independent: boolean,
): EvidenceState {
  const ids = lifecycle.sources.map((s) => s.id)
  if (
    ids.some((id) => !id.trim()) ||
    new Set(ids).size !== ids.length ||
    !check.sourceIds.length ||
    new Set(check.sourceIds).size !== check.sourceIds.length ||
    check.sourceIds.some((id) => !ids.includes(id))
  )
    return 'unconfirmed'
  const usable = lifecycle.sources.some(
    (s) =>
      check.sourceIds.includes(s.id) &&
      s.available &&
      (!independent || s.kind === 'official' || s.kind === 'onsite'),
  )
  return evidenceState(
    {
      value: usable ? true : null,
      status: check.state,
      source: usable ? 'catalog-reference' : '',
      checkedAt: check.checkedAt,
      reviewBy: check.reviewBy,
    },
    at,
  )
}

export function validOccurrence(value: EventOccurrence | null): value is EventOccurrence {
  if (
    !value ||
    !value.seriesId.trim() ||
    !value.venueId.trim() ||
    !validTimestamp(value.startsAt) ||
    !validTimestamp(value.endsAt) ||
    Date.parse(value.endsAt) <= Date.parse(value.startsAt)
  )
    return false
  return (
    Number.isInteger(value.eventYear) &&
    value.eventYear === Number(japanDate(new Date(value.startsAt)).slice(0, 4))
  )
}
function periodLabel(occurrence: EventOccurrence): string {
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${fmt.format(new Date(occurrence.startsAt))} 〜 ${fmt.format(new Date(occurrence.endsAt))}`
}

/** Re-evaluate from a catalog snapshot and explicit time; saved IDs never preserve old status. */
export function evaluateOuting(outing: Outing, now: Date): OutingEvaluation {
  const life = outing.lifecycle
  const result: OutingEvaluation = {
    state: 'needs-review',
    recommendable: false,
    photoVisible: false,
    reasons: [],
    dateLabel:
      outing.kind === 'event' ? '開催日時は再確認が必要です' : '営業情報は再確認が必要です',
    checkedAt: null,
  }
  if (!life || !Number.isFinite(now.getTime())) {
    result.reasons.push('確認に必要な情報が揃っていません。')
    return result
  }
  const at = japanDate(now)
  result.photoVisible =
    life.availability === 'listed' && sourceState(life, life.photo, at, false) === 'confirmed'
  if (!result.photoVisible)
    result.reasons.push('写真の利用条件を確認できないため、写真を表示していません。')
  const fields =
    outing.kind === 'event'
      ? (['title', 'location', 'schedule'] as const)
      : (['title', 'location'] as const)
  const labels = { title: '名称', location: '場所', schedule: '開催日時' }
  let current = true
  for (const field of fields) {
    const state = sourceState(life, life.checks[field], at, true)
    if (state !== 'confirmed') {
      current = false
      result.reasons.push(
        state === 'expired'
          ? `${labels[field]}の確認期限を過ぎています。`
          : `${labels[field]}の確認根拠を再確認しています。`,
      )
    }
  }
  const period = validOccurrence(life.occurrence) ? life.occurrence : null
  if (current && (outing.kind === 'spot' ? life.occurrence === null : !!period)) {
    result.checkedAt = fields.map((f) => life.checks[f].checkedAt!).sort()[0]
    if (outing.kind === 'spot') {
      result.state = 'permanent'
      result.dateLabel = '常設スポット'
    } else if (period) {
      result.dateLabel = periodLabel(period)
      result.state =
        now.getTime() >= Date.parse(period.endsAt)
          ? 'ended'
          : now.getTime() >= Date.parse(period.startsAt)
            ? 'ongoing'
            : 'scheduled'
    }
  } else if (outing.kind === 'event' && !period) {
    result.reasons.push('開催年・会場・開催期間を再確認しています。')
  }
  // Explicit stops are sticky even after their review deadline or old end date.
  if (life.notice === 'cancelled') {
    result.state = 'cancelled'
    result.reasons.unshift('この開催は中止されています。保存した候補はそのまま残しています。')
    result.dateLabel = '中止（開催予定だった日時は再確認）'
  } else if (life.notice === 'postponed') {
    result.state = 'postponed'
    result.dateLabel = '延期後の日程は未確認です'
    result.reasons.unshift('延期後の開催日時を確認するまで、おすすめには表示しません。')
  }
  if (life.availability === 'withdrawn') {
    result.state = 'withdrawn'
    result.reasons.unshift('このお出かけ情報は掲載を停止しています。')
    result.dateLabel = '掲載停止'
  }
  if (result.state === 'ended')
    result.reasons.unshift('この開催は終了しました。次回の開催情報とは別に保存しています。')
  result.recommendable = ['scheduled', 'ongoing', 'permanent'].includes(result.state)
  return result
}

/** Saturday 00:00 to Monday 00:00 JST of this week's weekend. */
export function occursThisWeekend(outing: Outing, now: Date): boolean {
  if (outing.kind !== 'event' || !evaluateOuting(outing, now).recommendable) return false
  const period = outing.lifecycle?.occurrence
  if (!validOccurrence(period ?? null) || !period) return false
  const midnight = new Date(`${japanDate(now)}T00:00:00+09:00`)
  const weekday = new Date(`${japanDate(now)}T00:00:00Z`).getUTCDay()
  const offset = weekday === 0 ? -1 : 6 - weekday
  const start = midnight.getTime() + offset * 86_400_000
  return Date.parse(period.startsAt) < start + 2 * 86_400_000 && Date.parse(period.endsAt) > start
}

/** Suggestions only. No automatic merge, reassignment, or deletion of evidence. */
export function duplicateCandidates(outings: readonly Outing[], now: Date): string[][] {
  const groups = new Map<string, string[]>()
  for (const outing of outings) {
    const period = outing.lifecycle?.occurrence
    const evaluation = evaluateOuting(outing, now)
    if (
      outing.kind !== 'event' ||
      !period ||
      !validOccurrence(period) ||
      !evaluation.checkedAt ||
      evaluation.state === 'withdrawn'
    )
      continue
    const key = JSON.stringify([
      period.seriesId,
      period.venueId,
      period.eventYear,
      Date.parse(period.startsAt),
      Date.parse(period.endsAt),
    ])
    groups.set(key, [...(groups.get(key) ?? []), outing.id])
  }
  return [...groups.values()].filter((ids) => ids.length > 1)
}
