import { today, validDate } from '../../src/domain/evidence.ts'
import { normalizeSavedUrl } from '../../src/domain/savedUrls.ts'

export const MAX_DRAFT_BYTES = 128 * 1024
export const fields = ['title', 'location', 'schedule'] as const
export type Field = (typeof fields)[number]
export const fieldLabels: Record<Field, string> = {
  title: '名称',
  location: '場所',
  schedule: '開催日時',
}
export const states = ['unconfirmed', 'confirmed', 'withdrawn'] as const
export type Confirmation = (typeof states)[number]
export interface Source {
  id: string
  kind: 'official' | 'x' | 'tiktok' | 'onsite'
  label: string
  url: string
  available: boolean
}
export interface Check {
  state: Confirmation
  sourceIds: string[]
  checkedAt: string
  reviewBy: string
}
export interface Draft {
  schemaVersion: 1
  id: string
  kind: 'event' | 'spot'
  title: string
  summary: string
  area: string
  description: string
  tags: string[]
  eventYear: number | null
  startsAt: string
  endsAt: string
  sources: Source[]
  checks: Record<Field, Check>
  photo: {
    enabled: boolean
    assetName: string
    state: Confirmation
    owner: string
    permissionRef: string
    scope: string
    credit: string
    alt: string
    checkedAt: string
    reviewBy: string
  }
  internalNote: string
}
export interface Problem {
  path: string
  message: string
}

const blankCheck = (): Check => ({
  state: 'unconfirmed',
  sourceIds: [],
  checkedAt: '',
  reviewBy: '',
})
export function blankDraft(): Draft {
  return {
    schemaVersion: 1,
    id: '',
    kind: 'event',
    title: '',
    summary: '',
    area: '',
    description: '',
    tags: [],
    eventYear: null,
    startsAt: '',
    endsAt: '',
    sources: [],
    checks: { title: blankCheck(), location: blankCheck(), schedule: blankCheck() },
    photo: {
      enabled: false,
      assetName: '',
      state: 'unconfirmed',
      owner: '',
      permissionRef: '',
      scope: '',
      credit: '',
      alt: '',
      checkedAt: '',
      reviewBy: '',
    },
    internalNote: '',
  }
}

class DraftFormatError extends Error {
  path: string
  constructor(path: string) {
    super(`${path}：入力形式または文字数を確認してください。`)
    this.path = path
  }
}

function malformed(path: string): never {
  // Do not echo imported values: they may contain private review notes.
  throw new DraftFormatError(path)
}
function object(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return malformed(path)
  const result = value as Record<string, unknown>
  if (
    Object.keys(result).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    return malformed(path)
  return result
}
function text(value: unknown, path: string, max = 2000): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    return malformed(path)
  return value
}
function choice<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) return malformed(path)
  return value as T
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return malformed(path)
  return value
}
function array<T>(
  value: unknown,
  max: number,
  parse: (item: unknown, path: string) => T,
  path: string,
): T[] {
  if (!Array.isArray(value) || value.length > max) return malformed(path)
  return value.map((item, index) => parse(item, `${path}[${index}]`))
}
function parseCheck(input: unknown, path: string): Check {
  const c = object(input, ['state', 'sourceIds', 'checkedAt', 'reviewBy'], path)
  return {
    state: choice(c.state, states, path + '.state'),
    sourceIds: array(c.sourceIds, 20, (s, p) => text(s, p, 80), path + '.sourceIds'),
    checkedAt: text(c.checkedAt, path + '.checkedAt', 10),
    reviewBy: text(c.reviewBy, path + '.reviewBy', 10),
  }
}

