import { expect, test } from '@playwright/test'
import { applyCommand, allInterested, canRead, INVITE_DURATION } from '../src/sharing/domain'
import { decodeSharing } from '../src/sharing/codec'
import { createDemoRepository, createMemoryStore } from '../src/sharing/repository'
import { fromLink, fromOuting, fromWebSpot } from '../src/sharing/candidates'
import { emptySharing, SHARING_KEY } from '../src/sharing/model'
import type { Actor, Command, SharingState } from '../src/sharing/model'
import { sampleCatalog } from '../src/content/sampleCatalog'
const now = Date.parse('2026-10-03T03:00:00Z')
const candidate = fromLink(
  { title: '確認用カフェ', url: 'https://example.com/cafe' },
  new Date(now),
)
function scenario() {
  let state = emptySharing(),
    counter = 0
  const run = (actor: Actor, command: Command, at = now) => {
    const result = applyCommand(state, actor, command, at, () => `id-${++counter}`)
    decodeSharing(JSON.stringify(result.state))
    state = result.state
    return result
  }
  const listId = run('self', { type: 'create', name: 'ふたりの休日', color: 'teal' }).listId
  const join = () => {
    const token = run('self', { type: 'invite', listId }).token!
    run('haru', { type: 'request', listId, token })
    run('self', { type: 'approve', listId, token })
    return token
  }
  return { run, listId, join, state: () => state, list: () => state.lists[0] }
}
test('invitation does not grant access, approval is required and consumes the invitation', () => {
  const s = scenario(),
    token = s.run('self', { type: 'invite', listId: s.listId }).token!
  s.run('haru', { type: 'request', listId: s.listId, token })
  expect(canRead(s.list(), 'haru')).toBe(false)
  expect(() => s.run('haru', { type: 'add', listId: s.listId, candidate, note: '' })).toThrow(
    'メンバー',
  )
  expect(() => s.run('haru', { type: 'approve', listId: s.listId, token })).toThrow('メンバー')
  s.run('self', { type: 'approve', listId: s.listId, token })
  expect(canRead(s.list(), 'haru')).toBe(true)
  expect(s.list().invites[0]).toMatchObject({ status: 'used', applicant: null })
  expect(() => s.run('haru', { type: 'request', listId: s.listId, token })).toThrow('期限切れ')
})
test('expiry and revocation are rechecked at approval, not just when the screen opened', () => {
  for (const mode of ['expire', 'revoke'] as const) {
    const s = scenario(),
      token = s.run('self', { type: 'invite', listId: s.listId }).token!
    s.run('haru', { type: 'request', listId: s.listId, token })
    if (mode === 'revoke') s.run('self', { type: 'revoke', listId: s.listId, token })
    expect(() =>
      s.run('self', { type: 'approve', listId: s.listId, token }, now + INVITE_DURATION),
    ).toThrow('期限切れ')
    expect(canRead(s.list(), 'haru')).toBe(false)
  }
})
test('reactions are per actor; unanswered and pass exclude mutual interest; removing a member purges identity', () => {
  const s = scenario()
  s.join()
  const itemId = s.run('haru', {
    type: 'add',
    listId: s.listId,
    candidate,
    note: '一緒に行きたい',
  }).itemId!
  expect(s.list().items[0].reactions).toEqual({})
  s.run('self', { type: 'react', listId: s.listId, itemId, reaction: 'want' })
  expect(allInterested(s.list(), s.list().items[0])).toBe(false)
  s.run('haru', { type: 'react', listId: s.listId, itemId, reaction: 'interested' })
  expect(allInterested(s.list(), s.list().items[0])).toBe(true)
  s.run('haru', { type: 'react', listId: s.listId, itemId, reaction: 'pass' })
  expect(s.list().items[0].reactions.self).toBe('want')
  expect(allInterested(s.list(), s.list().items[0])).toBe(false)
  s.run('haru', { type: 'react', listId: s.listId, itemId, reaction: null })
  expect(s.list().items[0].reactions.haru).toBeUndefined()
  s.run('haru', { type: 'leave', listId: s.listId })
  expect(s.list().items[0].author).toBeNull()
  expect(s.list().items[0].note).toBe('一緒に行きたい')
  expect(() =>
    s.run('haru', { type: 'react', listId: s.listId, itemId, reaction: 'want' }),
  ).toThrow('メンバー')
})
test('members edit own items, owner deletes any and inherits editing only after author leaves', () => {
  const s = scenario()
  s.join()
  const itemId = s.run('haru', { type: 'add', listId: s.listId, candidate, note: '' }).itemId!
  expect(() => s.run('self', { type: 'edit', listId: s.listId, itemId, note: '書き換え' })).toThrow(
    '権限',
  )
  expect(() =>
    s.run('haru', { type: 'rename', listId: s.listId, name: '書き換え', color: 'blue' }),
  ).toThrow('作成者')
  expect(() => s.run('self', { type: 'leave', listId: s.listId })).toThrow('引き継ぎ')
  s.run('self', { type: 'removeMember', listId: s.listId, member: 'haru' })
  s.run('self', { type: 'edit', listId: s.listId, itemId, note: '更新' })
  s.run('self', { type: 'removeItem', listId: s.listId, itemId })
  expect(s.list().items).toEqual([])
})
test('ownership requires recipient consent and invalidates old invites; delete removes everything', () => {
  const s = scenario()
  s.join()
  s.run('self', { type: 'invite', listId: s.listId })
  expect(() => s.run('haru', { type: 'acceptTransfer', listId: s.listId })).toThrow('依頼')
  s.run('self', { type: 'offerTransfer', listId: s.listId, member: 'haru' })
  expect(s.list().owner).toBe('self')
  s.run('haru', { type: 'acceptTransfer', listId: s.listId })
  expect(s.list().owner).toBe('haru')
  expect(s.list().invites).toEqual([])
  s.run('self', { type: 'leave', listId: s.listId })
  s.run('haru', { type: 'delete', listId: s.listId })
  expect(s.state().lists).toEqual([])
})
test('duplicate URLs are idempotent, same names with different URLs remain separate, and list limits apply', () => {
  const s = scenario()
  const command = { type: 'add', listId: s.listId, candidate, note: '' } as const
  const first = s.run('self', command)
  const again = s.run('self', command)
  expect(again.itemId).toBe(first.itemId)
  expect(again.duplicate).toBe(true)
  s.run('self', { ...command, candidate: { ...candidate, url: 'https://example.com/another' } })
  expect(s.list().items).toHaveLength(2)
  s.run('self', { type: 'create', name: '2', color: 'blue' })
  s.run('self', { type: 'create', name: '3', color: 'peach' })
  expect(() => s.run('self', { type: 'create', name: '4', color: 'teal' })).toThrow('3つまで')
  for (let n = 2; n < 100; n++)
    s.run('self', { ...command, candidate: { ...candidate, url: `https://example.com/${n}` } })
  expect(() =>
    s.run('self', { ...command, candidate: { ...candidate, url: 'https://example.com/overflow' } }),
  ).toThrow('100候補')
})
test('whitelist snapshots omit private search rationale and personal state; unknown fields stop persistence', async () => {
  const web = fromWebSpot({
    id: 'private-id',
    name: '候補',
    area: '京都',
    summary: '公開の説明',
    matchReason: '秘密の希望',
    sourceUrl: 'https://example.com/place',
    mode: 'live',
    retrievedAt: new Date(now).toISOString(),
    verification: 'unconfirmed',
  })
  expect(JSON.stringify(web)).not.toContain('秘密')
  expect(web).not.toHaveProperty('matchReason')
  const catalog = fromOuting(sampleCatalog.outings[0], new Date(now))
  expect(catalog.sample).toBe(true)
  expect(catalog).not.toHaveProperty('image')
  const repo = createDemoRepository(createMemoryStore())
  const created = await repo.execute('self', { type: 'create', name: '検証', color: 'teal' }, null)
  await expect(
    repo.execute(
      'self',
      {
        type: 'add',
        listId: created.listId,
        candidate: { ...web, privateMemo: '秘密' } as typeof web,
        note: '',
      },
      created.version,
    ),
  ).rejects.toThrow('未対応')
  expect((await repo.read()).version).toBe(created.version)
})
test('repository rejects stale edits, preserves last saved version on quota failure and never overwrites corrupt/newer data', async () => {
  const store = createMemoryStore(),
    repo = createDemoRepository(store)
  const created = await repo.execute('self', { type: 'create', name: '保存', color: 'teal' }, null)
  await expect(
    repo.execute('self', { type: 'create', name: '古い画面', color: 'teal' }, null),
  ).rejects.toThrow('別の画面')
  const failure = createDemoRepository({
    ...store,
    setItem: async () => {
      throw new Error('容量不足')
    },
  })
  await expect(
    failure.execute(
      'self',
      { type: 'rename', listId: created.listId, name: '失敗', color: 'blue' },
      created.version,
    ),
  ).rejects.toThrow('容量不足')
  expect((await repo.read()).state.lists[0].name).toBe('保存')
  for (const raw of ['{broken', '{"schemaVersion":99,"revision":0,"lists":[]}']) {
    await store.setItem(SHARING_KEY, raw)
    await expect(repo.read()).rejects.toThrow()
    await expect(
      repo.execute('self', { type: 'create', name: '上書き', color: 'teal' }, raw),
    ).rejects.toThrow()
    expect(await store.getItem(SHARING_KEY)).toBe(raw)
  }
})
test('codec rejects wrong member references, unexpected personal fields, unsafe URLs and duplicate IDs', () => {
  const s = scenario()
  s.run('self', { type: 'add', listId: s.listId, candidate, note: '' })
  const mutations: ((state: SharingState) => void)[] = [
    (state) => {
      state.lists[0].items[0].reactions.haru = 'want'
    },
    (state) => {
      state.lists[0].owner = 'haru'
    },
    (state) => {
      state.lists[0].items[0].candidate.url = 'javascript:alert(1)'
    },
    (state) => {
      state.lists.push(state.lists[0])
    },
    (state) => {
      Object.assign(state.lists[0], { privateQuiz: {} })
    },
  ]
  for (const mutate of mutations) {
    const value = structuredClone(s.state())
    mutate(value)
    expect(() => decodeSharing(JSON.stringify(value))).toThrow()
  }
})
