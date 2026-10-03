import { normalizeSavedUrl } from '../domain/savedUrls'
import { actors, colors, reactions } from './model'
import type {
  Actor,
  Candidate,
  Command,
  CommandResult,
  SharedItem,
  SharedList,
  SharingState,
} from './model'

export const INVITE_DURATION = 7 * 24 * 60 * 60 * 1000
export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
export function sharedText(value: unknown, max: number, optional = false): string {
  requireValue(
    typeof value === 'string' &&
      value.length <= max &&
      !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value),
    `入力は${max}文字以内で確認してください。`,
  )
  requireValue(optional || value.trim(), '名前を入力してください。')
  return value.trim()
}
export function validateCandidate(c: Candidate): void {
  requireValue(['catalog', 'web', 'link'].includes(c.kind), '候補の形式を確認できません。')
  sharedText(c.title, 300)
  sharedText(c.area, 300, true)
  sharedText(c.status, 160)
  requireValue(
    typeof c.sample === 'boolean' &&
      typeof c.capturedAt === 'string' &&
      Number.isFinite(Date.parse(c.capturedAt)),
    '候補の日時を確認できません。',
  )
  if (c.kind === 'catalog')
    requireValue(
      typeof c.catalogId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(c.catalogId) && c.sample,
      '掲載候補を確認できません。',
    )
  else requireValue(c.catalogId === null && typeof c.url === 'string', '出典が必要です。')
  if (c.url !== null) normalizeSavedUrl(c.url)
}
export function candidateKey(c: Candidate): string {
  return c.kind === 'catalog'
    ? `catalog:${c.catalogId}`
    : `${c.sample ? 'sample:' : ''}${normalizeSavedUrl(c.url!).key}`
}
export const canRead = (list: SharedList, actor: Actor) => list.members.includes(actor)
export const allInterested = (list: SharedList, item: SharedItem) =>
  list.members.length >= 2 &&
  list.members.every((id) => ['want', 'interested'].includes(item.reactions[id] ?? ''))
