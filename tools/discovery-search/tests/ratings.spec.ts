import { test, expect, type Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
import { driveQuery, driveTheme } from '../../../src/domain/driveSearch'
import { parseWebSearchResult } from '../../../src/domain/webSearch'
import { fromWebSpot } from '../../../src/sharing/candidates'
// @ts-expect-error Node-only synthetic provider; no external calls.
import { runComparison } from '../../spot-comparison/providers.mjs'

const drive = driveQuery('default', undefined, ['自然'])
const query = { stationId: '1130208', region: '東京都 新宿駅周辺', theme: driveTheme(drive), drive }
async function fixture() {
  const result = await runComparison({ query, demo: true, searchProvider: 'brave' })
  result.mode = 'live'
  result.spots = result.spots.slice(0, 2)
  const now = Date.now()
  for (const spot of result.spots) spot.travel = { ...spot.travel, status: 'calculated' }
  result.spots[0].name = '森のカフェ（表示サンプル）'
  result.spots[1].name = '湖畔の遊歩道（表示サンプル）'
  result.spots[0].googleRating = {
    rating: 4.3,
    count: 128,
    mapsUrl: 'https://maps.google.com/?cid=123',
    checkedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 600000).toISOString(),
    attributions: [],
  }
  return result
}
async function enter(page: Page, result: unknown) {
  const state = createInitialState()
  state.onboarded = true
  state.profile.interests = ['自然']
  state.discover.region = 'station'
  state.discover.stationId = query.stationId
  await page.addInitScript((s) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(s))
  }, state)
  await page.route('**/api/spot-search/comparison-status', (r) =>
    r.fulfill({
      json: {
        demo: false,
        configured: true,
        searchProvider: 'brave',
        busy: false,
        token: 'a'.repeat(64),
        maxAttempts: null,
        attempts: [],
      },
    }),
  )
  await page.route('**/api/spot-search/compare', (r) => r.fulfill({ json: result }))
  await page.goto('/#/discover')
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(2)
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('評価の表示（架空の検証データ）', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})

test('評価・件数・Google表記とリンクを表示し、評価なしの候補も残す。保存・共有・再読込には残さない', async ({
  page,
}, info) => {
  const result = await fixture()
  await enter(page, result)
  const first = page.locator('.web-spot-card').first()
  const rating = first.getByRole('link', { name: /Google Mapsの評価/ })
  await expect(rating).toContainText('4.3')
  await expect(rating).toContainText('128件')
  await expect(rating).toHaveAttribute('href', 'https://maps.google.com/?cid=123')
  await expect(rating).toHaveAttribute('target', '_blank')
  await expect(first.getByText('Google Maps', { exact: true })).toHaveCount(1)
  await expect(first).toContainText('車で片道')
  await expect(page.locator('.web-spot-card').nth(1).locator('.google-place-rating')).toHaveCount(0)
  await expect(page.locator('iframe[title="Google検索の関連候補"]')).toHaveCount(0)
  if (process.env.CAPTURE_RATINGS && info.project.name === 'desktop') {
    await page.locator('.phone-screen').evaluate((el) => {
      el.scrollTop = 0
    })
    await page
      .locator('.mobile-frame')
      .screenshot({ path: 'docs/reviews/google-ratings/after.png' })
  }
  await page
    .getByRole('button', { name: `${result.spots[0].name}の詳細を見る`, exact: true })
    .click()
  await expect(page.locator('.detail-body .google-place-rating')).toContainText('4.3')
  await page
    .locator('.detail-body')
    .getByRole('button', { name: '行きたいに保存', exact: true })
    .click()
  const stored = await page.evaluate(() => localStorage.getItem('driveplus.mock.v1')!)
  expect(stored).not.toContain('googleRating')
  expect(stored).not.toContain('maps.google.com')
  const parsed = await parseWebSearchResult(result, query)
  expect(JSON.stringify(fromWebSpot(parsed.spots[0]))).not.toContain('googleRating')
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await expect(page.locator('.saved-web-spot')).toHaveCount(1)
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.locator('.google-place-rating')).toHaveCount(0)
})

test('10分経過後は評価を消して経路のGoogle表記を戻す。再取得リクエストは行わない', async ({
  page,
}) => {
  const result = await fixture()
  result.spots[0].googleRating.checkedAt = new Date(Date.now() - 597000).toISOString()
  result.spots[0].googleRating.expiresAt = new Date(Date.now() + 3000).toISOString()
  // Exactly ten minutes, including any clock tick between construction calls.
  result.spots[0].googleRating.expiresAt = new Date(
    Date.parse(result.spots[0].googleRating.checkedAt) + 600000,
  ).toISOString()
  let requests = 0
  await page.route('https://places.googleapis.com/**', (r) => {
    requests++
    return r.abort()
  })
  await enter(page, result)
  await expect(page.locator('.google-place-rating')).toHaveCount(1)
  await expect(page.locator('.google-place-rating')).toHaveCount(0, { timeout: 6000 })
  await expect(
    page.locator('.web-spot-card').first().getByText('Google Maps', { exact: true }),
  ).toHaveCount(1)
  expect(requests).toBe(0)
})

test('壊れた評価だけを捨て、サンプルの回答を本物の評価として表示しない', async ({ page }, info) => {
  const result = await fixture()
  result.spots[0].googleRating.mapsUrl = 'javascript:alert(1)'
  const parsed = await parseWebSearchResult(result, query)
  expect(parsed.spots).toHaveLength(2)
  expect(parsed.spots[0].googleRating).toBeUndefined()
  const sample = await fixture()
  sample.mode = 'sample'
  for (const spot of sample.spots) spot.travel.status = 'sample'
  expect((await parseWebSearchResult(sample, query)).spots[0].googleRating).toBeUndefined()
  await enter(page, result)
  await expect(page.locator('.google-place-rating')).toHaveCount(0)
  if (process.env.CAPTURE_RATINGS && info.project.name === 'desktop') {
    await page.locator('.phone-screen').evaluate((el) => {
      el.scrollTop = 0
    })
    await page
      .locator('.mobile-frame')
      .screenshot({ path: 'docs/reviews/google-ratings/before.png' })
  }
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
