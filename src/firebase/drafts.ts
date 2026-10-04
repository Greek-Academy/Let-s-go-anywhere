import {
  collection,
  doc,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { DraftConflict } from './client'
import type { Color } from '../sharing/model'

export interface CloudDraft {
  id: string
  name: string
  color: Color
  revision: number
}
export const slots = ['1', '2', '3'] as const
async function serverRead<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new DraftConflict(
                '保存先に接続できませんでした。通信を確認して、最新の内容を読み直してください。',
              ),
            ),
          12_000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
export function decodeDraft(id: string, raw: unknown, uid: string): CloudDraft {
  const d = raw as Record<string, unknown>
  const fields = ['schemaVersion', 'ownerId', 'name', 'color', 'revision', 'createdAt', 'updatedAt']
  if (
    !d ||
    Object.keys(d).length !== fields.length ||
    !fields.every((f) => f in d) ||
    !slots.some((s) => s === id) ||
    d.schemaVersion !== 1 ||
    d.ownerId !== uid ||
    typeof d.name !== 'string' ||
    !d.name.trim() ||
    d.name.length > 40 ||
    !['teal', 'blue', 'peach'].includes(d.color as string) ||
    !Number.isSafeInteger(d.revision) ||
    (d.revision as number) < 1 ||
    !(d.createdAt instanceof Timestamp) ||
    !(d.updatedAt instanceof Timestamp)
  )
    throw new DraftConflict('対応していない保存内容です。上書きせず、開発側へお知らせください。')
  return { id, name: d.name, color: d.color as Color, revision: d.revision as number }
}
export function draftRepository(db: Firestore, uid: string) {
  const lists = collection(db, 'wishlistDrafts', uid, 'lists')
  const ref = (id: string) => {
    if (!slots.some((s) => s === id)) throw new DraftConflict('リストは3つまで作れます。')
    return doc(lists, id)
  }
  return {
    async read() {
      const result = await serverRead(getDocsFromServer(lists))
      return result.docs.map((d) => decodeDraft(d.id, d.data(), uid))
    },
    async save(id: string, name: string, color: Color, expected: number | null) {
      const trimmed = name.trim()
      if (!trimmed || trimmed.length > 40)
        throw new DraftConflict('リスト名を1〜40文字で入力してください。')
      await runTransaction(db, async (tx) => {
        const target = ref(id)
        const snapshot = await tx.get(target)
        const current = snapshot.exists() ? decodeDraft(id, snapshot.data(), uid) : null
        if ((current?.revision ?? null) !== expected)
          throw new DraftConflict(
            '別の画面で変更されました。入力を控え、編集を閉じて最新の内容を読み直してください。',
          )
        tx.set(target, {
          schemaVersion: 1,
          ownerId: uid,
          name: trimmed,
          color,
          revision: (current?.revision ?? 0) + 1,
          createdAt: snapshot.exists() ? snapshot.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      })
    },
    async remove(draft: CloudDraft) {
      await runTransaction(db, async (tx) => {
        const target = ref(draft.id)
        const snapshot = await tx.get(target)
        if (
          !snapshot.exists() ||
          decodeDraft(draft.id, snapshot.data(), uid).revision !== draft.revision
        )
          throw new DraftConflict('別の画面で変更されました。最新の内容を読み直してください。')
        tx.delete(target)
      })
    },
  }
}
