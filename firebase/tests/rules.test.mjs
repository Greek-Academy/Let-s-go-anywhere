import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'

let env
const projectId = 'demo-driveplus'
const db = (uid = 'alice', verified = true) =>
  env
    .authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: verified })
    .firestore()
const ref = (client, uid = 'alice', slot = '1') => doc(client, 'wishlistDrafts', uid, 'lists', slot)
const data = (extra = {}) => ({
  schemaVersion: 1,
  ownerId: 'alice',
  name: 'ふたりの休日',
  color: 'teal',
  revision: 1,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
})
before(async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^127\.0\.0\.1:8086$/)
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8086,
      rules: await readFile('firebase/firestore.rules', 'utf8'),
    },
  })
})
beforeEach(async () => {
  await env.clearFirestore()
})
after(async () => {
  await env?.cleanup()
})

test('verified owner creates, lists, updates and deletes a list', async () => {
  const client = db(),
    list = ref(client)
  await assertSucceeds(setDoc(list, data()))
  const first = await assertSucceeds(getDoc(list))
  assert.equal(first.data().name, 'ふたりの休日')
  assert.equal(
    (await assertSucceeds(getDocs(collection(client, 'wishlistDrafts/alice/lists')))).size,
    1,
  )
  await assertSucceeds(
    updateDoc(list, {
      name: '温泉の休日',
      color: 'blue',
      revision: 2,
      updatedAt: serverTimestamp(),
    }),
  )
  await assertSucceeds(deleteDoc(list))
})

test('anonymous and unverified accounts cannot read or write', async () => {
  await setDoc(ref(db()), data())
  for (const client of [env.unauthenticatedContext().firestore(), db('alice', false)]) {
    await assertFails(getDoc(ref(client)))
    await assertFails(getDocs(collection(client, 'wishlistDrafts/alice/lists')))
    await assertFails(setDoc(ref(client, 'alice', '2'), data()))
    await assertFails(
      updateDoc(ref(client), { name: '変更', revision: 2, updatedAt: serverTimestamp() }),
    )
    await assertFails(deleteDoc(ref(client)))
  }
})

test('another verified account cannot read, query, create, change or delete owner data', async () => {
  await setDoc(ref(db()), data())
  const client = db('bob')
  await assertFails(getDoc(ref(client)))
  await assertFails(getDocs(collection(client, 'wishlistDrafts/alice/lists')))
  await assertFails(setDoc(ref(client, 'alice', '2'), data()))
  await assertFails(
    updateDoc(ref(client), { name: '変更', revision: 2, updatedAt: serverTimestamp() }),
  )
  await assertFails(deleteDoc(ref(client)))
  await assertSucceeds(setDoc(ref(client, 'bob'), data({ ownerId: 'bob' })))
})

test('only three bounded slots are writable; nested data and global enumeration denied', async () => {
  const client = db()
  for (const slot of ['1', '2', '3'])
    await assertSucceeds(setDoc(ref(client, 'alice', slot), data()))
  for (const slot of ['4', 'free-id', '0'])
    await assertFails(setDoc(ref(client, 'alice', slot), data()))
  await assertFails(getDocs(collection(client, 'wishlistDrafts')))
  await assertFails(
    setDoc(doc(client, 'wishlistDrafts/alice/lists/1/items/secret'), { value: 'private' }),
  )
  await assertFails(setDoc(doc(client, 'sharedLists/secret'), { name: 'unsupported' }))
})

test('extra personal fields, forged identity, unknown schema, invalid type and empty names rejected', async () => {
  const target = ref(db())
  for (const extra of [
    { currentLocation: { latitude: 35 } },
    { learningHistory: [] },
    { email: 'alice@example.test' },
    { ownerId: 'bob' },
    { schemaVersion: 2 },
    { color: 'red' },
    { revision: 1.5 },
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(41) },
    { name: 42 },
  ])
    await assertFails(setDoc(target, data(extra)))
  const missing = data()
  delete missing.color
  await assertFails(setDoc(target, missing))
})

test('only server time is accepted and original creation time cannot be edited', async () => {
  const target = ref(db())
  await assertFails(setDoc(target, data({ createdAt: Timestamp.fromMillis(0) })))
  await assertFails(setDoc(target, data({ updatedAt: Timestamp.fromMillis(0) })))
  await setDoc(target, data())
  await assertFails(
    updateDoc(target, {
      createdAt: Timestamp.fromMillis(0),
      revision: 2,
      updatedAt: serverTimestamp(),
    }),
  )
})

test('stale revision and identity replacement are rejected; proper sequential revision accepted', async () => {
  const target = ref(db())
  await setDoc(target, data())
  await assertSucceeds(
    updateDoc(target, { revision: 2, name: '別の画面の編集', updatedAt: serverTimestamp() }),
  )
  await assertFails(
    updateDoc(target, { revision: 2, name: '古い編集', updatedAt: serverTimestamp() }),
  )
  await assertFails(
    updateDoc(target, { revision: 4, name: '飛び越し', updatedAt: serverTimestamp() }),
  )
  await assertFails(
    updateDoc(target, { revision: 3, ownerId: 'bob', updatedAt: serverTimestamp() }),
  )
  await assertSucceeds(
    updateDoc(target, { revision: 3, name: '最新から編集', updatedAt: serverTimestamp() }),
  )
})

test('deleted data is absent and never made public', async () => {
  const target = ref(db())
  await setDoc(target, data())
  await deleteDoc(target)
  assert.equal((await getDoc(target)).exists(), false)
  await assertFails(getDoc(ref(db('bob'))))
})
