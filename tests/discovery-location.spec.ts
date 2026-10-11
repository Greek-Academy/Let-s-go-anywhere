import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { coarseCenter, validDiscoveryCenter, sameCenter } from '../src/domain/discoveryLocation'

// Public landmark only: Shinjuku Station, never a user's address.
async function enter(
  page: Page,
  options: { error?: number; age?: number; accuracy?: number; delayed?: boolean } = {},
) {
  const initial = createInitialState()
  initial.onboarded = true
  initial.profile.stationId = '100216'
  initial.profile.area = '京都駅（京都府）'
  await page.addInitScript(
    ({ initial, options }) => {
      if (!localStorage.getItem('driveplus.mock.v1'))
        localStorage.setItem('driveplus.mock.v1', JSON.stringify(initial))
      const target = window as unknown as { locationCalls: number; deliver: () => void }
      target.locationCalls = 0
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: (x: unknown) => void, failure: (x: unknown) => void) {
            target.locationCalls++
            const deliver = () =>
              options.error
                ? failure({ code: options.error })
                : success({
                    timestamp: Date.now() - (options.age ?? 0),
                    coords: {
                      latitude: 35.690921,
                      longitude: 139.700258,
                      accuracy: options.accuracy ?? 25,
                    },
                  })
            if (options.delayed) target.deliver = deliver
            else deliver()
          },
          watchPosition() {
            throw new Error('Tracking is not allowed')
          },
        },
      })
    },
    { initial, options },
  )
  await page.goto('/#/discover')
}
async function chooseLocation(page: Page) {
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /現在地の周辺/ }).click()
}
const acquire = (page: Page) =>
  page.getByRole('button', { name: '現在地を取得して設定', exact: true }).click()
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { locationCalls: number }).locationCalls)

test('approximate search coordinates have strict bounds and precision', () => {
  expect(coarseCenter({ lat: 35.690921, lng: 139.700258 })).toEqual({ lat: 35.691, lng: 139.7 })
  expect(validDiscoveryCenter({ lat: 35.691, lng: 139.7 })).toBe(true)
  for (const invalid of [
    null,
    { lat: 35.690921, lng: 139.7 },
    { lat: NaN, lng: 139.7 },
    { lat: 35.691, lng: 139.7, extra: 1 },
  ])
    expect(validDiscoveryCenter(invalid)).toBe(false)
  expect(sameCenter(undefined, { lat: 35.691, lng: 139.7 })).toBe(false)
})

test('explicit acquisition keeps departure station, does not search/save/share GPS, supports tabs and station switch', async ({
  page,
}) => {
  const searches: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/spot-search/')) searches.push(r.url())
  })
  await enter(page)
  await chooseLocation(page)
  expect(await calls(page)).toBe(0)
  await expect(page.getByRole('dialog')).toContainText('約100m単位')
  await acquire(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('#discovery-region-label')).toHaveText('取得した現在地の周辺')
  await expect(page.locator('#discovery-origin-label')).toContainText('京都駅')
  expect(await calls(page)).toBe(1)
  expect(searches).toHaveLength(0)
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  for (const value of ['35.69', '139.7', 'accuracy', '取得した現在地'])
    expect(storage).not.toContain(value)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('#discovery-region-label')).toHaveText('取得した現在地の周辺')
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /出発駅の周辺/ }).click()
  await page.getByRole('button', { name: 'この駅の周辺で探す' }).click()
  await expect(page.locator('#discovery-region-label')).toHaveText('京都府 京都駅周辺')
  expect(await calls(page)).toBe(1)
  await chooseLocation(page)
  await acquire(page)
  await page.reload()
  await expect(page.locator('#discovery-region-label')).toHaveText('京都府 京都駅周辺')
  expect(await calls(page)).toBe(0)
})

for (const [options, message] of [
  [{ error: 1 }, '許可されていません'],
  [{ accuracy: 1500 }, '誤差が大きい'],
  [{ age: 180000 }, '古い位置情報'],
] as const)
  test(`location failure ${message} keeps station fallback`, async ({ page }) => {
    await enter(page, options)
    await chooseLocation(page)
    await acquire(page)
    await expect(page.getByRole('alert')).toContainText(message)
    await page.getByRole('button', { name: /出発駅の周辺/ }).click()
    await page.getByRole('button', { name: 'この駅の周辺で探す' }).click()
    await expect(page.locator('#discovery-region-label')).toHaveText('京都府 京都駅周辺')
  })

test('closing a pending sheet ignores its late GPS result', async ({ page }) => {
  await enter(page, { delayed: true })
  await chooseLocation(page)
  await acquire(page)
  await expect(page.getByRole('button', { name: '現在地を取得中…' })).toBeDisabled()
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click()
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  await expect(page.locator('#discovery-region-label')).toHaveText('京都府 京都駅周辺')
  expect(await calls(page)).toBe(1)
})

test('background and ten-minute expiry require explicit reacquisition', async ({ page }) => {
  await enter(page)
  await page.clock.install()
  await chooseLocation(page)
  await acquire(page)
  await expect(page.locator('#discovery-region-label')).toHaveText('取得した現在地の周辺')
  await page.clock.fastForward(600001)
  await expect(page.locator('#discovery-region-label')).toHaveText('現在地を再取得')
  await chooseLocation(page)
  await acquire(page)
  await expect(page.locator('#discovery-region-label')).toHaveText('取得した現在地の周辺')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })
  await expect(page.locator('#discovery-region-label')).toHaveText('現在地を再取得')
  expect(await calls(page)).toBe(2)
})
