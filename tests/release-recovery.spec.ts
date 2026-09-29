import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { showAllRegions } from './helpers/discovery'

test('a verified release restores the same origin after a failed deployment and keeps saved choices', async ({
  page,
}) => {
  test.skip(process.env.PLAYWRIGHT_SERVER !== 'preview', 'Requires a built preview')
  const source = resolve('dist')
  const release = JSON.parse(await readFile(join(source, 'release.json'), 'utf8'))
  if (process.env.CI) expect(release.dirty, 'CI must run the recovery drill').toBe(false)
  test.skip(release.dirty, 'The recovery drill requires a clean committed build, like CI')
  const root = await mkdtemp(join(tmpdir(), 'driveplus-rollback-browser-'))
  const backup = join(root, 'backup')
  const restored = join(root, 'restored')
  let serving: string | null = source
  // Isolated loopback server: switching its folder simulates replacement at one stable origin.
  // This does not emulate a hosting provider, CDN cache, HTTP security headers or DB rollback.
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!serving) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><meta charset="utf-8"><h1>復旧テスト用：配信失敗</h1>')
      return
    }
    try {
      const name = decodeURIComponent(new URL(req.url!, 'http://localhost').pathname)
      const path = resolve(serving, name === '/' ? 'index.html' : '.' + name)
      if (!path.startsWith(serving + sep)) throw new Error('Outside release')
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
      }
      const body = await readFile(path)
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end()
    }
  })
  const cli = (...args: string[]) => {
    const result = spawnSync(process.execPath, ['scripts/release-backup.mjs', ...args], {
      encoding: 'utf8',
      timeout: 10_000,
    })
    expect(result.status, result.stderr).toBe(0)
    return JSON.parse(result.stdout)
  }
  try {
    const created = cli('create', source, backup)
    expect(created.release).toEqual(release)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No recovery test server')
    const origin = `http://127.0.0.1:${address.port}`
    const errors: string[] = []
    const external: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== origin) external.push(request.url())
    })
    await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
    await page.goto(origin + '/#/welcome')
    await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
    // The saved sample is in Yamanashi; the initial discovery scope is Tokyo.
    await showAllRegions(page)
    await page.getByRole('button', { name: '湖畔のオータム花火を保存', exact: true }).click()
    await page
      .getByRole('navigation')
      .getByRole('button', { name: '行きたい', exact: true })
      .click()
    const saved = await page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))
    expect(JSON.parse(saved!).savedEvents).toContain('fireworks')
    serving = null
    const failed = await page.reload()
    expect(failed?.status()).toBe(503)
    await expect(page.getByRole('heading', { name: '復旧テスト用：配信失敗' })).toBeVisible()
    await test.info().attach('配信失敗を模擬した画面', {
      body: await page.screenshot({ animations: 'disabled', scale: 'css' }),
      contentType: 'image/png',
    })
    const result = cli('restore', backup, restored)
    expect(result.release).toEqual(release)
    expect(result.fileCount).toBe(created.fileCount)
    serving = restored
    await page.reload()
    await expect(
      page.getByRole('button', { name: /開催予定（サンプル） 湖畔のオータム花火/ }),
    ).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))).toBe(saved)
    expect(await (await page.request.get(origin + '/release.json')).json()).toEqual(release)
    await test.info().attach('復元後の保存一覧', {
      body: await page.screenshot({ animations: 'disabled', scale: 'css' }),
      contentType: 'image/png',
    })
    for (const name of ['見つける', '行きたい', '車を探す', '学ぶ', '講習']) {
      await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
      await expect(page.locator('.app-main')).toBeVisible()
      await expect(
        page.getByRole('navigation').getByRole('button', { name, exact: true }),
      ).toHaveAttribute('aria-current', 'page')
    }
    await page.goto(origin + '/#/events/fireworks')
    await expect(
      page.getByRole('heading', { name: '湖畔のオータム花火', exact: true }),
    ).toBeVisible()
    await page.locator('.app-main img').first().scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        page
          .locator('.app-main img')
          .first()
          .evaluate(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true)
    expect(external).toEqual([])
    expect(errors).toEqual([])
  } finally {
    // A timed-out test can already have closed the page. Still release the server and files.
    await page.goto('about:blank').catch(() => undefined)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
