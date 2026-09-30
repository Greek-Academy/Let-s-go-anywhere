import { chromium, webkit, devices, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Explicit, bounded public-tile verification. Never use a person's position or run in CI.
if (!process.argv.includes('--live')) throw new Error('Use --live to request public GSI tiles')
const base = new URL(process.env.MAP_PILOT_URL || 'http://127.0.0.1:4197/')
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Local preview required')
const output = resolve('docs/screenshots/issue-79')
await mkdir(output, { recursive: true })
const results = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch()
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    geolocation: { latitude: 35.690921, longitude: 139.700258, accuracy: 30 },
    permissions: ['geolocation'],
  })
  const page = await context.newPage()
  // This Playwright WebKit build returns a simulated timestamp in microseconds.
  // Correct only the test driver's value; production validation stays strict.
  if (name === 'webkit')
    await page.addInitScript(() => {
      const get = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation)
      navigator.geolocation.getCurrentPosition = (success, error, options) =>
        get(
          (position) => {
            success({
              coords: position.coords,
              timestamp: position.timestamp > 1e14 ? position.timestamp / 1000 : position.timestamp,
            })
          },
          error,
          options,
        )
    })
  let requests = 0,
    bytes = 0
  const errors = [],
    pending = []
  page.on('pageerror', (e) => errors.push(e.message))
  await context.route(/^https:\/\//, (route) => {
    if (
      !/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/experimental_bvmap\/\d+\/\d+\/\d+\.pbf$/.test(
        route.request().url(),
      ) ||
      ++requests > 30
    )
      return route.abort()
    return route.continue()
  })
  page.on('response', (r) => {
    if (r.url().endsWith('.pbf'))
      pending.push(
        (async () => {
          try {
            bytes += (await r.body()).length
          } catch {
            /* canceled viewport request */
          }
        })(),
      )
  })
  const ready = async () => {
    await page.locator('[data-map-ready="true"]').first().waitFor()
    await page.locator('.real-map-status').waitFor({ state: 'hidden', timeout: 20000 })
  }
  try {
    await page.goto(base.href + '#/welcome')
    await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
    await page
      .getByRole('navigation')
      .getByRole('button', { name: '車を探す', exact: true })
      .click()
    await ready()
    await Promise.allSettled(pending)
    const beforeBytes = bytes,
      beforeRequests = requests
    await page.getByRole('button', { name: '現在地から探す', exact: true }).click()
    const start = performance.now()
    await page.getByRole('button', { name: '現在地を取得', exact: true }).click()
    await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
    await ready()
    const milliseconds = Math.round(performance.now() - start)
    await Promise.allSettled(pending)
    const locationBytes = bytes - beforeBytes,
      locationRequests = requests - beforeRequests
    await page.waitForTimeout(250)
    await page.screenshot({ path: resolve(output, `${name}-shinjuku-station-map.png`) })
    const count = await page.locator('.real-map-pin').count()
    await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
    await expect(page.locator('.real-station-card')).toHaveCount(count)
    await page.screenshot({ path: resolve(output, `${name}-shinjuku-station-list.png`) })
    await page.getByRole('button', { name: '地図で見る', exact: true }).click()
    await ready()
    await page.setViewportSize({ width: 320, height: 568 })
    await expect(page.getByRole('button', { name: '現在地から探す', exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: '一覧で見る', exact: true })).toBeInViewport()
    await expect(page.locator('.real-map-credits')).toBeInViewport()
    await page.screenshot({ path: resolve(output, `${name}-small-screen.png`) })
    const persisted = await page.evaluate(
      () => JSON.parse(localStorage.getItem('driveplus.mock.v1')).realMap,
    )
    expect(persisted.center.lat).toBeCloseTo(35, 3)
    expect(errors).toEqual([])
    results.push({
      browser: name,
      count,
      locationRequests,
      locationBytes,
      milliseconds,
      requests,
      responseBytes: bytes,
      errors,
    })
  } catch (e) {
    await page.screenshot({ path: resolve(output, `${name}-failure.png`) })
    results.push({ browser: name, error: e.message, errors, requests })
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}
await writeFile(
  resolve(output, 'measurements.json'),
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      note: 'Fixed public Shinjuku Station position; simulated permission/position, real GSI tiles. PBF response payload is not an invoice or exact transfer size. Counts include unverified OSM listings.',
      results,
    },
    null,
    2,
  ) + '\n',
)
console.log(JSON.stringify(results, null, 2))