export function applyCommand(
  previous: SharingState,
  actor: Actor,
  command: Command,
  now = Date.now(),
  id: () => string = () => crypto.randomUUID(),
): CommandResult {
  requireValue(Object.hasOwn(actors, actor), 'デモの操作役を確認してください。')
  const state = structuredClone(previous)
  const stamp = new Date(now).toISOString()
  let list: SharedList
  const result: CommandResult = { state, listId: '' }
  if (command.type === 'create') {
    requireValue(
      state.lists.filter((l) => l.owner === actor).length < 3,
      '作成できるリストは1人3つまでです。',
    )
    requireValue(Object.hasOwn(colors, command.color), '色を選んでください。')
    list = {
      id: id(),
      name: sharedText(command.name, 40),
      color: command.color,
      owner: actor,
      members: [actor],
      items: [],
      invites: [],
      successor: null,
      updatedAt: stamp,
    }
    state.lists.push(list)
  } else {
    const found = state.lists.find((l) => l.id === command.listId)
    requireValue(found, 'このリストは削除されたか、表示できません。')
    list = found
    if (!['request', 'withdraw'].includes(command.type))
      requireValue(canRead(list, actor), 'このリストのメンバーではありません。')
    const ownerOnly = [
      'rename',
      'invite',
      'revoke',
      'approve',
      'reject',
      'removeMember',
      'offerTransfer',
      'cancelTransfer',
      'delete',
    ]
    if (ownerOnly.includes(command.type))
      requireValue(list.owner === actor, '作成者だけが操作できます。')
    switch (command.type) {
      case 'rename':
        requireValue(Object.hasOwn(colors, command.color), '色を選んでください。')
        list.name = sharedText(command.name, 40)
        list.color = command.color
        break
      case 'invite': {
        requireValue(list.members.length < 5, '1つのリストは5人までです。')
        // Bound stored invite records; no unbounded token history in this demo.
        list.invites = list.invites.filter((i) => i.status === 'open' && i.expiresAt > now)
        requireValue(
          list.invites.length < 5,
          '有効な招待が5つあります。不要な招待を取り消してください。',
        )
        const token = id()
        list.invites.push({
          token,
          expiresAt: now + INVITE_DURATION,
          status: 'open',
          applicant: null,
        })
        result.token = token
        break
      }
      case 'request':
      case 'withdraw':
      case 'approve':
      case 'reject':
      case 'revoke': {
        const invitation = list.invites.find((i) => i.token === command.token)
        requireValue(invitation, '招待が見つかりません。')
        if (command.type === 'revoke') {
          invitation.status = 'revoked'
          invitation.applicant = null
          break
        }
        if (command.type === 'withdraw') {
          requireValue(invitation.applicant === actor, '自分の申請だけ取り消せます。')
          invitation.applicant = null
          break
        }
        requireValue(
          invitation.status === 'open' && invitation.expiresAt > now,
          '招待は期限切れ、または取り消されています。新しい招待をお願いしてください。',
        )
        if (command.type === 'request') {
          requireValue(!canRead(list, actor), 'すでにメンバーです。')
          requireValue(
            !invitation.applicant || invitation.applicant === actor,
            'この招待は別の参加申請に使われています。',
          )
          requireValue(
            !list.invites.some(
              (i) =>
                i.token !== invitation.token &&
                i.status === 'open' &&
                i.expiresAt > now &&
                i.applicant === actor,
            ),
            'このリストには申請済みです。',
          )
          invitation.applicant = actor
        } else if (command.type === 'reject') {
          invitation.status = 'revoked'
          invitation.applicant = null
        } else {
          requireValue(
            invitation.applicant && !canRead(list, invitation.applicant),
            '承認できる申請がありません。',
          )
          requireValue(list.members.length < 5, '1つのリストは5人までです。')
          list.members.push(invitation.applicant)
          invitation.status = 'used'
          invitation.applicant = null
        }
        break
      }
      case 'add': {
        validateCandidate(command.candidate)
        const existing = list.items.find(
          (i) => candidateKey(i.candidate) === candidateKey(command.candidate),
        )
        if (existing) {
          result.itemId = existing.id
          result.duplicate = true
          break
        }
        requireValue(list.items.length < 100, '1つのリストは100候補までです。')
        const item: SharedItem = {
          id: id(),
          candidate: structuredClone(command.candidate),
          author: actor,
          note: sharedText(command.note, 300, true),
          reactions: {},
        }
        list.items.push(item)
        result.itemId = item.id
        break
      }
      case 'edit':
      case 'react':
      case 'removeItem': {
        const item = list.items.find((i) => i.id === command.itemId)
        requireValue(item, 'この候補は削除されています。')
        if (command.type === 'react') {
          requireValue(
            command.reaction === null || Object.hasOwn(reactions, command.reaction),
            '反応を選んでください。',
          )
          if (command.reaction === null) delete item.reactions[actor]
          else item.reactions[actor] = command.reaction
        } else {
          requireValue(
            item.author === actor ||
              (list.owner === actor && (command.type === 'removeItem' || item.author === null)),
            'この候補を変更する権限がありません。',
          )
          if (command.type === 'edit') item.note = sharedText(command.note, 300, true)
          else list.items = list.items.filter((i) => i.id !== item.id)
        }
        break
      }
      case 'offerTransfer':
        requireValue(
          command.member !== actor && canRead(list, command.member),
          '引き継ぐメンバーを選んでください。',
        )
        list.successor = command.member
        break
      case 'cancelTransfer':
        list.successor = null
        break
      case 'acceptTransfer':
        requireValue(list.successor === actor, '自分への引き継ぎ依頼がありません。')
        requireValue(
          state.lists.filter((l) => l.owner === actor).length < 3,
          '引き継ぎ先が作成できるリストの上限です。',
        )
        list.owner = actor
        list.successor = null
        list.invites = []
        break
      case 'removeMember':
      case 'leave': {
        const member = 'member' in command ? command.member : actor
        requireValue(
          canRead(list, member) && member !== list.owner,
          '作成者は引き継ぎの承諾後に退出してください。1人ならリストを削除できます。',
        )
        list.members = list.members.filter((m) => m !== member)
        for (const item of list.items) {
          if (item.author === member) item.author = null
          delete item.reactions[member]
        }
        list.invites = list.invites.filter((i) => i.applicant !== member)
        if (list.successor === member) list.successor = null
        break
      }
      case 'delete':
        state.lists = state.lists.filter((l) => l.id !== list.id)
        break
    }
  }
  state.revision++
  list.updatedAt = stamp
  result.listId = list.id
  return result
}
