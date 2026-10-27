import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'

async function enter(page: Page) {
  const initial = createInitialState()
  initial.onboarded = true
  initial.profile.interests = ['自然']
  await page.addInitScript((s) => {
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(s))
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: (value: unknown) => void) {
          success({
            timestamp: Date.now(),
            coords: { latitude: 35.690921, longitude: 139.700258, accuracy: 20 },
          })
        },
      },
    })
  }, initial)
  await page.goto('/#/discover')
}
async function openReset(page: Page) {
  // Hash navigation keeps the same app instance; a full reload would hide the reset bug.
  await page.evaluate(() => {
    location.hash = '#/settings'
  })
  await page.getByRole('button', { name: 'モックの保存データを削除', exact: true }).click()
}
async function reset(page: Page) {
  await openReset(page)
  await page.getByRole('button', { name: '削除して最初から始める', exact: true }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
}
async function startAgain(page: Page) {
  await page.getByRole('button', { name: 'はじめる', exact: true }).click()
  await expect(page.getByText('0個の趣味を選択中')).toBeVisible()
  await page.getByRole('button', { name: '温泉', exact: true }).click()
  await page.getByRole('button', { name: 'ドライブ先を見つける', exact: true }).click()
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('保存データ削除後の再検索', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
})
test('reset removes old candidates and searches again with new hobbies and driving times; cancel preserves the result', async ({
  page,
}) => {
  const queries: any[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) queries.push(r.postDataJSON())
  })
  await enter(page)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '車で片道 約',
  )
  await page.getByRole('button', { name: 'サンプル01・小さな喫茶店を保存', exact: true }).click()
  await openReset(page)
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await page.evaluate(() => {
    location.hash = '#/discover'
  })
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '車で片道 約',
  )
  expect(queries).toHaveLength(1)
  await reset(page)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(saved.savedWebSpots).toHaveLength(0)
  expect(saved.onboarded).toBe(false)
  await startAgain(page)
  await expect.poll(() => queries.length).toBe(2)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '車で片道 約',
  )
  expect(queries[1].drive.hobbies).toEqual(['温泉'])
  expect(queries[1].location).toEqual({ lat: 35.691, lng: 139.7 })
  await page.getByRole('navigation').getByRole('button', { name: '学ぶ', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  expect(queries).toHaveLength(2)
})

test('reset during a search discards its late response and permits a fresh automatic search', async ({
  page,
}) => {
  let calls = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/spot-search/compare', async (route) => {
    calls++
    if (calls !== 1) return route.continue()
    const response = await route.fetch()
    const data = await response.json()
    data.spots = data.spots.map((s: object) => ({ ...s, name: '削除前の検索候補' }))
    await held
    await route.fulfill({ json: data })
  })
  await enter(page)
  await expect.poll(() => calls).toBe(1)
  await reset(page)
  release()
  await startAgain(page)
  await expect.poll(() => calls).toBe(2)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.getByText('削除前の検索候補', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '車で片道 約',
  )
})
