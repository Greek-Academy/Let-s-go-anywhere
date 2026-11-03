import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'

async function enter(page: Page, location: 'success' | 'denied' | 'pending' = 'success') {
  const state = createInitialState()
  await page.addInitScript(
    ({ state, location }) => {
      if (!localStorage.getItem('driveplus.mock.v1'))
        localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: (v: unknown) => void, error: (v: unknown) => void) {
            if (location === 'denied') return error({ code: 1 })
            const value = {
              timestamp: Date.now(),
              coords: { latitude: 35.690921, longitude: 139.700258, accuracy: 20 },
            }
            if (location === 'pending') {
              Object.assign(window, { finishLocation: () => success(value) })
            } else success(value)
          },
          watchPosition() {
            throw new Error('must not track')
          },
        },
      })
    },
    { state, location },
  )
  await page.goto('/#/onboarding/1')
  await page.getByRole('button', { name: '自然', exact: true }).click()
  await page.getByRole('button', { name: 'グルメ', exact: true }).click()
  await page.getByRole('button', { name: 'ドライブ先を見つける', exact: true }).click()
}

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('趣味設定から検索待ち画面', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})

test('onboarding waits for the real response, reaches 100%, then shows panels without another search', async ({
  page,
}, info) => {
  const bodies: any[] = []
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/spot-search/compare', async (route) => {
    bodies.push(route.request().postDataJSON())
    const response = await route.fetch()
    await held
    await route.fulfill({ response })
  })
  await page.clock.install()
  await enter(page)
  await expect(page).toHaveURL(/#\/search\/journey$/)
  await expect.poll(() => bodies.length).toBe(1)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  const progress = page.getByRole('progressbar')
  await page.clock.fastForward(60000)
  await expect(page).toHaveURL(/#\/search\/journey$/)
  expect(Number(await progress.getAttribute('aria-valuenow'))).toBeLessThan(100)
  expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(50)
  const layout = await page.evaluate(() => {
    const screen = document.querySelector('.phone-screen')!.getBoundingClientRect()
    const photo = document.querySelector('.journey-scenery')!.getBoundingClientRect()
    const story = document.querySelector('.journey-story')!.getBoundingClientRect()
    const road = document.querySelector('.journey-road')!.getBoundingClientRect()
    return {
      covers:
        Math.abs(screen.width - photo.width) < 2 &&
        photo.top <= screen.top + 1 &&
        photo.bottom >= screen.bottom - 1,
      noOverlap: story.bottom < road.top,
      carVisible: road.bottom < screen.bottom,
    }
  })
  expect(layout).toEqual({ covers: true, noOverlap: true, carVisible: true })
  await info.attach('検索中の全画面写真と車', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  release()
  await expect(progress).toHaveAttribute('aria-valuenow', '100')
  await info.attach('実際の応答後に100%', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await expect(page).toHaveURL(/#\/discover$/)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  const firstVisible = await page
    .locator('.web-spot-card')
    .first()
    .evaluate(
      (el) =>
        el.getBoundingClientRect().top <
        document.querySelector('.bottom-nav')!.getBoundingClientRect().top,
    )
  expect(firstVisible).toBe(true)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].drive.hobbies).toEqual(['自然', 'グルメ'])
  const saved = await page.evaluate(() => localStorage.getItem('driveplus.mock.v1')!)
  expect(saved).not.toContain('35.691')
  expect(saved).not.toContain('durationSeconds')
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  expect(bodies).toHaveLength(1)
})

test('denied location offers station search and enters home with the chosen origin and hobbies', async ({
  page,
}) => {
  const bodies: any[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) bodies.push(r.postDataJSON())
  })
  await enter(page, 'denied')
  await expect(page.getByRole('alert')).toContainText('出発地を選んで')
  expect(bodies).toHaveLength(0)
  await page.getByRole('button', { name: '駅を選んで探す', exact: true }).click()
  await page.getByRole('combobox', { name: '探したい駅' }).fill('しんじゅく')
  await page.getByRole('option').filter({ hasText: '新宿駅（東京都）' }).first().click()
  await page.getByRole('button', { name: 'この駅から探す', exact: true }).click()
  await expect(page).toHaveURL(/#\/discover$/)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({ stationId: '1130208', drive: { hobbies: ['自然', 'グルメ'] } })
  expect(bodies[0]).not.toHaveProperty('location')
  await expect(page.locator('.drive-origin-card')).toContainText('新宿駅（東京都）')
})

