import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const directory = 'docs/reviews/external-links'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1050 },
    deviceScaleFactor: 1,
  })
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  await page.goto('http://127.0.0.1:4187/#/saved')
  await page.getByRole('button', { name: 'SNSで見つけた場所を追加', exact: true }).click()
  await page.getByLabel('投稿のURL').fill('https://example.com/')
  await page.getByLabel(/自分用のタイトル/).fill('休日の候補（確認用）')
  await page.getByRole('button', { name: '行きたいに追加', exact: true }).click()
  await page.clock.runFor(3_000)
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await expect(page.getByRole('link', { name: '元のページを開く', exact: true })).toBeVisible()
  await page.screenshot({ path: directory + '/desktop-personal.png', animations: 'disabled' })
  await page.setViewportSize({ width: 402, height: 874 })
  await page.screenshot({ path: directory + '/mobile-personal.png', animations: 'disabled' })
  await page.getByRole('button', { name: '開けない・アプリがないとき' }).click()
  await page.getByRole('link', { name: '同じタブで開く', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: directory + '/mobile-fallback.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.goto('http://127.0.0.1:4187/#/stations/times-shibuya')
  await page.getByRole('button', { name: '外部地図で行き方を見る', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
  await page.screenshot({ path: directory + '/mobile-sample.png', animations: 'disabled' })
  console.log('Captured external link review screens; no external destinations opened.')
} finally {
  await browser.close()
}
