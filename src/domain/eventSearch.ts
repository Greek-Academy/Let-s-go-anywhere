import { validDate } from './evidence.ts'
import { japanDate } from './dates.ts'

export interface EventDates {
  start: string
  end: string
}
export interface EventSelection {
  mode: 'today' | 'weekend' | 'custom'
  date: string
}
export interface EventSchedule {
  startDate: string
  endDate: string
  occursOn: string[]
  venue: string
  timeText: string
  status: 'scheduled'
}
export const defaultEventSelection: EventSelection = { mode: 'today', date: '' }
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
export function eventDates(selection: EventSelection, now = new Date()): EventDates | null {
  const today = japanDate(now)
  if (selection.mode === 'custom')
    return validDate(selection.date) ? { start: selection.date, end: selection.date } : null
  if (selection.mode === 'today') return { start: today, end: today }
  const day = new Date(`${today}T00:00:00Z`).getUTCDay()
  const start = day === 0 ? today : addDays(today, (6 - day + 7) % 7)
  return { start, end: day === 0 ? today : addDays(start, 1) }
}
export function decodeEventDates(value: unknown): EventDates {
  const v = value as EventDates
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !['start', 'end'].includes(k)) ||
    typeof v.start !== 'string' ||
    typeof v.end !== 'string' ||
    !validDate(v.start) ||
    !validDate(v.end) ||
    v.end < v.start ||
    v.end > addDays(v.start, 1)
  )
    throw new Error('イベントの日付を確認してください。')
  return { start: v.start, end: v.end }
}
export function eventDateError(dates: EventDates | null, now = new Date()): string | null {
  if (!dates) return 'イベントを探す日付を選んでください。'
  try {
    decodeEventDates(dates)
  } catch {
    return 'イベントの日付を確認してください。'
  }
  const today = japanDate(now)
  return dates.start < today || dates.end > addDays(today, 365)
    ? '今日から1年以内の日付を選んでください（日本時間）。'
    : null
}
export function sameEventDates(a?: EventDates | null, b?: EventDates | null): boolean {
  return a?.start === b?.start && a?.end === b?.end
}
export function eventDatesLabel(dates: EventDates): string {
  return dates.start === dates.end ? dates.start : `${dates.start} 〜 ${dates.end}`
}
export function decodeEventSchedule(value: unknown, requested?: EventDates): EventSchedule {
  const v = value as EventSchedule
  const text = (s: unknown, max: number) =>
    typeof s === 'string' && !!s.trim() && s.length <= max && !/[\u0000-\u001f\u007f<>]/u.test(s)
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some(
      (k) => !['startDate', 'endDate', 'occursOn', 'venue', 'timeText', 'status'].includes(k),
    ) ||
    typeof v.startDate !== 'string' ||
    typeof v.endDate !== 'string' ||
    !validDate(v.startDate) ||
    !validDate(v.endDate) ||
    v.startDate > v.endDate ||
    v.status !== 'scheduled' ||
    !text(v.venue, 160) ||
    !text(v.timeText, 120) ||
    !Array.isArray(v.occursOn) ||
    !v.occursOn.length ||
    v.occursOn.length > 2 ||
    new Set(v.occursOn).size !== v.occursOn.length ||
    v.occursOn.some(
      (d) =>
        typeof d !== 'string' ||
        !validDate(d) ||
        d < v.startDate ||
        d > v.endDate ||
        (requested && (d < requested.start || d > requested.end)),
    )
  )
    throw new Error('開催日・会場を確認できないイベントです。')
  return {
    startDate: v.startDate,
    endDate: v.endDate,
    occursOn: [...v.occursOn].sort(),
    venue: v.venue.trim(),
    timeText: v.timeText.trim(),
    status: 'scheduled',
  }
}