for (const kind of ['network', 'provider', 'empty'] as const) {
  test(`${kind} failure stays on recovery without 100% or automatic retries; explicit retry succeeds`, async ({
    page,
  }) => {
    let calls = 0
    await page.route('**/api/spot-search/compare', async (route) => {
      calls++
      if (calls > 1) return route.continue()
      if (kind === 'network')
        return route.fulfill({ status: 503, json: { error: '検証用の通信失敗' } })
      const response = await route.fetch()
      const data = await response.json()
      data.spots = []
      if (kind === 'provider')
        data.reports = data.reports.map((report: Record<string, unknown>) => ({
          ...report,
          state: 'failed',
          count: 0,
          omitted: 0,
          error:
            'Brave検索サービスに接続できませんでした。インターネット接続を確認して、もう一度お試しください。',
        }))
      await route.fulfill({ json: data })
    })
    await enter(page)
    await expect(page.getByRole('alert')).toContainText(
      kind === 'empty' ? '見つかりませんでした' : '検索を完了できませんでした',
    )
    await expect(page).toHaveURL(/#\/search\/journey$/)
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    if (kind !== 'empty') {
      await page.getByText('詳しい状況', { exact: true }).click()
      await expect(page.locator('.journey-recovery details')).toContainText(
        kind === 'provider' ? 'Brave検索サービスに接続できませんでした' : '検証用の通信失敗',
      )
      await expect(page.locator('.journey-recovery .button')).toHaveText('もう一度検索する')
    } else await expect(page.getByText('詳しい状況', { exact: true })).toHaveCount(0)
    await page.waitForTimeout(1300)
    expect(calls).toBe(1)
    await page.getByRole('button', { name: 'もう一度検索する', exact: true }).click()
    await expect(page).toHaveURL(/#\/discover$/)
    await expect(page.locator('.web-spot-card')).toHaveCount(10)
    expect(calls).toBe(2)
  })
}

test('leaving during GPS acquisition cancels startup and ignores a late position', async ({
  page,
}) => {
  let calls = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) calls++
  })
  await enter(page, 'pending')
  await expect(page.getByText('現在地を確認しています')).toBeVisible()
  await page.waitForFunction(() => typeof (window as any).finishLocation === 'function')
  await page.getByRole('button', { name: '検索をやめる', exact: true }).click()
  await page.evaluate(() => (window as unknown as { finishLocation: () => void }).finishLocation())
  await expect(page).toHaveURL(/#\/discover$/)
  await page.waitForTimeout(800)
  expect(calls).toBe(0)
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
})

test('credits, reduced motion and image failure preserve the search flow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/images/search-journey/fuji.jpg', (r) => r.abort())
  await enter(page, 'pending')
  await expect(page.getByText('写真を読み込めませんでした')).toBeVisible()
  await expect(page.locator('.journey-car-body')).toHaveCSS('animation-name', 'none')
  await page.getByRole('button', { name: '写真の出典：Manishprabhune', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('CC BY-SA 4.0')
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.evaluate(() => (window as unknown as { finishLocation: () => void }).finishLocation())
  await expect(page).toHaveURL(/#\/discover$/)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
})

test('cancelling a pending search ignores its late response and never starts another paid request', async ({
  page,
}) => {
  let calls = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/spot-search/compare', async (route) => {
    calls++
    const response = await route.fetch()
    await held
    await route.fulfill({ response }).catch(() => {})
  })
  await enter(page)
  await expect.poll(() => calls).toBe(1)
  await page.getByRole('button', { name: '検索をやめる', exact: true }).click()
  release()
  await expect(page).toHaveURL(/#\/discover$/)
  await page.waitForTimeout(1300)
  expect(calls).toBe(1)
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})

test('an explicit return to hobby setup searches the new hobbies instead of replaying the old result', async ({
  page,
}) => {
  const bodies: any[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) bodies.push(r.postDataJSON())
  })
  await enter(page)
  await expect(page).toHaveURL(/#\/discover$/)
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'マイページ', exact: true })
    .click()
  // Client navigation preserves the provider's previous result, unlike a document reload.
  await page.evaluate(() => {
    location.hash = '/onboarding/1'
  })
  await page.getByRole('button', { name: '温泉', exact: true }).click()
  await page.getByRole('button', { name: 'ドライブ先を見つける', exact: true }).click()
  await expect(page).toHaveURL(/#\/discover$/)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies).toHaveLength(2)
  expect(bodies[1].drive.hobbies).toEqual(['自然', 'グルメ', '温泉'])
})
