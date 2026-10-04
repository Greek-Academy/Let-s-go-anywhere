import { before, beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
let env
const id = 'a'.repeat(32),
  token = 'b'.repeat(64),
  item = 'c'.repeat(64)
const db = (uid = 'alice', verified = true) =>
  env.authenticatedContext(uid, { email_verified: verified }).firestore()
const lr = (c) => doc(c, 'sharedLists', id),
  ir = (c) => doc(lr(c), 'items', item),
  vr = (c, t = token) => doc(lr(c), 'invitations', t)
const slot = (c) => doc(c, 'sharedCreationSlots/alice/slots/1')
const now = () => serverTimestamp()
const list = (overrides = {}) => ({
  schemaVersion: 1,
  creatorId: 'alice',
  slot: '1',
  ownerId: 'alice',
  name: 'ふたりの休日',
  color: 'teal',
  members: { alice: 'あおい' },
  memberIds: ['alice'],
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
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
})
const candidate = {
  kind: 'link',
  catalogId: null,
  title: '公園を散歩',
  area: '京都',
  url: 'https://example.com/park',
  status: '持ち込みリンク・内容未確認',
  sample: false,
  capturedAt: '2026-10-04T00:00:00.000Z',
}
const itemData = (uid = 'alice', overrides = {}) => ({
  candidate,
  note: '午後に行きたい',
  authorId: uid,
  reactions: {},
  cleanVersion: 0,
  revision: 1,
  createdAt: now(),
  updatedAt: now(),
  ...overrides,
})
async function create(c = db(), overrides = {}) {
  const b = writeBatch(c)
  b.set(lr(c), list(overrides))
  b.set(slot(c), { listId: id })
  await b.commit()
}
async function patch(c, action, target = '', extra = {}) {
  const s = await getDoc(lr(c))
  return { action, target, ...extra, revision: s.data().revision + 1, updatedAt: now() }
}
async function invite(c = db(), t = token) {
  const l = (await getDoc(lr(c))).data(),
    b = writeBatch(c)
  b.set(vr(c, t), {
    ownerId: l.ownerId,
    ownerName: l.members[l.ownerId],
    listName: l.name,
    status: 'open',
    applicantId: null,
    applicantName: null,
    revision: 1,
    createdAt: now(),
    updatedAt: now(),
  })
  b.update(lr(c), await patch(c, 'invite', t, { currentInvite: t, inviteCount: l.inviteCount + 1 }))
  await b.commit()
}
async function request(c = db('bob')) {
  await updateDoc(vr(c), {
    status: 'requested',
    applicantId: 'bob',
    applicantName: 'はる',
    revision: 2,
    updatedAt: now(),
  })
}
async function approve(c = db()) {
  const b = writeBatch(c)
  b.update(
    lr(c),
    await patch(c, 'approve', 'bob', {
      memberIds: ['alice', 'bob'],
      members: { alice: 'あおい', bob: 'はる' },
    }),
  )
  b.update(vr(c), { status: 'used', revision: 3, updatedAt: now() })
  await b.commit()
}
async function pair() {
  await create()
  await invite()
  await request()
  await approve()
}
async function add(c = db(), data = itemData()) {
  const b = writeBatch(c)
  b.set(ir(c), data)
  b.update(lr(c), await patch(c, 'addItem', item, { itemCount: 1 }))
  await b.commit()
}
async function removeMember(c = db()) {
  const l = (await getDoc(lr(c))).data()
  await updateDoc(
    lr(c),
    await patch(c, 'removeMember', 'bob', {
      members: { alice: 'あおい' },
      memberIds: ['alice'],
      status: 'cleaning',
      cleanupUid: 'bob',
      cleanupVersion: l.revision + 1,
      cleanedCount: 0,
      currentInvite: null,
      successorId: null,
    }),
  )
}
async function clean(c = db()) {
  const l = (await getDoc(lr(c))).data(),
    i = (await getDoc(ir(c))).data(),
    b = writeBatch(c)
  const reactions = { ...i.reactions }
  delete reactions.bob
  b.update(ir(c), {
    authorId: i.authorId === 'bob' ? null : i.authorId,
    reactions,
    cleanVersion: l.cleanupVersion,
    revision: i.revision + 1,
    updatedAt: now(),
  })
  b.update(lr(c), await patch(c, 'cleanItem', item, { cleanedCount: l.cleanedCount + 1 }))
  await b.commit()
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8086')
  env = await initializeTestEnvironment({
    projectId: 'demo-driveplus',
    firestore: {
      host: '127.0.0.1',
      port: 8086,
      rules: await readFile('firebase/firestore.rules', 'utf8'),
    },
  })
})
beforeEach(async () => env.clearFirestore())
after(async () => env?.cleanup())

