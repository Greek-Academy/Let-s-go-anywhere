/** Evidence is evaluated on read, so saved IDs cannot freeze an old confirmation. */
export interface Evidence<T> {
  value: T | null
  status: 'confirmed' | 'unconfirmed' | 'withdrawn'
  source: string
  checkedAt: string | null
  reviewBy: string | null
}

export type EvidenceState = 'confirmed' | 'unconfirmed' | 'expired' | 'withdrawn'

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}

export function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
}

export function evidenceState<T>(fact: Evidence<T>, at = today()): EvidenceState {
  if (fact.status === 'withdrawn') return 'withdrawn'
  if (
    fact.status !== 'confirmed' ||
    fact.value === null ||
    !fact.source.trim() ||
    !fact.checkedAt ||
    !fact.reviewBy ||
    !validDate(fact.checkedAt) ||
    !validDate(fact.reviewBy) ||
    !validDate(at) ||
    fact.checkedAt > at ||
    fact.reviewBy < fact.checkedAt
  )
    return 'unconfirmed'
  return fact.reviewBy < at ? 'expired' : 'confirmed'
}

export const evidenceLabels: Record<EvidenceState, string> = {
  confirmed: '確認済み（サンプル）',
  unconfirmed: '未確認',
  expired: '更新待ち',
  withdrawn: '掲載停止',
}

export function confirmedValue<T>(fact: Evidence<T>, at = today()): T | null {
  return evidenceState(fact, at) === 'confirmed' ? fact.value : null
}
