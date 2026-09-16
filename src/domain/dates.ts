import { validDate } from './evidence.ts'

export function validTimestamp(value: string): boolean {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|([+-])(\d{2}):(\d{2}))$/,
  )
  if (!match || !validDate(match[1]) || +match[2] > 23 || +match[3] > 59 || +match[4] > 59)
    return false
  if (
    match[5] !== 'Z' &&
    (+match[7] > 14 || +match[8] > 59 || (+match[7] === 14 && +match[8] !== 0))
  )
    return false
  return Number.isFinite(Date.parse(value))
}

export function japanDate(at: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(at)
}
