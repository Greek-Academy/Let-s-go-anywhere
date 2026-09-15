import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  blankDraft,
  canPreviewPhoto,
  parseDraftJson,
  validTimestamp,
  validateDraft,
} from '../model'
import { sampleDraft } from '../sample'

const at = '2026-09-15'
const paths = (draft: ReturnType<typeof sampleDraft>) => validateDraft(draft, at).map((p) => p.path)

test('draft import accepts unfinished records and rejects unknown, malformed and oversized input', () => {
  expect(parseDraftJson(JSON.stringify(blankDraft()))).toEqual(blankDraft())
  expect(validateDraft(blankDraft(), at).length).toBeGreaterThan(0)
  const sample = sampleDraft(at)
  expect(paths(sample)).toEqual([])
  for (const value of [
    { ...sample, schemaVersion: 2 },
    { ...sample, sources: [null] },
    { ...sample, sources: [{ ...sample.sources[0], url: 8 }] },
    { ...sample, photo: { ...sample.photo, state: 'approved' } },
    {
      ...sample,
      checks: { ...sample.checks, title: { ...sample.checks.title, sourceIds: 'official-sample' } },
    },
    { ...sample, internalNote: 'a'.repeat(2001) },
    { ...sample, privateContact: 'SENSITIVE' },
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ])
    expect(() => parseDraftJson(JSON.stringify(value))).toThrow()
  expect(() => parseDraftJson('{invalid JSON}')).toThrow('JSONの書式')
  expect(() => parseDraftJson(' '.repeat(128 * 1024 + 1))).toThrow('128 KiB')
  expect(paths({ ...sample, tags: Array(9).fill('tag') })).toContain('tags')
})

test('event years, real timestamps, ordering and confirmation date boundaries stay distinct', () => {
  expect(validTimestamp('2028-02-29T23:59:59+09:00')).toBe(true)
  for (const value of [
    '2026-02-29T12:00:00+09:00',
    '2026-09-15T24:00:00+09:00',
    '2026-09-15T12:00:00',
    '2026-09-15T12:00:00+14:01',
  ])
    expect(validTimestamp(value)).toBe(false)
  const draft = sampleDraft(at)
  draft.eventYear = 2025
  expect(paths(draft)).toContain('eventYear')
  draft.eventYear = 2026
  draft.endsAt = draft.startsAt
  expect(paths(draft)).toContain('endsAt')
  draft.endsAt = '2026-10-15T02:00:00Z' // after a 10:00 JST / 01:00 UTC start
  expect(paths(draft)).toEqual([])
  const crossYear = {
    ...sampleDraft(at),
    startsAt: '2026-12-31T16:00:00Z',
    endsAt: '2026-12-31T17:00:00Z',
    eventYear: 2027,
  }
  expect(paths(crossYear)).toEqual([])
  expect(paths({ ...crossYear, eventYear: 2026 })).toContain('eventYear')
  draft.checks.location.checkedAt = '2026-09-16'
  draft.checks.title.reviewBy = '2026-09-14'
  expect(paths(draft)).toEqual(
    expect.arrayContaining(['checks.location.checkedAt', 'checks.title.reviewBy']),
  )
  const spot = {
    ...sampleDraft(at),
    kind: 'spot' as const,
    eventYear: null,
    startsAt: '',
    endsAt: '',
    checks: { ...sampleDraft(at).checks, schedule: blankDraft().checks.schedule },
  }
  expect(paths(spot)).toEqual([])
  expect(paths({ ...spot, eventYear: 2026 })).toContain('kind')
  expect(validateDraft(spot, 'invalid').map((p) => p.path)).toEqual(['at'])
})

