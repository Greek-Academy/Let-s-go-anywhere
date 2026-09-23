import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { sampleDraft } from '../tools/content-review/sample.ts'

const directory = 'docs/reviews/app-content-preview'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1050 },
    deviceScaleFactor: 1,
  })
  await page.goto('http://127.0.0.1:4180/')
  await page.getByRole('button', { name: '確認用サンプル', exact: true }).click()
  await page.getByLabel('名称', { exact: true }).fill('サンプル湖畔のピクニック')
  await page.getByRole('tab', { name: '2. 情報源・確認' }).click()
  await page.getByLabel('名称の確認状態', { exact: true }).selectOption('confirmed')
  await page.getByRole('tab', { name: '3. 写真の条件' }).click()
  await page.getByLabel('写真を掲載候補に含める').check()
  await page.getByLabel('写真を選ぶ', { exact: true }).setInputFiles('public/images/forest.jpg')
  const dates = sampleDraft().checks.title
  for (const [label, value] of [
    ['写真の権利者', 'サンプルとして入力'],
    ['許諾記録の参照先（非公開メモ）', '架空の入力例。本番の許諾記録ではありません。'],
    ['写真の利用範囲', 'ローカルでの表示確認'],
    ['写真のクレジット', '同梱のイメージ写真（出典：docs/ASSETS.md）'],
    ['写真の代替テキスト', '表示確認用の森のイメージ写真'],
    ['写真条件の確認日', dates.checkedAt],
    ['写真条件の再確認期限', dates.reviewBy],
  ])
    await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByLabel('写真の確認状態', { exact: true }).selectOption('confirmed')
  await page.getByRole('tab', { name: '1. 基本情報' }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: directory + '/editor.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'アプリで確認する', exact: true }).click()
  const frame = page.frameLocator('iframe')
  await expect(
    frame.getByRole('heading', { name: 'サンプル湖畔のピクニック', exact: true }),
  ).toBeVisible()
  await frame
    .getByRole('heading', { name: 'サンプル湖畔のピクニック', exact: true })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: directory + '/app-desktop.png', animations: 'disabled' })
  await page.setViewportSize({ width: 402, height: 874 })
  await frame.getByRole('button', { name: 'サンプル湖畔のピクニックを保存', exact: true }).click()
  await frame.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(frame.locator('.saved-outing')).toHaveCount(1)
  await page.screenshot({ path: directory + '/app-saved-mobile.png', animations: 'disabled' })
  await page.getByRole('button', { name: '入力に戻る', exact: true }).click()
  await page.getByLabel('名称', { exact: true }).fill('名前を変えた確認待ちの候補')
  await page.getByRole('button', { name: 'アプリで確認する', exact: true }).click()
  await page.getByRole('button', { name: '入力候補の詳細を見る', exact: true }).click()
  await expect(frame.getByText('名称の確認根拠を再確認しています。', { exact: true })).toBeVisible()
  await page.screenshot({ path: directory + '/app-unconfirmed-mobile.png', animations: 'disabled' })
  console.log('Captured fictional app preview screens in ' + directory)
} finally {
  await browser.close()
}
