import { chromium, webkit, devices } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Explicit opt-in: only small interactive sessions, never CI or a tile crawler.
if (!process.argv.includes('--live')) throw new Error('Use --live to request public GSI tiles')
const base = new URL(process.env.MAP_PILOT_URL || 'http://127.0.0.1:4197/')
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Local preview required')
const output = resolve('docs/screenshots/issue-77')
await mkdir(output, { recursive: true })
const results = []
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch()
  const context = await browser.newContext({ ...devices['iPhone 13'] })
  const page = await context.newPage()
  let requests = 0,
    bytes = 0
  const errors = [],
    pending = [],
    responses = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.route(/^https:\/\//, (route) => {
    const url = route.request().url()
    if (
      !/^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/experimental_bvmap\/\d+\/\d+\/\d+\.pbf$/.test(
        url,
      ) ||
      ++requests > 60
    )
      return route.abort()
    return route.continue()
  })
  page.on('response', (response) => {
    if (!response.url().endsWith('.pbf')) return
    pending.push(
      (async () => {
        try {
          const size = (await response.body()).length
          bytes += size
          responses.push({ url: response.url(), status: response.status(), bytes: size })
        } catch {
          /* canceled viewport request; recorded by the app */
        }
      })(),
    )
  })
  const ready = async () => {
    await page.waitForFunction(
      () => {
        const tiles = [...document.querySelectorAll('.leaflet-tile')]
        return (
          tiles.length > 0 &&
          tiles.every((tile) => tile.getAttribute('data-map-ready') === 'true') &&
          !document.querySelector('.real-map-status')
        )
      },
      undefined,
      { timeout: 20_000 },
    )
  }
  const metrics = async () => {
    await page.getByRole('button', { name: '出典・掲載範囲' }).click()
    await page.getByText('今回の地図読み込み（検証用）', { exact: true }).click()
    const values = await page
      .locator('[data-metric]')
      .evaluateAll((els) =>
        Object.fromEntries(els.map((el) => [el.getAttribute('data-metric'), el.textContent])),
      )
    await page.getByRole('button', { name: '戻る', exact: true }).click()
    await ready()
    return values
  }
  try {
    await page.goto(base.href + '#/welcome')
    await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
    const start = performance.now()
    await page
      .getByRole('navigation')
      .getByRole('button', { name: '車を探す', exact: true })
      .click()
    await page.locator('[data-map-ready="true"]').first().waitFor()
    await page.locator('.real-map-status').waitFor({ state: 'hidden', timeout: 20_000 })
    const initialMs = Math.round(performance.now() - start)
    const initial = await metrics()
    const phases = []
    for (const [label, slug] of [
      ['京都中心部', 'kyoto'],
      ['大阪・梅田', 'umeda'],
      ['滋賀・草津', 'kusatsu'],
      ['大阪・梅田', 'umeda-revisit'],
    ]) {
      const before = requests,
        beforeBytes = bytes,
        begin = performance.now()
      await page.getByRole('button', { name: label, exact: true }).click()
      const latitude = label === '大阪・梅田' ? 34.7025 : label === '滋賀・草津' ? 35.014 : 34.9995
      await page.waitForFunction(
        (lat) =>
          Math.abs(JSON.parse(localStorage.getItem('driveplus.mock.v1')).realMap.center.lat - lat) <
          0.0003,
        latitude,
      )
      await ready()
      const milliseconds = Math.round(performance.now() - begin)
      await Promise.allSettled(pending)
      await page.waitForTimeout(250) // Finish the tile fade before the visual capture.
      await page.screenshot({ path: resolve(output, `${name}-${slug}.png`) })
      phases.push({
        area: label,
        milliseconds,
        requests: requests - before,
        bytes: bytes - beforeBytes,
        metrics: await metrics(),
      })
    }
    for (const action of ['zoom', 'pan']) {
      const before = requests,
        beforeBytes = bytes,
        begin = performance.now()
      if (action === 'zoom')
        await page.getByRole('button', { name: '地図を拡大', exact: true }).click()
      else {
        const box = await page.locator('.real-map-canvas').boundingBox()
        await page.mouse.move(box.x + 30, box.y + box.height * 0.65)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width - 30, box.y + box.height * 0.65, { steps: 10 })
        await page.mouse.up()
      }
      await page.waitForTimeout(1200) // Include the full Leaflet animation/inertia; timings include this settling window.
      await ready()
      await Promise.allSettled(pending)
      phases.push({
        action,
        milliseconds: Math.round(performance.now() - begin),
        requests: requests - before,
        bytes: bytes - beforeBytes,
        metrics: await metrics(),
      })
    }
    results.push({
      browser: name,
      initialMs,
      initial,
      phases,
      requests,
      payloadBytes: bytes,
      errors,
      responses,
    })
  } catch (error) {
    await page.screenshot({ path: resolve(output, `${name}-failure.png`) })
    results.push({ browser: name, error: error.message, errors, requests, responses })
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
      note: 'PBF response payload, not exact network transfer or invoice. Cache-disabled browser routing; in-app memory reuse measured separately.',
      results,
    },
    null,
    2,
  ) + '\n',
)
console.log(
  JSON.stringify(
    results.map(({ responses: _, ...result }) => result),
    null,
    2,
  ),
)
