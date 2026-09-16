import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const directory = 'docs/reviews/event-lifecycle'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1050 },
    deviceScaleFactor: 1,
  })
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  const visit = async (id) => {
    await page.goto(`http://127.0.0.1:4186/#/events/${id}`)
    await expect(page.locator('.outing-status-detail')).toBeVisible()
    await page.locator('#app-scroll').evaluate((el) => {
      el.scrollTop = 0
    })
  }
  await visit('sample-cancelled')
  await page.screenshot({ path: directory + '/desktop-cancelled.png', animations: 'disabled' })
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  await visit('sample-ended')
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  await visit('sample-photo-stopped')
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  await page.setViewportSize({ width: 402, height: 874 })
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-outing')).toHaveCount(3)
  await page.clock.runFor(3_000)
  await page.screenshot({ path: directory + '/mobile-saved.png', animations: 'disabled' })
  await visit('sample-photo-stopped')
  await expect(page.locator('.detail-hero img')).toHaveCount(0)
  await page.screenshot({ path: directory + '/mobile-photo-stopped.png', animations: 'disabled' })
  console.log('Captured fictional lifecycle examples in ' + directory)
} finally {
  await browser.close()
}
