import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePublicSearch } from '../build/publicSearch.ts'

const release = JSON.parse(readFileSync('firebase-dist/release.json', 'utf8'))
const origin = resolvePublicSearch('firebase', {
  DRIVEPLUS_SEARCH_ORIGIN: release.publicSearchOrigin,
})
if (
  !origin ||
  release.cloudPilot !== 'firebase' ||
  release.dirty !== false ||
  !/^[a-f0-9]{40}$/.test(release.commit ?? '')
)
  throw new Error(
    'Hosting requires a clean committed Firebase build with the approved search origin.',
  )
const privateNames = ['.env', '.local-research', 'secrets.json', 'participation-code.txt']
function scan(path) {
  for (const item of readdirSync(path, { withFileTypes: true })) {
    if (item.isSymbolicLink() || privateNames.some((name) => item.name.startsWith(name)))
      throw new Error('Unexpected private file in Hosting artifact.')
    const full = resolve(path, item.name)
    if (item.isDirectory()) scan(full)
    else if (/\.(js|json|html|css)$/.test(item.name)) {
      const text = readFileSync(full, 'utf8')
      if (/sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}/.test(text))
        throw new Error('A secret-like value was found in the Hosting artifact.')
    }
  }
}
scan('firebase-dist')
const { hosting } = JSON.parse(readFileSync('firebase.json', 'utf8'))
hosting.public = resolve('firebase-dist')
for (const rule of hosting.headers)
  for (const header of rule.headers)
    if (header.key === 'Content-Security-Policy')
      header.value = header.value.replace('connect-src ', `connect-src ${origin} `)
mkdirSync('.firebase', { recursive: true })
writeFileSync('.firebase/hosting-dogfood.json', JSON.stringify({ hosting }, null, 2) + '\n')
console.log(
  'Prepared .firebase/hosting-dogfood.json for Hosting only. No Firestore rules or data are changed.',
)
