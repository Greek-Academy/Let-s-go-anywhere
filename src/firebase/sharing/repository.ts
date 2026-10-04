import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import type { Firestore, Transaction } from 'firebase/firestore'
import { DraftConflict } from '../client'
import { decodeDraft } from '../drafts'
import type { CloudDraft } from '../drafts'
import { candidateKey, validateCandidate } from '../../sharing/domain'
import { checkCandidateFields } from '../../sharing/codec'
import type { Candidate, Color, Reaction } from '../../sharing/model'
import {
  decodeInvite,
  decodeItem,
  decodeList,
  listPattern,
  randomHex,
  textValue,
  tokenPattern,
} from './model'
import type { CloudList, CloudItem } from './model'

export async function onlineRead<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DraftConflict('通信を確認して、もう一度読み直してください。')),
          12000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
export async function candidateId(candidate: Candidate) {
  checkCandidateFields(candidate)
  validateCandidate(candidate)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(candidateKey(candidate)),
  )
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
const conflict = () => {
  throw new DraftConflict('別の画面で変更されました。入力を控え、最新の内容を読み直してください。')
}
const absent = () => {
  throw new DraftConflict('表示できません。参加承認前、退出済み、または削除済みのリストです。')
}
export function sharingRepository(db: Firestore, uid: string) {
  const listRef = (id: string) => {
    if (!listPattern.test(id)) return absent()
    return doc(db, 'sharedLists', id)
  }
  const itemRef = (id: string, item: string) => {
    if (!tokenPattern.test(item)) return absent()
    return doc(listRef(id), 'items', item)
  }
  const inviteRef = (id: string, token: string) => {
    if (!tokenPattern.test(token)) return absent()
    return doc(listRef(id), 'invitations', token)
  }
  const slotRef = (creator: string, slot: string) =>
    doc(db, 'sharedCreationSlots', creator, 'slots', slot)
  const load = async (tx: Transaction, id: string, active = true) => {
    const s = await tx.get(listRef(id))
    if (!s.exists()) return absent()
    const l = decodeList(s.id, s.data())
    if (!l.memberIds.includes(uid) || (active && l.status !== 'active')) return absent()
    return l
  }
  const patch = (tx: Transaction, l: CloudList, action: string, target = '', extra = {}) =>
    tx.update(listRef(l.id), {
      ...extra,
      action,
      target,
      revision: l.revision + 1,
      updatedAt: serverTimestamp(),
    })
  const current = (l: CloudList, expected: number) => {
    if (l.revision !== expected) conflict()
  }
  const owner = (l: CloudList) => {
    if (l.ownerId !== uid) throw new DraftConflict('作成者だけが操作できます。')
  }
  const api = {
    async lists() {
      const s = await onlineRead(
        getDocsFromServer(
          query(
            collection(db, 'sharedLists'),
            where('memberIds', 'array-contains', uid),
            limit(30),
          ),
        ),
      )
      return s.docs
        .map((d) => decodeList(d.id, d.data()))
        .sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())
    },
    async read(id: string) {
      const s = await onlineRead(getDocFromServer(listRef(id)))
      if (!s.exists()) return absent()
      return decodeList(s.id, s.data())
    },
    watch(id: string, onChange: (l: CloudList | null) => void, onError: (e: unknown) => void) {
      return onSnapshot(
        listRef(id),
        { includeMetadataChanges: true },
        (s) => {
          // Never treat a cache-only or unacknowledged write as authorization/current data.
          if (s.metadata.fromCache || s.metadata.hasPendingWrites) return
          try {
            onChange(s.exists() ? decodeList(s.id, s.data()) : null)
          } catch (e) {
            onError(e)
          }
        },
        onError,
      )
    },
    async items(id: string) {
      const s = await onlineRead(
        getDocsFromServer(query(collection(listRef(id), 'items'), limit(100))),
      )
      return s.docs
        .map((d) => decodeItem(d.id, d.data()))
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    },
    async create(name: string, color: Color, displayName: string, draft?: CloudDraft) {
      name = textValue(name, 40)
      displayName = textValue(displayName, 30)
      const id = randomHex(16)
      await runTransaction(db, async (tx) => {
        const slots = await Promise.all(['1', '2', '3'].map((s) => tx.get(slotRef(uid, s))))
        const slot = slots.find((s) => !s.exists())?.id
        if (!slot)
          throw new DraftConflict('作成枠は3つまでです。不要な共有リストを削除すると作れます。')
        if (draft) {
          const s = await tx.get(doc(db, 'wishlistDrafts', uid, 'lists', draft.id))
          if (!s.exists() || decodeDraft(s.id, s.data(), uid).revision !== draft.revision)
            conflict()
        }
        tx.set(listRef(id), {
          schemaVersion: 1,
          creatorId: uid,
          slot,
          ownerId: uid,
          name,
          color,
          members: { [uid]: displayName },
          memberIds: [uid],
          successorId: null,
          currentInvite: null,
          status: 'active',
          cleanupUid: null,
          cleanupVersion: 0,
          cleanedCount: 0,
          itemCount: 0,
          inviteCount: 0,
          action: 'create',
          target: '',
          revision: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        tx.set(slotRef(uid, slot), { listId: id })
      })
      return id
    },
    async rename(id: string, expected: number, name: string, color: Color) {
      name = textValue(name, 40)
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id)
        owner(l)
        current(l, expected)
        patch(tx, l, 'edit', '', { name, color })
      })
    },
    async invite(id: string) {
      // Prune obsolete invitations first; tokens never become valid again.
      const old = await onlineRead(
        getDocsFromServer(query(collection(listRef(id), 'invitations'), limit(10))),
      )
      for (const entry of old.docs) await api.pruneInvite(id, entry.id)
      const token = randomHex(32)
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id)
        owner(l)
        if (l.memberIds.length >= 5) throw new DraftConflict('参加者は5人までです。')
        tx.set(inviteRef(id, token), {
          ownerId: uid,
          ownerName: l.members[uid],
          listName: l.name,
          status: 'open',
          applicantId: null,
          applicantName: null,
          revision: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        patch(tx, l, 'invite', token, { currentInvite: token, inviteCount: l.inviteCount + 1 })
      })
      return token
    },
    async pruneInvite(id: string, token: string) {
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id, false)
        owner(l)
        const s = await tx.get(inviteRef(id, token))
        if (!s.exists() || l.currentInvite === token) return
        tx.delete(s.ref)
        patch(tx, l, 'pruneInvite', token, { inviteCount: l.inviteCount - 1 })
      })
    },
    async invitation(id: string, token: string) {
      const s = await onlineRead(getDocFromServer(inviteRef(id, token)))
      if (!s.exists())
        throw new DraftConflict(
          '招待を確認できません。取り消し・期限切れの場合は再発行をお願いしてください。',
        )
      return decodeInvite(token, s.data())
    },
    async request(id: string, token: string, displayName: string) {
      displayName = textValue(displayName, 30)
      await runTransaction(db, async (tx) => {
        const s = await tx.get(inviteRef(id, token))
        if (!s.exists()) return absent()
        const i = decodeInvite(token, s.data())
        if (i.status !== 'open')
          throw new DraftConflict('この招待は申請済みか、利用できない状態です。')
        tx.update(s.ref, {
          status: 'requested',
          applicantId: uid,
          applicantName: displayName,
          revision: i.revision + 1,
          updatedAt: serverTimestamp(),
        })
      })
    },
    async withdraw(id: string, token: string) {
      await runTransaction(db, async (tx) => {
        const s = await tx.get(inviteRef(id, token))
        if (!s.exists()) return
        const i = decodeInvite(token, s.data())
        if (i.status !== 'requested' || i.applicantId !== uid) return absent()
        tx.update(s.ref, {
          status: 'open',
          applicantId: null,
          applicantName: null,
          revision: i.revision + 1,
          updatedAt: serverTimestamp(),
        })
      })
    },
    async approve(id: string, token: string) {
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id)
        owner(l)
        const s = await tx.get(inviteRef(id, token))
        if (!s.exists()) return absent()
        const i = decodeInvite(token, s.data())
        if (
          l.currentInvite !== token ||
          i.status !== 'requested' ||
          !i.applicantId ||
          !i.applicantName
        )
          return absent()
        patch(tx, l, 'approve', i.applicantId, {
          memberIds: [...l.memberIds, i.applicantId],
          members: { ...l.members, [i.applicantId]: i.applicantName },
        })
        tx.update(s.ref, { status: 'used', revision: i.revision + 1, updatedAt: serverTimestamp() })
      })
    },
    async revoke(id: string, token: string) {
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id)
        owner(l)
        const s = await tx.get(inviteRef(id, token))
        if (!s.exists()) return
        const i = decodeInvite(token, s.data())
        if (l.currentInvite !== token) conflict()
        patch(tx, l, 'revoke', token, { currentInvite: null })
        tx.update(s.ref, {
          status: 'revoked',
          applicantId: null,
          applicantName: null,
          revision: i.revision + 1,
          updatedAt: serverTimestamp(),
        })
      })
    },
    async add(id: string, candidate: Candidate, note: string) {
      const key = await candidateId(candidate)
      note = textValue(note, 300, true)
      let duplicate = false
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id),
          s = await tx.get(itemRef(id, key))
        if (s.exists()) {
          duplicate = true
          return
        }
        tx.set(s.ref, {
          candidate,
          note,
          authorId: uid,
          reactions: {},
          cleanVersion: 0,
          revision: 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        patch(tx, l, 'addItem', key, { itemCount: l.itemCount + 1 })
      })
      return { id: key, duplicate }
    },
    async editItem(id: string, item: CloudItem, note: string) {
      note = textValue(note, 300, true)
      await runTransaction(db, async (tx) => {
        await load(tx, id)
        const s = await tx.get(itemRef(id, item.id))
        if (!s.exists() || s.data().revision !== item.revision) conflict()
        tx.update(s.ref, { note, revision: item.revision + 1, updatedAt: serverTimestamp() })
      })
    },
    async react(id: string, itemId: string, reaction: Reaction | null, expected: Reaction | null) {
      await runTransaction(db, async (tx) => {
        await load(tx, id)
        const s = await tx.get(itemRef(id, itemId))
        if (!s.exists()) return absent()
        const i = decodeItem(s.id, s.data())
        if ((i.reactions[uid] ?? null) !== expected) conflict()
        const reactions = { ...i.reactions }
        if (reaction) reactions[uid] = reaction
        else delete reactions[uid]
        tx.update(s.ref, { reactions, revision: i.revision + 1, updatedAt: serverTimestamp() })
      })
    },
    async removeItem(id: string, item: CloudItem) {
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id),
          s = await tx.get(itemRef(id, item.id))
        if (!s.exists() || s.data().revision !== item.revision) conflict()
        tx.delete(s.ref)
        patch(tx, l, 'removeItem', item.id, { itemCount: l.itemCount - 1 })
      })
    },
    async removeMember(id: string, target: string, expected: number) {
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id)
        current(l, expected)
        if (
          !l.memberIds.includes(target) ||
          l.ownerId === target ||
          (uid !== target && l.ownerId !== uid)
        )
          return absent()
        const members = { ...l.members }
        delete members[target]
        patch(tx, l, 'removeMember', target, {
          members,
          memberIds: l.memberIds.filter((m) => m !== target),
          successorId: null,
          currentInvite: null,
          status: 'cleaning',
          cleanupUid: target,
          cleanupVersion: l.revision + 1,
          cleanedCount: 0,
        })
      })
      if (uid !== target) await api.resume(id)
    },
    async transfer(id: string, target: string | null, expected: number, accept = false) {
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id)
        current(l, expected)
        if (accept) {
          if (l.successorId !== uid) return absent()
          patch(tx, l, 'acceptTransfer', uid, {
            ownerId: uid,
            successorId: null,
            currentInvite: null,
          })
        } else {
          owner(l)
          patch(tx, l, 'offerTransfer', target ?? '', { successorId: target })
        }
      })
    },
    async beginDelete(id: string, expected: number) {
      await runTransaction(db, async (tx) => {
        const l = await load(tx, id, false)
        owner(l)
        current(l, expected)
        patch(tx, l, 'delete', '', { status: 'deleting', currentInvite: null, successorId: null })
      })
      await api.resume(id)
    },
    async resume(id: string) {
      let l = await runTransaction(db, (tx) => load(tx, id, false))
      owner(l)
      if (l.status === 'active') return
      const items = await api.items(id)
      for (const item of items)
        await runTransaction(db, async (tx) => {
          const currentList = await load(tx, id, false)
          owner(currentList)
          const s = await tx.get(itemRef(id, item.id))
          if (!s.exists()) return
          const i = decodeItem(s.id, s.data())
          if (currentList.status === 'deleting') {
            tx.delete(s.ref)
            patch(tx, currentList, 'deleteItem', item.id, { itemCount: currentList.itemCount - 1 })
          } else if (
            currentList.status === 'cleaning' &&
            i.cleanVersion < currentList.cleanupVersion
          ) {
            const target = currentList.cleanupUid!,
              reactions = { ...i.reactions }
            delete reactions[target]
            tx.update(s.ref, {
              authorId: i.authorId === target ? null : i.authorId,
              reactions,
              cleanVersion: currentList.cleanupVersion,
              revision: i.revision + 1,
              updatedAt: serverTimestamp(),
            })
            patch(tx, currentList, 'cleanItem', item.id, {
              cleanedCount: currentList.cleanedCount + 1,
            })
          }
        })
      l = await runTransaction(db, (tx) => load(tx, id, false))
      // A member's old requests/acceptances also contain their display name and UID.
      // Finish their removal before making the list active again.
      const invites = await onlineRead(getDocsFromServer(collection(listRef(id), 'invitations')))
      for (const i of invites.docs) await api.pruneInvite(id, i.id)
      if (l.status === 'deleting') {
        await runTransaction(db, async (tx) => {
          const latest = await load(tx, id, false)
          owner(latest)
          if (latest.status !== 'deleting' || latest.itemCount !== 0 || latest.inviteCount !== 0)
            conflict()
          tx.delete(listRef(id))
          tx.delete(slotRef(latest.creatorId, latest.slot))
        })
      } else if (l.status === 'cleaning')
        await runTransaction(db, async (tx) => {
          const latest = await load(tx, id, false)
          owner(latest)
          if (latest.cleanedCount !== latest.itemCount || latest.inviteCount !== 0) conflict()
          patch(tx, latest, 'cleanupDone', '', { status: 'active', cleanupUid: null })
        })
    },
  }
  return api
}
export type CloudRepository = ReturnType<typeof sharingRepository>
