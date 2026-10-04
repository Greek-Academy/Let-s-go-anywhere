import { Timestamp } from 'firebase/firestore'
import type { Candidate, Color, Reaction } from '../../sharing/model'
import { checkCandidateFields } from '../../sharing/codec'
import { validateCandidate } from '../../sharing/domain'
import { DraftConflict } from '../client'

export const SHARED_ORIGIN = 'https://driveplus-fbc33.web.app'
export const tokenPattern = /^[a-f0-9]{64}$/
export const listPattern = /^[a-f0-9]{32}$/
export interface CloudList {
  id: string
  schemaVersion: 1
  creatorId: string
  slot: string
  ownerId: string
  name: string
  color: Color
  members: Record<string, string>
  memberIds: string[]
  successorId: string | null
  currentInvite: string | null
  status: 'active' | 'cleaning' | 'deleting'
  cleanupUid: string | null
  cleanupVersion: number
  cleanedCount: number
  itemCount: number
  inviteCount: number
  action: string
  target: string
  revision: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
export interface CloudItem {
  id: string
  candidate: Candidate
  note: string
  authorId: string | null
  reactions: Record<string, Reaction>
  cleanVersion: number
  revision: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
export interface CloudInvite {
  id: string
  ownerId: string
  ownerName: string
  listName: string
  status: 'open' | 'requested' | 'used' | 'revoked'
  applicantId: string | null
  applicantName: string | null
  revision: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
export const expiresAt = (invite: CloudInvite) => invite.createdAt.toMillis() + 7 * 86400_000
export function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}
export function textValue(value: string, max: number, empty = false) {
  const v = value.trim()
  if ((!empty && !v) || v.length > max)
    throw new DraftConflict(`${empty ? '0' : '1'}〜${max}文字で入力してください。`)
  return v
}
export function invitePath(listId: string, token: string) {
  if (!listPattern.test(listId) || !tokenPattern.test(token))
    throw new DraftConflict('招待リンクの形式を確認してください。')
  return `/saved/cloud/invite/${listId}/${token}`
}
export function inviteUrl(listId: string, token: string, emulator = false) {
  return `${emulator ? location.origin : SHARED_ORIGIN}/#${invitePath(listId, token)}`
}
export function parseInvite(value: string) {
  try {
    const u = new URL(value.trim())
    if (
      u.origin !== SHARED_ORIGIN &&
      !(['localhost', '127.0.0.1'].includes(u.hostname) && u.origin === location.origin)
    )
      return null
    const match = u.hash.match(/^#\/saved\/cloud\/invite\/([a-f0-9]{32})\/([a-f0-9]{64})$/)
    return match ? { listId: match[1], token: match[2] } : null
  } catch {
    return null
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new DraftConflict('保存形式を確認できません。')
  return value as Record<string, unknown>
}
function assertShape(v: Record<string, unknown>, fields: string[]) {
  if (Object.keys(v).length !== fields.length || !fields.every((f) => f in v))
    throw new DraftConflict('未対応の保存形式です。上書きせず、開発側へお知らせください。')
}
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max
const stamp = (v: unknown) => v instanceof Timestamp
export function decodeList(id: string, raw: unknown): CloudList {
  const d = record(raw)
  assertShape(d, [
    'schemaVersion',
    'creatorId',
    'slot',
    'ownerId',
    'name',
    'color',
    'members',
    'memberIds',
    'successorId',
    'currentInvite',
    'status',
    'cleanupUid',
    'cleanupVersion',
    'cleanedCount',
    'itemCount',
    'inviteCount',
    'action',
    'target',
    'revision',
    'createdAt',
    'updatedAt',
  ])
  const members = record(d.members),
    ids = d.memberIds
  if (
    !listPattern.test(id) ||
    d.schemaVersion !== 1 ||
    typeof d.creatorId !== 'string' ||
    !['1', '2', '3'].includes(d.slot as string) ||
    typeof d.ownerId !== 'string' ||
    typeof d.name !== 'string' ||
    !d.name.trim() ||
    d.name.length > 40 ||
    !['teal', 'blue', 'peach'].includes(d.color as string) ||
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 5 ||
    new Set(ids).size !== ids.length ||
    Object.keys(members).length !== ids.length ||
    !ids.every(
      (uid) =>
        typeof uid === 'string' &&
        typeof members[uid] === 'string' &&
        (members[uid] as string).trim().length > 0 &&
        (members[uid] as string).length <= 30,
    ) ||
    !ids.includes(d.ownerId) ||
    (d.successorId !== null && (!ids.includes(d.successorId) || d.successorId === d.ownerId)) ||
    (d.currentInvite !== null && !tokenPattern.test(d.currentInvite as string)) ||
    !['active', 'cleaning', 'deleting'].includes(d.status as string) ||
    (d.cleanupUid !== null && typeof d.cleanupUid !== 'string') ||
    !integer(d.cleanupVersion, 0) ||
    !integer(d.cleanedCount, 0, 100) ||
    !integer(d.itemCount, 0, 100) ||
    !integer(d.inviteCount, 0, 10) ||
    !integer(d.revision, 1) ||
    typeof d.action !== 'string' ||
    typeof d.target !== 'string' ||
    !stamp(d.createdAt) ||
    !stamp(d.updatedAt)
  )
    throw new DraftConflict('リストの保存内容を確認できません。')
  return { id, ...d } as unknown as CloudList
}
export function decodeItem(id: string, raw: unknown): CloudItem {
  const d = record(raw)
  assertShape(d, [
    'candidate',
    'note',
    'authorId',
    'reactions',
    'cleanVersion',
    'revision',
    'createdAt',
    'updatedAt',
  ])
  checkCandidateFields(d.candidate)
  validateCandidate(d.candidate as Candidate)
  const reactions = record(d.reactions)
  if (
    !tokenPattern.test(id) ||
    typeof d.note !== 'string' ||
    d.note.length > 300 ||
    (d.authorId !== null && typeof d.authorId !== 'string') ||
    Object.keys(reactions).length > 5 ||
    !Object.values(reactions).every((r) => ['want', 'interested', 'pass'].includes(r as string)) ||
    !integer(d.cleanVersion, 0) ||
    !integer(d.revision, 1) ||
    !stamp(d.createdAt) ||
    !stamp(d.updatedAt)
  )
    throw new DraftConflict('候補の保存内容を確認できません。')
  return { id, ...d } as unknown as CloudItem
}
export function decodeInvite(id: string, raw: unknown): CloudInvite {
  const d = record(raw)
  assertShape(d, [
    'ownerId',
    'ownerName',
    'listName',
    'status',
    'applicantId',
    'applicantName',
    'revision',
    'createdAt',
    'updatedAt',
  ])
  if (
    !tokenPattern.test(id) ||
    typeof d.ownerId !== 'string' ||
    typeof d.ownerName !== 'string' ||
    !d.ownerName.trim() ||
    d.ownerName.length > 30 ||
    typeof d.listName !== 'string' ||
    !d.listName.trim() ||
    d.listName.length > 40 ||
    !['open', 'requested', 'used', 'revoked'].includes(d.status as string) ||
    (d.applicantId !== null && typeof d.applicantId !== 'string') ||
    (d.applicantName !== null &&
      (typeof d.applicantName !== 'string' ||
        !d.applicantName.trim() ||
        d.applicantName.length > 30)) ||
    !integer(d.revision, 1) ||
    !stamp(d.createdAt) ||
    !stamp(d.updatedAt)
  )
    throw new DraftConflict('招待の保存内容を確認できません。')
  return { id, ...d } as unknown as CloudInvite
}