test('SNS sources stay separate and missing, duplicate, unavailable or spoofed evidence cannot satisfy a check', () => {
  const draft = sampleDraft(at)
  expect(draft.sources.map((s) => s.kind)).toEqual(['official', 'x', 'tiktok'])
  draft.checks.title.sourceIds = ['x-sample']
  expect(paths(draft)).toContain('checks.title.sourceIds')
  draft.sources[1].available = true
  expect(paths(draft)).toEqual([])
  draft.sources[1].url = 'https://x.com.example.com/post'
  expect(paths(draft)).toContain('sources[1].url')
  for (const url of [
    'javascript:alert(1)',
    'https://user:secret@example.com',
    'https://127.0.0.1',
    'https://example.com:8080',
    'http://example.com',
  ]) {
    const d = sampleDraft(at)
    d.sources[0].url = url
    expect(paths(d)).toContain('sources[0].url')
    expect(paths(d)).toContain('checks.title.sourceIds')
  }
  const d = sampleDraft(at)
  d.sources.push({ ...d.sources[0] })
  expect(paths(d)).toContain('sources[3].id')
  d.checks.title.sourceIds = ['unknown']
  expect(paths(d)).toContain('checks.title.sourceIds')
})

test('photo display requires its own current conditions, independent of textual evidence', () => {
  const draft = sampleDraft(at)
  expect(canPreviewPhoto(draft, at)).toBe(false)
  draft.photo = {
    enabled: true,
    assetName: 'sample.jpg',
    state: 'confirmed',
    owner: '架空の権利者',
    permissionRef: '架空の記録',
    scope: '架空の範囲',
    credit: 'サンプル',
    alt: '架空の写真',
    checkedAt: at,
    reviewBy: at,
  }
  expect(canPreviewPhoto(draft, at)).toBe(true)
  draft.checks.title.state = 'unconfirmed'
  expect(canPreviewPhoto(draft, at)).toBe(true)
  draft.photo.reviewBy = '2026-09-14'
  expect(canPreviewPhoto(draft, at)).toBe(false)
  draft.photo.reviewBy = at
  draft.photo.state = 'withdrawn'
  expect(canPreviewPhoto(draft, at)).toBe(false)
  expect(canPreviewPhoto({ ...draft, tags: Array(9).fill('tag') }, at)).toBe(false)
  draft.photo.state = 'confirmed'
  draft.photo.permissionRef = ''
  expect(canPreviewPhoto(draft, at)).toBe(false)
  draft.photo.permissionRef = 'sample'
  draft.photo.assetName = '../../private.jpg'
  expect(canPreviewPhoto(draft, at)).toBe(false)
})

test('CLI reports readiness without printing private input and review tool is absent from app distribution', () => {
  const directory = mkdtempSync(join(tmpdir(), 'driveplus-editorial-test-'))
  try {
    const path = join(directory, 'PRIVATE-FILENAME.json'),
      draft = sampleDraft()
    draft.internalNote = 'PRIVATE-CONTENT-SENTINEL'
    writeFileSync(path, JSON.stringify(draft))
    const run = () =>
      spawnSync(process.execPath, ['scripts/check-content.mjs', path], { encoding: 'utf8' })
    const ready = run()
    expect(ready.status).toBe(0)
    expect(JSON.parse(ready.stdout)).toMatchObject({
      complete: true,
      publication: 'not-implemented',
      problems: [],
    })
    expect(ready.stdout + ready.stderr).not.toContain('PRIVATE')
    draft.title = ''
    writeFileSync(path, JSON.stringify(draft))
    const incomplete = run()
    expect(incomplete.status).toBe(1)
    expect(incomplete.stdout + incomplete.stderr).not.toContain('PRIVATE')
    writeFileSync(path, '{"private":"PRIVATE-CONTENT-SENTINEL"}')
    const malformed = run()
    expect(malformed.status).toBe(2)
    expect(malformed.stdout + malformed.stderr).not.toContain('PRIVATE')
    const appFiles = readdirSync('dist/assets').filter((name) => name.endsWith('.js'))
    expect(appFiles.length).toBeGreaterThan(0)
    for (const name of appFiles) {
      const source = readFileSync(join('dist/assets', name), 'utf8')
      expect(source).not.toContain('LOCAL CONTENT REVIEW')
      expect(source).not.toContain('permissionRef')
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
