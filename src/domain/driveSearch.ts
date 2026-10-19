import { interests } from '../data/options.ts'

export const driveActivities = [
  '自然に包まれたい',
  '海を見たい',
  '山・高原へ行きたい',
  '湖を眺めたい',
  '夜景を見たい',
  '夕日を見たい',
  '星空を見たい',
  '花・紅葉を楽しみたい',
  'おいしいものを食べたい',
  'カフェでゆっくりしたい',
  'ご当地グルメを味わいたい',
  '温泉でくつろぎたい',
  '写真を撮りたい',
  '街並みを歩きたい',
  'アートに触れたい',
  '動物に会いたい',
  '道の駅に寄りたい',
  '景色のいい道を走りたい',
] as const
export const driveDurations = ['2〜5時間', '1時間以内', '1〜2時間', '2〜3時間', '3〜5時間'] as const
export const driveRoads = [
  'こだわらない',
  '高速道路を走りたい',
  '一般道でゆっくり',
  '県を越えたい',
] as const
export const driveTimings = ['こだわらない', '朝から', '昼間', '夕方・夕日', '夜・夜景'] as const
export const drivePaces = [
  'こだわらない',
  '目的地でのんびり',
  '寄り道を楽しむ',
  '走る時間を楽しむ',
] as const
export type DriveMode = 'default' | 'free' | 'conditions' | 'events'
export interface DriveChoices {
  duration: (typeof driveDurations)[number]
  activities: (typeof driveActivities)[number][]
  road: (typeof driveRoads)[number]
  timing: (typeof driveTimings)[number]
  pace: (typeof drivePaces)[number]
}
export interface DriveQuery extends DriveChoices {
  mode: DriveMode
  hobbies: string[]
}
export const emptyDriveChoices = (): DriveChoices => ({
  duration: '2〜5時間',
  activities: [],
  road: 'こだわらない',
  timing: 'こだわらない',
  pace: 'こだわらない',
})
export function driveQuery(
  mode: DriveMode,
  choices = emptyDriveChoices(),
  hobbies: string[] = [],
): DriveQuery {
  return {
    ...(mode === 'conditions' ? choices : emptyDriveChoices()),
    mode,
    hobbies: mode === 'events' ? hobbies.filter((h) => interests.some((i) => i.name === h)) : [],
  }
}
const fail = (): never => {
  throw new Error('ドライブの検索条件を確認してください。')
}
export function decodeDriveChoices(value: unknown): DriveChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const v = value as DriveChoices
  if (
    Object.keys(v).some((k) => !['duration', 'activities', 'road', 'timing', 'pace'].includes(k)) ||
    !driveDurations.includes(v.duration) ||
    !driveRoads.includes(v.road) ||
    !driveTimings.includes(v.timing) ||
    !drivePaces.includes(v.pace) ||
    !Array.isArray(v.activities) ||
    v.activities.length > 6 ||
    new Set(v.activities).size !== v.activities.length ||
    v.activities.some((a) => !driveActivities.includes(a))
  )
    return fail()
  return {
    duration: v.duration,
    activities: [...v.activities],
    road: v.road,
    timing: v.timing,
    pace: v.pace,
  }
}
export function decodeDriveQuery(value: unknown): DriveQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const { mode, hobbies, ...choices } = value as DriveQuery
  if (
    !['default', 'free', 'conditions', 'events'].includes(mode) ||
    !Array.isArray(hobbies) ||
    hobbies.length > interests.length ||
    new Set(hobbies).size !== hobbies.length ||
    hobbies.some((h) => !interests.some((i) => i.name === h))
  )
    return fail()
  const parsed = decodeDriveChoices(choices)
  if (mode !== 'conditions' && JSON.stringify(parsed) !== JSON.stringify(emptyDriveChoices()))
    return fail()
  if (mode !== 'events' && hobbies.length) return fail()
  return { ...parsed, mode, hobbies: [...hobbies] }
}
export const sameDriveQuery = (a?: DriveQuery, b?: DriveQuery) =>
  JSON.stringify(a) === JSON.stringify(b)
export function durationRange(duration: DriveChoices['duration']): [number, number] {
  return (
    {
      '2〜5時間': [120, 300],
      '1時間以内': [0, 60],
      '1〜2時間': [60, 120],
      '2〜3時間': [120, 180],
      '3〜5時間': [180, 300],
    } as const
  )[duration].slice() as [number, number]
}
export function driveTheme(drive: DriveQuery, freeText = ''): string {
  if (drive.mode === 'events') return 'イベント'
  if (drive.mode === 'free') return freeText.trim()
  if (drive.mode === 'default') return 'ドライブデートを楽しめる行き先'
  return '気分や走り方に合うドライブの行き先'
}
export type DriveTravel =
  | {
      status: 'calculated' | 'sample'
      durationSeconds: number
      distanceMeters: number
      checkedAt: string
      expiresAt: string
    }
  | { status: 'unconfirmed' }
export function decodeDriveTravel(value: unknown, mode: 'live' | 'sample'): DriveTravel {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const v = value as Exclude<DriveTravel, { status: 'unconfirmed' }>
  if ((value as DriveTravel).status === 'unconfirmed' && Object.keys(value).length === 1)
    return { status: 'unconfirmed' }
  if (
    Object.keys(v).some(
      (k) => !['status', 'durationSeconds', 'distanceMeters', 'checkedAt', 'expiresAt'].includes(k),
    ) ||
    v.status !== (mode === 'sample' ? 'sample' : 'calculated') ||
    !Number.isFinite(v.durationSeconds) ||
    v.durationSeconds < 0 ||
    v.durationSeconds > 172800 ||
    !Number.isFinite(v.distanceMeters) ||
    v.distanceMeters < 0 ||
    v.distanceMeters > 3000000 ||
    typeof v.checkedAt !== 'string' ||
    typeof v.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(v.checkedAt)) ||
    !Number.isFinite(Date.parse(v.expiresAt)) ||
    Date.parse(v.expiresAt) - Date.parse(v.checkedAt) !== 600000
  )
    return fail()
  return {
    status: v.status,
    durationSeconds: v.durationSeconds,
    distanceMeters: v.distanceMeters,
    checkedAt: v.checkedAt,
    expiresAt: v.expiresAt,
  }
}
export function travelTimeLabel(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  return `${Math.floor(minutes / 60) ? Math.floor(minutes / 60) + '時間' : ''}${minutes % 60 ? (minutes % 60) + '分' : minutes === 0 ? '1分未満' : ''}`
}
/** Route durations belong to the current origin and are never saved or shared. */
export function withoutDriveTravel<T extends { travel?: DriveTravel }>(spot: T): Omit<T, 'travel'> {
  const { travel: _travel, ...rest } = spot
  return rest
}
