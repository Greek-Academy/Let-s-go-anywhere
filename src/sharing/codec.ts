import { actors, colors, reactions } from './model'
import type { SharingState } from './model'
import { candidateKey, requireValue, sharedText, validateCandidate } from './domain'

function shape(value: unknown, fields: string[]): asserts value is Record<string, unknown> {
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    '共有デモの形式を確認できません。',
  )
  requireValue(
    Object.keys(value).length === fields.length &&
      Object.keys(value).every((k) => fields.includes(k)),
    '共有デモに未対応の項目があります。',
  )
}
export function checkCandidateFields(value: unknown): void {
  shape(value, ['kind', 'catalogId', 'title', 'area', 'url', 'status', 'sample', 'capturedAt'])
}
const validId = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v)
const actor = (v: unknown) => typeof v === 'string' && Object.hasOwn(actors, v)
const stamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v))
/** Fail closed and preserve raw storage for corrupt, unknown, or newer schema data. */
export function decodeSharing(raw: string): SharingState {
  requireValue(raw.length <= 2_000_000, '共有デモの保存容量を確認できません。')
  const value: unknown = JSON.parse(raw)
  shape(value, ['schemaVersion', 'revision', 'lists'])
  requireValue(
    value.schemaVersion === 1 &&
      Number.isSafeInteger(value.revision) &&
      Number(value.revision) >= 0,
    'この共有デモの保存形式には対応していません。',
  )
  requireValue(
    Array.isArray(value.lists) && value.lists.length <= 6,
    '共有リストの件数を確認できません。',
  )
  const state = value as unknown as SharingState
  const ids = new Set<string>()
  const tokens = new Set<string>()
  for (const list of state.lists) {
    shape(list, [
      'id',
      'name',
      'color',
      'owner',
      'members',
      'items',
      'invites',
      'successor',
      'updatedAt',
    ])
    requireValue(validId(list.id) && !ids.has(list.id), 'リストIDが不正です。')
    ids.add(list.id)
    sharedText(list.name, 40)
    requireValue(
      Object.hasOwn(colors, list.color) && actor(list.owner) && stamp(list.updatedAt),
      'リスト情報が不正です。',
    )
    requireValue(
      Array.isArray(list.members) &&
        list.members.length > 0 &&
        list.members.length <= 5 &&
        list.members.every(actor) &&
        new Set(list.members).size === list.members.length &&
        list.members.includes(list.owner),
      'メンバー情報が不正です。',
    )
    requireValue(
      list.successor === null ||
        (list.successor !== list.owner && list.members.includes(list.successor)),
      '引き継ぎ情報が不正です。',
    )
    requireValue(
      Array.isArray(list.items) &&
        list.items.length <= 100 &&
        Array.isArray(list.invites) &&
        list.invites.length <= 5,
      '候補・招待の件数が不正です。',
    )
    const itemIds = new Set<string>(),
      keys = new Set<string>()
    for (const item of list.items) {
      shape(item, ['id', 'candidate', 'author', 'note', 'reactions'])
      requireValue(validId(item.id) && !itemIds.has(item.id), '候補IDが不正です。')
      itemIds.add(item.id)
      checkCandidateFields(item.candidate)
      validateCandidate(item.candidate)
      const key = candidateKey(item.candidate)
      requireValue(!keys.has(key), '同じ候補が重複しています。')
      keys.add(key)
      requireValue(item.author === null || list.members.includes(item.author), '追加者が不正です。')
      sharedText(item.note, 300, true)
      requireValue(
        item.reactions &&
          typeof item.reactions === 'object' &&
          !Array.isArray(item.reactions) &&
          Object.entries(item.reactions).every(
            ([a, r]) => list.members.includes(a as never) && Object.hasOwn(reactions, r),
          ),
        '反応が不正です。',
      )
    }
    for (const invite of list.invites) {
      shape(invite, ['token', 'expiresAt', 'status', 'applicant'])
      requireValue(validId(invite.token) && !tokens.has(invite.token), '招待IDが不正です。')
      tokens.add(invite.token)
      requireValue(
        Number.isSafeInteger(invite.expiresAt) &&
          invite.expiresAt > 0 &&
          ['open', 'used', 'revoked'].includes(invite.status),
        '招待の期限・状態が不正です。',
      )
      requireValue(
        invite.applicant === null ||
          (actor(invite.applicant) &&
            !list.members.includes(invite.applicant) &&
            invite.status === 'open'),
        '参加申請が不正です。',
      )
    }
  }
  for (const a of Object.keys(actors))
    requireValue(
      state.lists.filter((l) => l.owner === a).length <= 3,
      '作成数の上限を超えています。',
    )
  return state
}