test('shared list requires atomic bounded creation slot and exposes no private fields', async () => {
  const c = db()
  await assertFails(setDoc(lr(c), list()))
  await assertFails(setDoc(slot(c), { listId: id }))
  await assertSucceeds(create(c))
  await assertFails(updateDoc(lr(c), await patch(c, 'edit', '', { email: 'alice@example.test' })))
  await assertFails(updateDoc(lr(c), await patch(c, 'edit', '', { creatorId: 'bob' })))
  await assertFails(
    updateDoc(lr(c), await patch(c, 'edit', '', { createdAt: Timestamp.fromMillis(0) })),
  )
  await assertSucceeds(updateDoc(lr(c), await patch(c, 'edit', '', { name: '次の休日' })))
  await assertFails(deleteDoc(lr(c)))
  await assertFails(deleteDoc(slot(c)))
})
test('private list, items, membership queries and slots reject outsiders/unverified/anonymous', async () => {
  await create()
  await add()
  for (const c of [db('bob'), db('alice', false), env.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(lr(c)))
    await assertFails(getDoc(ir(c)))
    await assertFails(getDocs(collection(lr(c), 'items')))
    await assertFails(getDoc(slot(c)))
    await assertFails(updateDoc(lr(c), { memberIds: ['alice', 'bob'] }))
  }
  await assertFails(getDocs(collection(db(), 'sharedLists')))
  assert.equal(
    (
      await getDocs(
        query(collection(db(), 'sharedLists'), where('memberIds', 'array-contains', 'alice')),
      )
    ).size,
    1,
  )
})
test('invitation is unenumerable; one applicant, explicit owner approval, and no candidate read before approval', async () => {
  await create()
  await add()
  await invite()
  const b = db('bob'),
    m = db('mallory')
  await assertSucceeds(getDoc(vr(b)))
  await assertFails(getDocs(collection(lr(b), 'invitations')))
  await assertSucceeds(request(b))
  await assertFails(getDoc(lr(b)))
  await assertFails(getDoc(ir(b)))
  await assertFails(getDoc(vr(m)))
  await assertFails(
    updateDoc(vr(m), {
      status: 'requested',
      applicantId: 'mallory',
      applicantName: '他人',
      revision: 3,
      updatedAt: now(),
    }),
  )
  await assertFails(updateDoc(vr(b), { status: 'used', revision: 3, updatedAt: now() }))
  await assertSucceeds(approve())
  await assertSucceeds(getDoc(ir(b)))
  await assertFails(
    updateDoc(vr(b), {
      status: 'open',
      applicantId: null,
      applicantName: null,
      revision: 4,
      updatedAt: now(),
    }),
  )
})
test('membership cannot be granted without consuming the correct unexpired invitation', async () => {
  await create()
  await invite()
  await request()
  const c = db()
  await assertFails(
    updateDoc(
      lr(c),
      await patch(c, 'approve', 'bob', {
        members: { alice: 'あおい', bob: 'はる' },
        memberIds: ['alice', 'bob'],
      }),
    ),
  )
  await env.withSecurityRulesDisabled(async (x) =>
    updateDoc(vr(x.firestore()), { createdAt: Timestamp.fromMillis(Date.now() - 8 * 86400_000) }),
  )
  await assertFails(approve())
  await assertFails(getDoc(vr(db('bob'))))
})
test('reissue, withdrawal and revocation invalidate old paths and prevent replay', async () => {
  await create()
  await invite()
  await request()
  const b = db('bob'),
    a = db()
  await assertSucceeds(
    updateDoc(vr(b), {
      status: 'open',
      applicantId: null,
      applicantName: null,
      revision: 3,
      updatedAt: now(),
    }),
  )
  const t = 'd'.repeat(64)
  await invite(a, t)
  await assertFails(getDoc(vr(b)))
  const batch = writeBatch(a)
  batch.update(lr(a), await patch(a, 'revoke', t, { currentInvite: null }))
  batch.update(vr(a, t), {
    status: 'revoked',
    applicantId: null,
    applicantName: null,
    revision: 2,
    updatedAt: now(),
  })
  await assertSucceeds(batch.commit())
  await assertFails(getDoc(vr(b, t)))
})
test('item add/delete is paired with a bounded count; private fields and forged author rejected', async () => {
  await pair()
  const a = db(),
    b = db('bob')
  await assertFails(setDoc(ir(b), itemData('bob')))
  await assertFails(add(b, itemData('alice')))
  await assertFails(add(b, itemData('bob', { privateLearning: { score: 65 } })))
  await assertSucceeds(add(b, itemData('bob')))
  await assertFails(updateDoc(lr(a), await patch(a, 'addItem', 'd'.repeat(64), { itemCount: 2 })))
  await assertFails(deleteDoc(ir(b)))
  const tx = writeBatch(b)
  tx.delete(ir(b))
  tx.update(lr(b), await patch(b, 'removeItem', item, { itemCount: 0 }))
  await assertSucceeds(tx.commit())
})
test('members change only their own reactions; owner cannot rewrite an active author note', async () => {
  await pair()
  await add()
  const a = db(),
    b = db('bob')
  await assertSucceeds(
    updateDoc(ir(a), { reactions: { alice: 'want' }, revision: 2, updatedAt: now() }),
  )
  await assertFails(
    updateDoc(ir(b), { reactions: { alice: 'pass' }, revision: 3, updatedAt: now() }),
  )
  await assertSucceeds(
    updateDoc(ir(b), {
      reactions: { alice: 'want', bob: 'interested' },
      revision: 3,
      updatedAt: now(),
    }),
  )
  await assertFails(updateDoc(ir(b), { note: '他人のメモ', revision: 4, updatedAt: now() }))
  await assertFails(
    updateDoc(ir(b), {
      candidate: { ...candidate, currentLocation: [35, 139] },
      revision: 4,
      updatedAt: now(),
    }),
  )
  await assertSucceeds(
    updateDoc(ir(a), { note: '自分のメモの更新', revision: 4, updatedAt: now() }),
  )
  await assertFails(updateDoc(ir(a), { note: '古い上書き', revision: 4, updatedAt: now() }))
})
test('leave revokes reads immediately and cleanup is checked, resumable and cannot count an item twice', async () => {
  await pair()
  await add(db('bob'), itemData('bob'))
  await updateDoc(ir(db('bob')), { reactions: { bob: 'want' }, revision: 2, updatedAt: now() })
  await assertSucceeds(removeMember(db('bob')))
  await assertFails(getDoc(ir(db('bob'))))
  await assertFails(getDoc(lr(db('bob'))))
  const a = db()
  await assertFails(
    updateDoc(lr(a), await patch(a, 'cleanupDone', '', { status: 'active', cleanupUid: null })),
  )
  await assertFails(updateDoc(lr(a), await patch(a, 'cleanItem', item, { cleanedCount: 1 })))
  await assertSucceeds(clean(a))
  await assertFails(clean(a))
  const prune = writeBatch(a)
  prune.delete(vr(a))
  prune.update(lr(a), await patch(a, 'pruneInvite', token, { inviteCount: 0 }))
  await assertSucceeds(prune.commit())
  await assertSucceeds(
    updateDoc(lr(a), await patch(a, 'cleanupDone', '', { status: 'active', cleanupUid: null })),
  )
  const stored = (await getDoc(ir(a))).data()
  assert.equal(stored.authorId, null)
  assert.deepEqual(stored.reactions, {})
  await assertSucceeds(
    updateDoc(ir(a), {
      note: '退出後は作成者が編集',
      revision: stored.revision + 1,
      updatedAt: now(),
    }),
  )
})
test('ownership handoff requires recipient acceptance, invalidates invitation and preserves members', async () => {
  await pair()
  const a = db(),
    b = db('bob')
  const token2 = 'e'.repeat(64)
  await invite(a, token2)
  await assertFails(
    updateDoc(
      lr(a),
      await patch(a, 'acceptTransfer', 'alice', {
        ownerId: 'alice',
        successorId: null,
        currentInvite: null,
      }),
    ),
  )
  await assertSucceeds(
    updateDoc(lr(a), await patch(a, 'offerTransfer', 'bob', { successorId: 'bob' })),
  )
  await assertSucceeds(
    updateDoc(
      lr(b),
      await patch(b, 'acceptTransfer', 'bob', {
        ownerId: 'bob',
        successorId: null,
        currentInvite: null,
      }),
    ),
  )
  await assertFails(updateDoc(lr(a), await patch(a, 'edit', '', { name: '前の作成者' })))
  await assertSucceeds(updateDoc(lr(b), await patch(b, 'edit', '', { name: '新しい作成者' })))
  await assertFails(getDoc(vr(db('mallory'), token2)))
})
test('delete blocks member reads, demands deletion of children and releases creator slot atomically', async () => {
  await pair()
  await add()
  const a = db(),
    b = db('bob')
  await updateDoc(
    lr(a),
    await patch(a, 'delete', '', { status: 'deleting', currentInvite: null, successorId: null }),
  )
  await assertFails(getDoc(ir(b)))
  await assertFails(deleteDoc(lr(a)))
  let batch = writeBatch(a)
  batch.delete(ir(a))
  batch.update(lr(a), await patch(a, 'deleteItem', item, { itemCount: 0 }))
  await assertSucceeds(batch.commit())
  batch = writeBatch(a)
  batch.delete(vr(a))
  batch.update(lr(a), await patch(a, 'pruneInvite', token, { inviteCount: 0 }))
  await assertSucceeds(batch.commit())
  await assertFails(deleteDoc(lr(a)))
  batch = writeBatch(a)
  batch.delete(lr(a))
  batch.delete(slot(a))
  await assertSucceeds(batch.commit())
  assert.equal((await getDoc(slot(a))).exists(), false)
  await assertFails(getDoc(ir(a)))
  await assertSucceeds(create())
})

