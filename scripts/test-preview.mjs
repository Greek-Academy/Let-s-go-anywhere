import { spawnSync } from 'node:child_process'
import { verifyPreview } from './verify-preview.mjs'

await verifyPreview('dist')
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_SERVER: 'preview' },
  },
)
process.exitCode = result.status ?? 1
