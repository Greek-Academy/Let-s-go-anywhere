import { chromium, webkit, devices, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const directory = 'docs/reviews/navigation-accessibility'
const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://127.0.0.1:4188'
await mkdir(directory, { recursive: true })
for (const [name, engine, options] of [
  ['desktop', chromium, { viewport: { width: 1366, height: 1000 } }],
  ['webkit', webkit, { ...devices['iPhone 13'], deviceScaleFactor: 1 }],
]) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage(options)
    await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
    await page.goto(baseURL + '/#/discover')
    const card = page.locator('.event-photo-button').last()
    await card.focus()
    await page.keyboard.press('Enter')
    const back = page.getByRole('button', { name: '戻る', exact: true })
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(card).toBeFocused()
    await page.screenshot({ path: `${directory}/${name}-back.png`, animations: 'disabled' })
    if (name === 'webkit') {
      await page.goto(baseURL + '/#/saved')
      await page.getByRole('button', { name: 'SNSで見つけた場所を追加' }).click()
      await page.getByLabel('投稿のURL').fill('https://example.com/')
      await page.getByLabel(/自分用のタイトル/).fill('休日の候補（確認用）')
      await page.getByRole('button', { name: '行きたいに追加', exact: true }).click()
      await page.clock.runFor(3000)
      await page.getByRole('button', { name: '元の投稿を確認' }).click()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: '元のページを開く', exact: true })).toBeFocused()
      await page.screenshot({ path: `${directory}/webkit-dialog.png`, animations: 'disabled' })
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 320, height: 568 })
      await page.goto(baseURL + '/#/settings')
      await page.getByRole('switch', { name: /文字を少し大きくする/ }).check()
      await page.goto(baseURL + '/#/discover')
      await page.getByRole('button', { name: /今回のお出かけ条件/ }).click()
      await page.getByLabel('1人あたりの予算（円）').focus()
      await page.screenshot({ path: `${directory}/webkit-narrow.png`, animations: 'disabled' })
    }
  } finally {
    await browser.close()
  }
}
console.log('Captured navigation and focus in Chromium/WebKit; no external pages opened.')
