import { confirmedValue, evidenceState, validDate } from './evidence'
import type { Evidence } from './evidence'

export const drivingScenes = ['夜間', '高速道路', '狭い道', '山道'] as const
export type DrivingScene = (typeof drivingScenes)[number]
export interface TripConditions {
  date: string
  departAt: string
  returnBy: string
  budget: string
  avoid: DrivingScene[]
}
export const emptyConditions = (): TripConditions => ({
  date: '',
  departAt: '',
  returnBy: '',
  budget: '',
  avoid: [],
})
export interface TripFacts {
  /** Matching is limited to this specific verified date, origin and departure window. */
  context: Evidence<{ date: string; origin: string; departAt: string }>
  returnAt: Evidence<string>
  totalCost: Evidence<{ min: number; max: number; complete: boolean; scope: string }>
  scenes: Record<DrivingScene, Evidence<boolean>>
}
export type MatchState = 'match' | 'mismatch' | 'unknown'
export interface ConditionResult {
  label: string
  state: MatchState
  reason: string
  evidence?: Evidence<unknown>
}
export type ConditionFilter = 'all' | 'match' | 'mismatch' | 'unknown'
export const matchLabels = { match: '条件に合う', mismatch: '条件に合わない', unknown: '未確認' }
export function minutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hours, mins] = value.split(':').map(Number)
  return hours * 60 + mins
}
export function conditionsError(c: TripConditions): string {
  if (c.date && !validDate(c.date)) return '有効な日付を入力してください。'
  if ((c.departAt && minutes(c.departAt) === null) || (c.returnBy && minutes(c.returnBy) === null))
    return '有効な時刻を入力してください。'
  if (c.departAt && c.returnBy && minutes(c.departAt)! >= minutes(c.returnBy)!)
    return '日帰りの条件です。帰宅時刻は出発時刻より後にしてください。'
  if (c.budget && (!/^\d+$/.test(c.budget) || Number(c.budget) > 10000000))
    return '予算は0〜10,000,000円の整数で入力してください。'
  return ''
}
export function hasConditions(c: TripConditions): boolean {
  return !!(c.date || c.departAt || c.returnBy || c.budget || c.avoid.length)
}
export function evaluateConditions(
  c: TripConditions,
  facts: TripFacts | undefined,
  origin: string,
  at?: string,
): ConditionResult[] {
  if (!hasConditions(c)) return []
  if (conditionsError(c))
    return [{ label: '入力条件', state: 'unknown', reason: conditionsError(c) }]
  const context = facts ? confirmedValue(facts.context, at) : null
  const contextMatches = !!(
    context &&
    c.date &&
    c.departAt &&
    c.date === context.date &&
    origin === context.origin &&
    c.departAt === context.departAt
  )
  const missingContext = 'この日付・出発エリア・出発時刻での情報が未確認です。'
  const result: ConditionResult[] = []
  if (c.date || c.departAt || c.returnBy) {
    const returnAt = facts ? confirmedValue(facts.returnAt, at) : null
    const known =
      contextMatches &&
      returnAt &&
      minutes(returnAt) !== null &&
      minutes(returnAt)! >= minutes(c.departAt)! &&
      c.returnBy
    result.push({
      label: '出発・帰宅時間',
      state: known
        ? minutes(returnAt)! <= minutes(c.returnBy)!
          ? 'match'
          : 'mismatch'
        : 'unknown',
      reason: known
        ? `往復・滞在を含む帰宅の目安は${returnAt}（サンプル）。希望は${c.returnBy}です。交通状況で変わります。`
        : missingContext + '営業時間だけでは帰宅時刻を判断しません。',
      evidence: facts?.returnAt,
    })
  }
  if (c.budget) {
    const cost = facts ? confirmedValue(facts.totalCost, at) : null
    const validCost = !!(
      cost &&
      Number.isFinite(cost.min) &&
      Number.isFinite(cost.max) &&
      cost.min >= 0 &&
      cost.max >= cost.min &&
      cost.scope.trim()
    )
    const known = contextMatches && validCost && cost
    const state = known
      ? cost.min > Number(c.budget)
        ? 'mismatch'
        : cost.complete && cost.max <= Number(c.budget)
          ? 'match'
          : 'unknown'
      : 'unknown'
    result.push({
      label: '予算',
      state,
      reason: known
        ? `${cost.min.toLocaleString()}〜${cost.max.toLocaleString()}円／1人（サンプル）。対象：${cost.scope}。${cost.complete ? '設定した費用範囲の合計です。' : '未取得の費用があるため、総額は未確認です。'}`
        : missingContext + '費用総額は未確認です。',
      evidence: facts?.totalCost,
    })
  }
  for (const scene of c.avoid) {
    const fact = facts?.scenes[scene]
    const value = fact && contextMatches ? confirmedValue(fact, at) : null
    result.push({
      label: `${scene}を避けたい`,
      state: value === null ? 'unknown' : value ? 'mismatch' : 'match',
      reason:
        value === null
          ? 'この条件での経路・時間が未確認です。'
          : value
            ? `想定経路に${scene}を含む記録があります（サンプル）。別候補や移動方法も検討できます。`
            : `想定経路に${scene}を含まない記録があります（サンプル）。運転のしやすさを示すものではありません。`,
      evidence: fact,
    })
  }
  return result
}
export function overallMatch(results: ConditionResult[]): MatchState {
  if (results.some((r) => r.state === 'mismatch')) return 'mismatch'
  return results.length > 0 && results.every((r) => r.state === 'match') ? 'match' : 'unknown'
}
export function evidenceCaption(fact?: Evidence<unknown>): string {
  if (!fact) return '確認元・確認日：未確認'
  return `${fact.source || '確認元：未確認'} ／ 確認日：${fact.checkedAt ?? '未確認'}${evidenceState(fact) === 'expired' ? '（更新待ち）' : ''}`
}
