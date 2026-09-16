import { readFile, readdir, lstat } from 'node:fs/promises'
import { resolve, relative, extname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function verifyPreview(directory, { forUpload = false } = {}) {
  const root = resolve(directory)
  const files = []
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      const name = relative(root, path).replaceAll('\\', '/')
      if (
        entry.isSymbolicLink() ||
        entry.name.startsWith('.') ||
        /^driveplus-local-backup.*\.json$/i.test(entry.name) ||
        /^(backup\.json|release-backups|release-restores)$/i.test(entry.name) ||
        /^(functions|_worker\.js|node_modules|src)$/.test(entry.name)
      ) {
        throw new Error(`Unexpected publish file: ${name}`)
      }
      if (entry.isDirectory()) await walk(path)
      else {
        if (
          !['_headers', 'robots.txt'].includes(basename(path)) &&
          ![
            '.html',
            '.js',
            '.css',
            '.json',
            '.svg',
            '.jpg',
            '.png',
            '.webp',
            '.ico',
            '.woff2',
          ].includes(extname(path))
        ) {
          throw new Error(`Unsupported publish file: ${name}`)
        }
        if ((await lstat(path)).size > 25 * 1024 * 1024)
          throw new Error(`Publish file is too large: ${name}`)
        files.push(name)
      }
    }
  }
  await walk(root)
  if (files.length > 1000) throw new Error('Preview exceeds the dashboard upload file limit')
  for (const name of ['index.html', 'release.json', '_headers', 'robots.txt']) {
    if (!files.includes(name)) throw new Error(`Missing publish file: ${name}`)
  }
  const release = JSON.parse(await readFile(resolve(root, 'release.json'), 'utf8'))
  if (
    release.schemaVersion !== 1 ||
    release.channel !== 'preview' ||
    release.contentSource !== 'sample'
  ) {
    throw new Error('Not a supported sample preview release')
  }
  if (typeof release.dirty !== 'boolean' || !Number.isFinite(Date.parse(release.builtAt)))
    throw new Error('Invalid release metadata')
  if (forUpload && (release.dirty || !/^[a-f0-9]{40}$/.test(release.commit ?? ''))) {
    throw new Error('Upload artifacts must be built from a clean, committed checkout')
  }
  const html = await readFile(resolve(root, 'index.html'), 'utf8')
  if (
    !/name="robots" content="noindex, nofollow, noarchive"/.test(html) ||
    !/name="driveplus-channel" content="preview"/.test(html) ||
    !/name="driveplus-content" content="sample"/.test(html) ||
    !html.includes('Content-Security-Policy') ||
    html.includes('/src/main.tsx') ||
    html.includes('/@vite/client')
  ) {
    throw new Error('Expected built preview HTML with sample metadata and indexing controls')
  }
  for (const match of html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)) {
    if (!files.includes(decodeURIComponent(match[1].slice(1))))
      throw new Error(`Missing entry asset: ${match[1]}`)
  }
  const headers = await readFile(resolve(root, '_headers'), 'utf8')
  const robots = await readFile(resolve(root, 'robots.txt'), 'utf8')
  if (
    !headers.includes('X-Robots-Tag: noindex') ||
    !headers.includes("connect-src 'none'") ||
    !/Disallow: \/\s*$/.test(robots)
  ) {
    throw new Error('Missing preview delivery controls')
  }
  return { release, fileCount: files.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await verifyPreview('dist', { forUpload: process.argv.includes('--for-upload') })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
