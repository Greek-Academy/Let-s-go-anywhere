import { expect, test } from '@playwright/test'
import { evaluateOuting } from '../../../src/domain/outingLifecycle'
import { createAppPreview } from '../previewProjection'
import { blankDraft } from '../model'
import { sampleDraft } from '../sample'

const at = '2026-09-23',
  now = new Date(at + 'T12:00:00+09:00')

test('projection keeps display fields and opaque references, excluding all private notes and URLs', () => {
  const draft = sampleDraft(at)
  draft.internalNote = 'PRIVATE-NOTE'
  draft.sources[0].id = 'private-source'
  draft.sources[0].label = 'PRIVATE-LABEL'
  for (const field of ['title', 'location', 'schedule'] as const)
    draft.checks[field].sourceIds = ['private-source']
  const before = JSON.stringify(draft)
  const snapshot = createAppPreview(draft, null, at)
  expect(snapshot.outing.id).toBe('review-sample-autumn')
  expect(snapshot.outing.title).toBe(draft.title)
  expect(evaluateOuting(snapshot.outing, now).recommendable).toBe(true)
  for (const value of ['PRIVATE', 'private-source', 'https:', 'permissionRef', 'internalNote'])
    expect(JSON.stringify(snapshot)).not.toContain(value)
  expect(JSON.stringify(draft)).toBe(before)
})

test('invalid identities reject the preview; missing, stale, SNS-only and ended candidates do not gain recommendation', () => {
  expect(() => createAppPreview(blankDraft(), null, at)).toThrow('管理IDと名称')
  expect(() => createAppPreview({ ...sampleDraft(at), id: '../../private' }, null, at)).toThrow()
  const incomplete = sampleDraft(at)
  incomplete.summary = ''
  const stale = sampleDraft(at)
  stale.checks.title.reviewBy = '2026-09-22'
  const sns = sampleDraft(at)
  sns.sources[1].available = true
  for (const f of ['title', 'location', 'schedule'] as const) sns.checks[f].sourceIds = ['x-sample']
  const ended = sampleDraft(at)
  ended.startsAt = '2026-09-20T10:00:00+09:00'
  ended.endsAt = '2026-09-20T18:00:00+09:00'
  for (const draft of [incomplete, stale, sns, ended])
    expect(evaluateOuting(createAppPreview(draft, null, at).outing, now).recommendable).toBe(false)
  expect(evaluateOuting(createAppPreview(ended, null, at).outing, now).state).toBe('ended')
  const spot = sampleDraft(at)
  Object.assign(spot, { kind: 'spot', eventYear: null, startsAt: '', endsAt: '' })
  expect(evaluateOuting(createAppPreview(spot, null, at).outing, now).state).toBe('permanent')
})

test('only current local photos project alt and credit; permission records never reach the catalog', () => {
  const draft = sampleDraft(at)
  draft.photo = {
    enabled: true,
    assetName: 'sample.jpg',
    state: 'confirmed',
    owner: 'PRIVATE-OWNER',
    permissionRef: 'PRIVATE-PERMISSION',
    scope: 'PRIVATE-SCOPE',
    credit: '写真クレジット',
    alt: '写真の説明',
    checkedAt: at,
    reviewBy: at,
  }
  const photo = { name: 'sample.jpg', url: 'blob:http://localhost/example' }
  const snapshot = createAppPreview(draft, photo, at)
  expect(snapshot.outing).toMatchObject({
    image: photo.url,
    imageAlt: '写真の説明',
    imageCredit: '写真クレジット',
  })
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE')
  for (const candidate of [
    null,
    { ...photo, name: 'another.jpg' },
    { ...photo, url: 'https://example.com/private.jpg' },
  ])
    expect(createAppPreview(draft, candidate, at).outing.image).toBe('')
  draft.photo.reviewBy = '2026-09-22'
  expect(createAppPreview(draft, photo, at).outing.image).toBe('')
  draft.photo.reviewBy = at
  draft.photo.state = 'withdrawn'
  expect(createAppPreview(draft, photo, at).outing.image).toBe('')
})
