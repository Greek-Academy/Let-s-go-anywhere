import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const directory = 'docs/screenshots'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 1,
})
await page.goto('http://127.0.0.1:5173/')
await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete))
await page.screenshot({ animations: 'disabled', path: `${directory}/01-welcome-desktop.png` })
await page.getByRole('button', { name: 'はじめる', exact: true }).click()
await page.getByRole('button', { name: '次へ', exact: true }).click()
await page.getByRole('button', { name: /恋人・パートナー/ }).click()
await page.screenshot({ animations: 'disabled', path: `${directory}/02-onboarding-desktop.png` })
await page.getByRole('button', { name: '次へ', exact: true }).click()
await page.getByRole('button', { name: 'おすすめを見る' }).click()
for (const [name, route] of [
  ['03-discover', '/discover'],
  ['04-cars', '/cars'],
  ['05-check', '/quiz/0'],
  ['06-schools', '/schools'],
  ['07-station', '/stations/toyota-shibuya'],
]) {
  await page.goto(`http://127.0.0.1:5173/#${route}`)
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete))
  await page.screenshot({ animations: 'disabled', path: `${directory}/${name}-desktop.png` })
}
await page.goto('http://127.0.0.1:5173/#/cars')
await page.getByRole('button', { name: '車の事業者フィルター' }).click()
await page.getByRole('button', { name: 'タイムズカー サンプルの掲載拠点' }).click()
await page.screenshot({ animations: 'disabled', path: `${directory}/08-map-filter-desktop.png` })
await page.setViewportSize({ width: 390, height: 844 })
await page.goto('http://127.0.0.1:5173/#/discover')
await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete))
await page.screenshot({ animations: 'disabled', path: `${directory}/09-discover-mobile.png` })
await page.goto('http://127.0.0.1:5173/#/cars')
await page.screenshot({ animations: 'disabled', path: `${directory}/10-cars-mobile.png` })
await browser.close()
console.log(`Saved screenshots in ${directory}`)
