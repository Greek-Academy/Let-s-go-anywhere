import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, truncate } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createBackup, restoreBackup, verifyBackup } from './release-backup.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'driveplus-backup-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = join(root, 'dist')
  const backup = join(root, 'backup')
  const restored = join(root, 'restored')
  await mkdir(join(source, 'assets'), { recursive: true })
  await writeFile(
    join(source, 'index.html'),
    '<meta name="robots" content="noindex, nofollow, noarchive"><meta name="driveplus-channel" content="preview"><meta name="driveplus-content" content="sample"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"><script src="/assets/app.js"></script>',
  )
  await writeFile(join(source, 'assets/app.js'), '/* isolated test fixture */')
  await writeFile(
    join(source, 'release.json'),
    JSON.stringify({
      schemaVersion: 1,
      channel: 'preview',
      contentSource: 'sample',
      dirty: false,
      commit: 'a'.repeat(40),
      builtAt: '2026-09-16T15:00:00Z',
    }),
  )
  await writeFile(
    join(source, '_headers'),
    "/*\n  X-Robots-Tag: noindex\n  Content-Security-Policy: connect-src 'none'\n",
  )
  await writeFile(join(source, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
  return { root, source, backup, restored }
}

test('a release round trip preserves exact bytes and metadata independently of a later build', async (t) => {
  const { source, backup, restored } = await fixture(t)
  const before = await createBackup(source, backup)
  await writeFile(join(source, 'assets/app.js'), '/* different release */')
  const result = await restoreBackup(backup, restored)
  assert.deepEqual(result.files, before.files)
  assert.deepEqual(result.release, before.release)
  assert.equal(
    await readFile(join(restored, 'assets/app.js'), 'utf8'),
    '/* isolated test fixture */',
  )
  assert.equal(await readFile(join(source, 'assets/app.js'), 'utf8'), '/* different release */')
  assert.equal(existsSync(join(restored, 'backup.json')), false)
})

test('changed bytes, missing files and extra files each block restore before creating output', async (t) => {
  const { source, backup, restored } = await fixture(t)
  await createBackup(source, backup)
  const script = join(backup, 'payload/assets/app.js')
  const original = await readFile(script)
  await writeFile(script, Buffer.alloc(original.length, 32))
  await assert.rejects(restoreBackup(backup, restored), /SHA-256/)
  assert.equal(existsSync(restored), false)
  await rm(script)
  await assert.rejects(restoreBackup(backup, restored), /Missing entry asset/)
  await writeFile(script, original)
  await writeFile(join(backup, 'payload/extra.json'), '{}')
  await assert.rejects(restoreBackup(backup, restored), /SHA-256/)
  assert.equal(existsSync(restored), false)
  await rm(join(backup, 'payload/extra.json'))
  await verifyBackup(backup)
})

test('malformed manifests, duplicate paths and traversal paths are rejected without opening them', async (t) => {
  const { source, backup, restored } = await fixture(t)
  await createBackup(source, backup)
  const path = join(backup, 'backup.json')
  const original = JSON.parse(await readFile(path, 'utf8'))
  for (const value of [
    '{broken',
    JSON.stringify({ ...original, schemaVersion: 2 }),
    JSON.stringify({ ...original, files: [] }),
    JSON.stringify({ ...original, files: [...original.files, original.files[0]] }),
    JSON.stringify({ ...original, files: [{ ...original.files[0], path: '../outside.json' }] }),
    JSON.stringify({ ...original, files: [{ ...original.files[0], path: '/outside.json' }] }),
    JSON.stringify({ ...original, files: [{ ...original.files[0], path: 'C:\\outside.json' }] }),
    JSON.stringify({ ...original, files: [{ ...original.files[0], bytes: -1 }] }),
    JSON.stringify({ ...original, files: [{ ...original.files[0], sha256: null }] }),
    JSON.stringify({ ...original, extra: 'unsupported' }),
  ]) {
    await writeFile(path, value)
    await assert.rejects(restoreBackup(backup, restored))
    assert.equal(existsSync(restored), false)
  }
})

test('symlink roots, manifests and payload files are rejected', async (t) => {
  const { root, source, backup, restored } = await fixture(t)
  await symlink(source, join(root, 'source-link'))
  await assert.rejects(createBackup(join(root, 'source-link'), backup), /not a link/)
  await createBackup(source, backup)
  const manifest = await readFile(join(backup, 'backup.json'))
  await writeFile(join(root, 'outside.json'), manifest)
  await rm(join(backup, 'backup.json'))
  await symlink(join(root, 'outside.json'), join(backup, 'backup.json'))
  await assert.rejects(restoreBackup(backup, restored), /manifest file/)
  await rm(join(backup, 'backup.json'))
  await writeFile(join(backup, 'backup.json'), manifest)
  await rm(join(backup, 'payload/assets/app.js'))
  await symlink(join(source, 'assets/app.js'), join(backup, 'payload/assets/app.js'))
  await assert.rejects(restoreBackup(backup, restored), /regular files/)
  assert.equal(existsSync(restored), false)
})

test('existing directories and files are never overwritten, including an empty target', async (t) => {
  const { source, backup, restored } = await fixture(t)
  await createBackup(source, backup)
  const before = await readFile(join(backup, 'backup.json'))
  await assert.rejects(createBackup(source, backup), /EEXIST/)
  assert.deepEqual(await readFile(join(backup, 'backup.json')), before)
  await mkdir(restored)
  await assert.rejects(restoreBackup(backup, restored), /EEXIST/)
  await writeFile(join(restored, 'sentinel.txt'), 'keep')
  await assert.rejects(restoreBackup(backup, restored), /EEXIST/)
  assert.equal(await readFile(join(restored, 'sentinel.txt'), 'utf8'), 'keep')
  await rm(restored, { recursive: true })
  await writeFile(restored, 'keep file')
  await assert.rejects(restoreBackup(backup, restored), /EEXIST/)
  assert.equal(await readFile(restored, 'utf8'), 'keep file')
})

test('overlapping source/output paths are blocked even through parent directory aliases', async (t) => {
  const { root, source, backup } = await fixture(t)
  await assert.rejects(createBackup(source, join(source, 'nested')), /overlap/)
  await symlink(source, join(root, 'alias'))
  await assert.rejects(createBackup(source, join(root, 'alias/nested')), /overlap/)
  assert.equal(existsSync(join(source, 'nested')), false)
  await createBackup(source, backup)
  await assert.rejects(restoreBackup(backup, join(backup, 'restored')), /overlap/)
})

test('dirty releases, private files and accidentally nested backup metadata cannot be backed up', async (t) => {
  const { source, backup } = await fixture(t)
  const path = join(source, 'release.json')
  const release = JSON.parse(await readFile(path, 'utf8'))
  await writeFile(path, JSON.stringify({ ...release, dirty: true }))
  await assert.rejects(createBackup(source, backup), /clean, committed/)
  await writeFile(path, JSON.stringify(release))
  for (const file of ['.env', 'driveplus-local-backup.json', 'backup.json']) {
    await writeFile(join(source, file), '{}')
    await assert.rejects(
      createBackup(source, backup),
      /Unsupported release file path|Unexpected publish file/,
    )
    assert.equal(existsSync(backup), false)
    await rm(join(source, file))
  }
  await createBackup(source, backup)
  await writeFile(join(backup, 'extra.json'), '{}')
  await assert.rejects(verifyBackup(backup), /directory contents/)
})

test('manifest and file size limits fail before restore or hashing oversized payloads', async (t) => {
  const { source, backup, restored } = await fixture(t)
  await createBackup(source, backup)
  await writeFile(join(backup, 'backup.json'), ' '.repeat(1024 * 1024 + 1))
  await assert.rejects(restoreBackup(backup, restored), /manifest file/)
  assert.equal(existsSync(restored), false)
  await rm(backup, { recursive: true })
  await truncate(join(source, 'assets/app.js'), 25 * 1024 * 1024 + 1)
  await assert.rejects(createBackup(source, backup), /size or file-count limit/)
  assert.equal(existsSync(backup), false)
})

test('the command reports release identity and fails with a nonzero code for bad arguments', async (t) => {
  const { source, backup, restored } = await fixture(t)
  const cli = (...args) =>
    spawnSync(process.execPath, ['scripts/release-backup.mjs', ...args], {
      encoding: 'utf8',
      timeout: 10_000,
    })
  for (const args of [[], ['unknown', source], ['verify', source, restored], ['create', source]]) {
    const result = cli(...args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Usage/)
  }
  const created = cli('create', source, backup)
  assert.equal(created.status, 0, created.stderr)
  assert.equal(JSON.parse(created.stdout).release.commit, 'a'.repeat(40))
  assert.equal(cli('verify', backup).status, 0)
  assert.equal(cli('restore', backup, restored).status, 0)
  assert.equal(cli('restore', backup, restored).status, 1)
})
