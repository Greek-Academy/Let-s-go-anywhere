import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyPreview } from './verify-preview.mjs'

const MAX_TOTAL_BYTES = 128 * 1024 * 1024
const MAX_MANIFEST_BYTES = 1024 * 1024
const fail = (message) => {
  throw new Error(message)
}
const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',')
const safePath = (path) =>
  typeof path === 'string' &&
  path.length <= 1024 &&
  !/[\\:\x00-\x1f\x7f]/.test(path) &&
  path.split('/').every((part) => part && !part.startsWith('.'))

async function directory(path) {
  if (!(await lstat(path)).isDirectory()) fail('Expected a directory, not a link or file')
  return realpath(path)
}

async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function inventory(root) {
  const files = []
  let total = 0
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      const name = relative(root, path).split(sep).join('/')
      if (!safePath(name)) fail('Unsupported release file path')
      if (entry.isDirectory()) await walk(path)
      else {
        const info = await lstat(path)
        if (!info.isFile()) fail('Release files must be regular files; links are not supported')
        total += info.size
        if (info.size > 25 * 1024 * 1024 || total > MAX_TOTAL_BYTES || files.length >= 1000)
          fail('Release backup exceeds its size or file-count limit')
        files.push({ path: name, bytes: info.size, sha256: await digest(path) })
      }
    }
  }
  await walk(root)
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

async function inspectRelease(path) {
  const root = await directory(path)
  const files = await inventory(root)
  // Includes the existing sample-only, clean-checkout and private-file checks.
  const result = await verifyPreview(root, { forUpload: true })
  return { root, files, ...result }
}

async function newDestination(path, source) {
  const requested = resolve(path)
  // Require an existing parent; resolve aliases before checking overlap.
  const target = join(await realpath(dirname(requested)), requested.split(sep).at(-1))
  const inside = (a, b) => a === b || a.startsWith(b + sep)
  if (inside(target, source) || inside(source, target)) fail('Source and destination overlap')
  // Non-recursive mkdir fails for every existing target, including empty folders and links.
  await mkdir(target)
  return target
}

async function copyInventory(source, target, files) {
  for (const file of files) {
    const destination = join(target, file.path)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(join(source, file.path), destination, constants.COPYFILE_EXCL)
  }
}

function matchFiles(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail('Backup file list, size or SHA-256 does not match; nothing may be restored')
}

/** Read-only verification. No paths from an untrusted manifest are opened or copied. */
export async function verifyBackup(path) {
  const root = await directory(path)
  const entries = (await readdir(root)).sort()
  if (entries.join(',') !== 'backup.json,payload') fail('Unexpected backup directory contents')
  const manifestPath = join(root, 'backup.json')
  const info = await lstat(manifestPath)
  if (!info.isFile() || info.size > MAX_MANIFEST_BYTES) fail('Invalid backup manifest file')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (
    !exactKeys(manifest, ['schemaVersion', 'createdAt', 'files']) ||
    manifest.schemaVersion !== 1 ||
    typeof manifest.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.length > 1000 ||
    manifest.files.some(
      (file) =>
        !exactKeys(file, ['path', 'bytes', 'sha256']) ||
        !safePath(file.path) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0 ||
        file.bytes > 25 * 1024 * 1024 ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(file.sha256),
    )
  )
    fail('Unsupported or invalid backup manifest')
  const release = await inspectRelease(join(root, 'payload'))
  const expected = manifest.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 }))
  matchFiles(release.files, expected)
  return { ...release, backupRoot: root, createdAt: manifest.createdAt }
}

export async function createBackup(source, destination) {
  const original = await inspectRelease(source)
  const target = await newDestination(destination, original.root)
  try {
    const payload = join(target, 'payload')
    await mkdir(payload)
    await copyInventory(original.root, payload, original.files)
    // Detect changes during the copy before committing the manifest.
    const copied = await inspectRelease(payload)
    matchFiles(copied.files, original.files)
    await writeFile(
      join(target, 'backup.json'),
      JSON.stringify(
        { schemaVersion: 1, createdAt: new Date().toISOString(), files: copied.files },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    )
    return await verifyBackup(target)
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
}

/** Restore only into a new directory; never replace a serving directory automatically. */
export async function restoreBackup(source, destination) {
  const original = await verifyBackup(source)
  const target = await newDestination(destination, original.backupRoot)
  try {
    await copyInventory(original.root, target, original.files)
    const restored = await inspectRelease(target)
    matchFiles(restored.files, original.files)
    return restored
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, source, destination, ...extra] = process.argv.slice(2)
    if (
      !source ||
      extra.length ||
      !['create', 'verify', 'restore'].includes(command) ||
      (command === 'verify' ? !!destination : !destination)
    )
      fail(
        'Usage: npm run release:backup -- create <dist> <new-backup> | verify <backup> | restore <backup> <new-output>',
      )
    const result =
      command === 'create'
        ? await createBackup(source, destination)
        : command === 'restore'
          ? await restoreBackup(source, destination)
          : await verifyBackup(source)
    console.log(
      JSON.stringify(
        {
          operation: command,
          directory: result.backupRoot ?? result.root,
          release: result.release,
          fileCount: result.fileCount,
          totalBytes: result.files.reduce((sum, file) => sum + file.bytes, 0),
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(`Release backup stopped: ${error.message}`)
    process.exitCode = 1
  }
}
