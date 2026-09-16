import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePreviewConfig } from '../build/preview'

// These checks run against the built bundle in test:preview / CI, and never reuse a dev server.
test('built preview identifies sample content and restores saved data after a page reload', async ({
  page,
  request,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_SERVER !== 'preview',
    'Requires npm run build and npm run test:preview',
  )
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  const response = await request.get('/release.json')
  expect(response.ok()).toBe(true)
  expect(await response.json()).toMatchObject({
    schemaVersion: 1,
    channel: 'preview',
    contentSource: 'sample',
  })
  const external: string[] = []
  const errors: string[] = []
  const origin = new URL(response.url()).origin
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== origin) external.push(req.url())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow, noarchive',
  )
  await expect(page.locator('meta[name="driveplus-content"]')).toHaveAttribute('content', 'sample')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /connect-src 'none'/,
  )
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.getByRole('button', { name: '湖畔のオータム花火を保存', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await expect(
    page.getByRole('button', { name: /開催予定（サンプル） 湖畔のオータム花火/ }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('driveplus.mock.v1') || '{}').savedEvents,
    ),
  ).toContain('fireworks')
  expect(external).toEqual([])
  expect(errors).toEqual([])
  await test
    .info()
    .attach('静的配信版の保存一覧', { body: await page.screenshot(), contentType: 'image/png' })
})

test('unsupported release channels and sources stop the actual Vite build before producing files', () => {
  test.setTimeout(45_000)
  expect(resolvePreviewConfig({})).toEqual({ channel: 'preview', contentSource: 'sample' })
  for (const env of [
    { DRIVEPLUS_RELEASE_CHANNEL: 'production' },
    { DRIVEPLUS_CONTENT_SOURCE: 'approved' },
    { DRIVEPLUS_CONTENT_SOURCE: '' },
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'driveplus-invalid-build-'))
    try {
      const output = join(dir, 'output')
      const result = spawnSync(
        process.execPath,
        ['node_modules/vite/bin/vite.js', 'build', '--outDir', output],
        {
          env: { ...process.env, ...env },
          encoding: 'utf8',
          timeout: 20_000,
        },
      )
      expect(result.status).toBe(1)
      expect(result.stdout + result.stderr).toMatch(/Only preview|Only sample/)
      expect(existsSync(output)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('upload verification rejects modified checkouts and accidentally bundled private or dynamic files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'driveplus-publish-files-'))
  // Import the real verification command in a Node process; no synthetic duplicate checker.
  const verify = () =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { verifyPreview } from './scripts/verify-preview.mjs'; await verifyPreview(process.argv[1], {forUpload:true})",
        dir,
      ],
      { encoding: 'utf8', timeout: 10_000 },
    )
  try {
    const metadata = {
      schemaVersion: 1,
      channel: 'preview',
      contentSource: 'sample',
      commit: 'a'.repeat(40),
      dirty: true,
      builtAt: new Date().toISOString(),
    }
    writeFileSync(join(dir, 'release.json'), JSON.stringify(metadata))
    writeFileSync(
      join(dir, 'index.html'),
      '<meta name="robots" content="noindex, nofollow, noarchive"><meta name="driveplus-channel" content="preview"><meta name="driveplus-content" content="sample"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
    )
    writeFileSync(
      join(dir, '_headers'),
      "/*\n  X-Robots-Tag: noindex\n  Content-Security-Policy: connect-src 'none'\n",
    )
    writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
    expect(verify().stderr).toContain('clean, committed checkout')
    writeFileSync(join(dir, 'release.json'), JSON.stringify({ ...metadata, dirty: false }))
    expect(verify().status).toBe(0)
    for (const name of ['.env', '_worker.js', 'index.js.map']) {
      writeFileSync(join(dir, name), 'should not ship')
      const result = verify()
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/Unexpected publish file|Unsupported publish file/)
      rmSync(join(dir, name))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
