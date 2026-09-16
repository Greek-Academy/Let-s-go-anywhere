import { chromium, webkit, devices, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4189'
const directory = 'docs/reviews/storage-recovery'
await mkdir(directory, { recursive: true })
for (const [name, engine, options] of [
  ['desktop', chromium, { viewport: { width: 1366, height: 1000 } }],
  ['webkit', webkit, { ...devices['iPhone 13'], deviceScaleFactor: 1 }],
]) {
  const browser = await engine.launch()
  try {
    // A fresh isolated browser context; never alter the developer's normal browser data.
    const page = await browser.newPage(options)
    await page.goto(baseURL + '/#/welcome')
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('driveplus.mock.v1')))
      .not.toBeNull()
    await page.evaluate(() => {
      const key = 'driveplus.mock.v1'
      const sample = JSON.parse(localStorage.getItem(key))
      sample.memo = null
      sample.savedEvents = ['fuji']
      localStorage.setItem(key, JSON.stringify(sample))
    })
    await page.goto(baseURL + '/#/settings')
    await page.reload()
    await page.locator('.storage-details').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await expect(page.getByRole('alert')).toBeVisible()
    await page.screenshot({ path: `${directory}/${name}-recovery.png`, animations: 'disabled' })
    if (name === 'webkit') {
      await page.setViewportSize({ width: 320, height: 568 })
      await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.screenshot({ path: `${directory}/webkit-reset.png`, animations: 'disabled' })
      await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
      await page.goto(baseURL + '/#/saved')
      await page.screenshot({ path: `${directory}/webkit-retained.png`, animations: 'disabled' })
    }
  } finally {
    await browser.close()
  }
}
console.log('Captured isolated sample storage recovery; no user data was used or uploaded.')