test('three creation slots, five members and one hundred candidates are server-enforced', async () => {
  const a = db()
  for (const n of [1, 2, 3, 4]) {
    const key = String(n).repeat(32),
      b = writeBatch(a)
    b.set(doc(a, 'sharedLists', key), list({ slot: String(n) }))
    b.set(doc(a, 'sharedCreationSlots/alice/slots', String(n)), { listId: key })
    if (n <= 3) await assertSucceeds(b.commit())
    else await assertFails(b.commit())
  }
  await env.withSecurityRulesDisabled(async (x) =>
    setDoc(
      lr(x.firestore()),
      list({
        memberIds: ['alice', 'bob', 'c', 'd', 'e'],
        members: { alice: 'あおい', bob: 'はる', c: 'C', d: 'D', e: 'E' },
        itemCount: 100,
      }),
    ),
  )
  await assertFails(invite(a))
  const b = writeBatch(a)
  b.set(ir(a), itemData())
  b.update(lr(a), await patch(a, 'addItem', item, { itemCount: 101 }))
  await assertFails(b.commit())
})
test('invalid candidate shapes and cross-list counter pairing are rejected', async () => {
  await create()
  for (const invalid of [
    { ...candidate, kind: 'catalog', catalogId: null },
    { ...candidate, kind: 'web', url: null },
    { ...candidate, kind: 'link', catalogId: 'private' },
    { ...candidate, capturedAt: 'unknown' },
    { ...candidate, url: 'javascript:alert(1)' },
    { ...candidate, url: 'https://example.com', privateNote: 'private' },
  ])
    await assertFails(add(db(), itemData('alice', { candidate: invalid })))
  const a = db(),
    other = 'd'.repeat(32),
    b = writeBatch(a)
  await env.withSecurityRulesDisabled(async (x) =>
    setDoc(doc(x.firestore(), 'sharedLists', other), list({ slot: '2' })),
  )
  b.set(doc(a, 'sharedLists', other, 'items', item), itemData())
  b.update(lr(a), await patch(a, 'addItem', item, { itemCount: 1 }))
  await assertFails(b.commit())
  await assertSucceeds(add())
})