/** Strict input parsing is separate from completeness; drafts may contain blanks. */
export function parseDraft(input: unknown): Draft {
  const d = object(input, Object.keys(blankDraft()), 'draft')
  if (d.schemaVersion !== 1) return malformed('schemaVersion')
  if (
    d.eventYear !== null &&
    (typeof d.eventYear !== 'number' ||
      !Number.isInteger(d.eventYear) ||
      d.eventYear < 1900 ||
      d.eventYear > 9999)
  )
    return malformed('eventYear')
  const checks = object(d.checks, fields, 'checks')
  const photo = object(d.photo, Object.keys(blankDraft().photo), 'photo')
  return {
    schemaVersion: 1,
    id: text(d.id, 'id', 80),
    kind: choice(d.kind, ['event', 'spot'], 'kind'),
    title: text(d.title, 'title', 120),
    summary: text(d.summary, 'summary', 200),
    area: text(d.area, 'area', 200),
    description: text(d.description, 'description'),
    tags: array(d.tags, 8, (s, p) => text(s, p, 30), 'tags'),
    eventYear: d.eventYear,
    startsAt: text(d.startsAt, 'startsAt', 40),
    endsAt: text(d.endsAt, 'endsAt', 40),
    sources: array(
      d.sources,
      20,
      (input, path) => {
        const s = object(input, ['id', 'kind', 'label', 'url', 'available'], path)
        return {
          id: text(s.id, path + '.id', 80),
          kind: choice(s.kind, ['official', 'x', 'tiktok', 'onsite'], path + '.kind'),
          label: text(s.label, path + '.label', 120),
          url: text(s.url, path + '.url', 2048),
          available: bool(s.available, path + '.available'),
        }
      },
      'sources',
    ),
    checks: {
      title: parseCheck(checks.title, 'checks.title'),
      location: parseCheck(checks.location, 'checks.location'),
      schedule: parseCheck(checks.schedule, 'checks.schedule'),
    },
    photo: {
      enabled: bool(photo.enabled, 'photo.enabled'),
      assetName: text(photo.assetName, 'photo.assetName', 160),
      state: choice(photo.state, states, 'photo.state'),
      owner: text(photo.owner, 'photo.owner', 200),
      permissionRef: text(photo.permissionRef, 'photo.permissionRef', 500),
      scope: text(photo.scope, 'photo.scope', 500),
      credit: text(photo.credit, 'photo.credit', 200),
      alt: text(photo.alt, 'photo.alt', 200),
      checkedAt: text(photo.checkedAt, 'photo.checkedAt', 10),
      reviewBy: text(photo.reviewBy, 'photo.reviewBy', 10),
    },
    internalNote: text(d.internalNote, 'internalNote'),
  }
}
export function parseDraftJson(json: string): Draft {
  if (new TextEncoder().encode(json).byteLength > MAX_DRAFT_BYTES)
    throw new Error('入力JSONは128 KiB以内にしてください。')
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('JSONの書式を確認してください。')
  }
  return parseDraft(value)
}

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
export function validateDraft(draft: Draft, at = today()): Problem[] {
  const errors: Problem[] = []
  try {
    parseDraft(draft)
  } catch (error) {
    return [
      {
        path: error instanceof DraftFormatError ? error.path : 'draft',
        message: '入力形式または文字数を確認してください。',
      },
    ]
  }
  const add = (path: string, message: string) => errors.push({ path, message })
  const required = (path: string, value: string, label: string) => {
    if (!value.trim()) add(path, `${label}を入力してください。`)
  }
  const dates = (path: string, checkedAt: string, reviewBy: string) => {
    if (!validDate(checkedAt) || checkedAt > at)
      add(path + '.checkedAt', '確認日は実在する日付で、判定日以前にしてください。')
    if (!validDate(reviewBy) || reviewBy < at || reviewBy < checkedAt)
      add(path + '.reviewBy', '再確認期限を確認してください。期限切れの情報は再確認が必要です。')
  }
  if (!validDate(at)) {
    add('at', '判定日を確認してください。')
    return errors
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.id))
    add('id', '管理IDは半角英小文字・数字・ハイフンで入力してください。')
  required('title', draft.title, '名称')
  required('summary', draft.summary, '短い紹介')
  required('area', draft.area, '場所')
  required('description', draft.description, '説明')
  if (draft.tags.some((tag) => !tag.trim()) || new Set(draft.tags).size !== draft.tags.length)
    add('tags', 'タグの空欄・重複を確認してください。')
  if (draft.kind === 'event') {
    if (!validTimestamp(draft.startsAt))
      add(
        'startsAt',
        '開始日時を秒・タイムゾーン付きで入力してください。例：2026-10-01T10:00:00+09:00',
      )
    if (
      !validTimestamp(draft.endsAt) ||
      (validTimestamp(draft.startsAt) && Date.parse(draft.endsAt) <= Date.parse(draft.startsAt))
    )
      add('endsAt', '終了日時は開始日時より後の実在する日時にしてください。')
    const startYear = validTimestamp(draft.startsAt)
      ? Number(
          new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(
            new Date(draft.startsAt),
          ),
        )
      : null
    if (!draft.eventYear || draft.eventYear !== startYear)
      add('eventYear', '開催年を開始日時の日本時間での年と一致させてください。')
  } else if (draft.eventYear !== null || draft.startsAt || draft.endsAt)
    add(
      'kind',
      '常設スポットには開催年・開催日時を設定しません。種別を切り替えるか日時を空にしてください。',
    )
  const ids = new Set<string>()
  const usable = new Set<string>()
  draft.sources.forEach((source, i) => {
    const path = `sources[${i}]`
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id) || ids.has(source.id))
      add(path + '.id', '情報源IDの形式・重複を確認してください。')
    ids.add(source.id)
    required(path + '.label', source.label, '情報源の名称')
    let urlValid = source.kind === 'onsite' && !source.url
    if (source.url) {
      try {
        const link = normalizeSavedUrl(source.url)
        urlValid =
          link.url.startsWith('https:') &&
          (source.kind !== 'x' || link.source === 'X') &&
          (source.kind !== 'tiktok' || link.source === 'TikTok')
      } catch {
        /* Value stays private; only a fixed error is reported. */
      }
    }
    if (!urlValid)
      add(
        path + '.url',
        '種類に合った公開ページのHTTPS URLを入力してください。現地確認はURLを省略できます。',
      )
    if (urlValid && source.available && source.label.trim()) usable.add(source.id)
  })
  for (const field of fields) {
    if (field === 'schedule' && draft.kind === 'spot') continue
    const c = draft.checks[field],
      path = 'checks.' + field
    if (c.state !== 'confirmed')
      add(path + '.state', `${fieldLabels[field]}の確認状態を入力してください。`)
    if (
      !c.sourceIds.length ||
      c.sourceIds.some((id) => !ids.has(id)) ||
      new Set(c.sourceIds).size !== c.sourceIds.length ||
      !c.sourceIds.some((id) => usable.has(id))
    )
      add(path + '.sourceIds', `${fieldLabels[field]}には参照可能な情報源をひも付けてください。`)
    dates(path, c.checkedAt, c.reviewBy)
  }
  if (draft.photo.enabled) {
    if (
      !/^[^/\\]+\.(png|jpe?g|webp)$/i.test(draft.photo.assetName) ||
      draft.photo.assetName.startsWith('.')
    )
      add('photo.assetName', '写真はパスを含まないPNG・JPEG・WebPのファイル名で指定してください。')
    if (draft.photo.state !== 'confirmed') add('photo.state', '写真の利用条件の確認が必要です。')
    required('photo.owner', draft.photo.owner, '写真の権利者')
    required('photo.permissionRef', draft.photo.permissionRef, '許諾記録の参照先')
    required('photo.scope', draft.photo.scope, '写真の利用範囲')
    required('photo.credit', draft.photo.credit, '写真のクレジット（不要の場合はその旨）')
    required('photo.alt', draft.photo.alt, '写真の代替テキスト')
    dates('photo', draft.photo.checkedAt, draft.photo.reviewBy)
  }
  return errors
}
export function canPreviewPhoto(draft: Draft, at = today()): boolean {
  try {
    parseDraft(draft)
  } catch {
    return false
  }
  return (
    draft.photo.enabled &&
    !validateDraft(draft, at).some(
      (error) => error.path.startsWith('photo.') || error.path === 'at',
    )
  )
}
