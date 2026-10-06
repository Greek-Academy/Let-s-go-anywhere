import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveFirebasePilot } from '../build/firebasePilot.ts'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import { resolvePublicSearch } from '../build/publicSearch.ts'

// Local preparation only. Never print keys or change account plans / existing usage ledgers.
const source = resolve(process.argv[2] ?? '.')
const readEnv = (name) => parseEnv(readFileSync(resolve(source, name), 'utf8'))
if (source === resolve('.'))
  throw new Error('Use a separate worktree to preserve the source environment files.')
const setting = readEnv('.env.dogfood.local')
const firebase = readEnv('.env.firebase.local')
resolveFirebasePilot('firebase', firebase)
const research = readEnv('.env.research.local')
const origin = resolvePublicSearch('firebase', setting)
if (
  !origin ||
  !/^[a-f0-9]{32}$/.test(setting.CLOUDFLARE_ACCOUNT_ID ?? '') ||
  !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(setting.DRIVEPLUS_D1_DATABASE_ID ?? '') ||
  setting.DRIVEPLUS_D1_DATABASE_ID === '00000000-0000-0000-0000-000000000000' ||
  firebase.DRIVEPLUS_FIREBASE_PROJECT_ID !== 'driveplus-fbc33' ||
  !/^AIza[\w-]{35}$/.test(firebase.DRIVEPLUS_FIREBASE_API_KEY ?? '') ||
  !research.OPENAI_API_KEY ||
  !research.ANTHROPIC_API_KEY
)
  throw new Error('Missing or invalid deployment settings. No keys have been uploaded.')

const privateDir = resolve('.local-research/public-search')
mkdirSync(privateDir, { recursive: true, mode: 0o700 })
const codePath = resolve(privateDir, 'participation-code.txt')
if (!existsSync(codePath))
  writeFileSync(codePath, randomBytes(32).toString('base64url') + '\n', { mode: 0o600, flag: 'wx' })
const code = readFileSync(codePath, 'utf8').trim()
if (!/^[A-Za-z0-9_-]{43}$/.test(code))
  throw new Error('Invalid saved participation code. Do not silently replace it.')
writeFileSync(
  resolve(privateDir, 'secrets.json'),
  JSON.stringify({
    OPENAI_API_KEY: research.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: research.ANTHROPIC_API_KEY,
    FIREBASE_API_KEY: firebase.DRIVEPLUS_FIREBASE_API_KEY,
    TESTER_CODE: code,
  }),
  { mode: 0o600 },
)

const worker = JSON.parse(readFileSync('tools/public-search/wrangler.json', 'utf8'))
worker.account_id = setting.CLOUDFLARE_ACCOUNT_ID
worker.d1_databases[0].database_id = setting.DRIVEPLUS_D1_DATABASE_ID
worker.vars.SEARCH_ENABLED = 'false'
writeFileSync('tools/public-search/wrangler.local.json', JSON.stringify(worker, null, 2) + '\n')
// Firebase Web settings are public client configuration; never copy research keys into Vite envs.
writeFileSync(
  '.env.firebase.local',
  Object.entries({
    DRIVEPLUS_FIREBASE_PROJECT_ID: firebase.DRIVEPLUS_FIREBASE_PROJECT_ID,
    DRIVEPLUS_FIREBASE_API_KEY: firebase.DRIVEPLUS_FIREBASE_API_KEY,
    DRIVEPLUS_FIREBASE_APP_ID: firebase.DRIVEPLUS_FIREBASE_APP_ID,
    DRIVEPLUS_SEARCH_ORIGIN: origin,
  })
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n',
  { mode: 0o600 },
)
console.log(
  'Prepared ignored local config and secrets. Search remains disabled. No network calls made.',
)
console.log(
  'Participation code is in .local-research/public-search/participation-code.txt; share only with testers.',
)
