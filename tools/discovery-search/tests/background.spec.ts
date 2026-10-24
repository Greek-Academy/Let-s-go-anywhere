import { test, expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'

async function prepare(context: BrowserContext) {
  const initial = createInitialState()
  initial.onboarded = true
  initial.profile.interests = ['買い物']
  await context.addInitScript((initial) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(initial))
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: (value: unknown) => void) {
          success({
            timestamp: Date.now(),
            coords: { latitude: 35.690921, longitude: 139.700258, accuracy: 20 },
          })
        },
        watchPosition() {
          throw new Error('must not track')
        },
      },
    })
  }, initial)
}

// Playwright keeps pages visible even with multiple tabs. Reproduce the browser
// visibility event explicitly; this does not claim an actual Safari tab switch.
async function background(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}

async function holdResult(page: Page) {
  let calls = 0
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let delivered!: () => void
  const completed = new Promise<void>((resolve) => {
    delivered = resolve
  })
  await page.route('**/api/spot-search/compare', async (route) => {
    calls++
    const response = await route.fetch()
    await held
    await route.fulfill({ response })
    delivered()
  })
  return {
    calls: () => calls,
    release: () => {
      release()
      return completed
    },
  }
}

async function expectResults(page: Page) {
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '車で片道 約',
  )
  await expect(page.getByRole('alert')).toHaveCount(0)
}

test('reset then open a new tab: backgrounded search returns cards and times without another POST', async ({
  context,
  page,
}, info) => {
  await prepare(context)
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'モックの保存データを削除', exact: true }).click()
  await page.getByRole('button', { name: '削除して最初から始める', exact: true }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
  const next = await context.newPage()
  const request = await holdResult(next)
  await next.goto('/#/welcome')
  await next.getByRole('button', { name: 'はじめる', exact: true }).click()
  await next.getByRole('button', { name: '買い物', exact: true }).click()
  await next.getByRole('button', { name: 'ドライブ先を見つける', exact: true }).click()
  await expect.poll(request.calls).toBe(1)
  await background(next, true)
  await request.release()
  await expect(next.locator('.web-spot-card')).toHaveCount(10)
  await background(next, false)
  await expectResults(next)
  await background(next, true)
  await background(next, false)
  await expectResults(next)
  expect(request.calls()).toBe(1)
  const stored = await next.evaluate(() => localStorage.getItem('driveplus.mock.v1')!)
  for (const value of ['35.691', '139.7', 'durationSeconds', 'distanceMeters', 'travel'])
    expect(stored).not.toContain(value)
  await info.attach('タブ復帰後の候補と時間（架空サンプル）', {
    body: await next.screenshot(),
    contentType: 'image/png',
  })
})

test('backgrounding while waiting preserves the queue and submits only once when available', async ({
  context,
  page,
}) => {
  await prepare(context)
  let busy = true
  let calls = 0
  await page.route('**/api/spot-search/comparison-status', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ json: { ...(await response.json()), busy } })
  })
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) calls++
  })
  await page.goto('/#/discover')
  await expect(
    page.getByText('前の検索が終わるのを待っています。このままお待ちください。'),
  ).toBeVisible()
  await background(page, true)
  busy = false
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await background(page, false)
  await expectResults(page)
  expect(calls).toBe(1)
})

for (const completed of [false, true]) {
  test(`resume after ten minutes expires location even if timers were suspended; completed=${completed}`, async ({
    context,
    page,
  }) => {
    await prepare(context)
    await page.clock.install()
    const request = await holdResult(page)
    await page.goto('/#/discover')
    await expect.poll(request.calls).toBe(1)
    if (completed) {
      await request.release()
      await expectResults(page)
    }
    await background(page, true)
    // Advance wall time, not timer callbacks: model a sleeping/backgrounded browser.
    await page.clock.setSystemTime(new Date(Date.now() + 601_000))
    await background(page, false)
    await expect(page.getByText('現在地を再取得してください', { exact: true })).toBeVisible()
    if (completed) {
      await expect(page.locator('.web-spot-card')).toHaveCount(10)
      await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
        '未確認',
      )
    } else {
      await expect(page.getByRole('alert')).toContainText('現在地の利用を終了しました')
      await request.release()
      await expect(page.locator('.web-spot-card')).toHaveCount(0)
    }
    expect(request.calls()).toBe(1)
  })
}

test('leaving the page still ends a running location search and discards its late result', async ({
  context,
  page,
}) => {
  await prepare(context)
  const request = await holdResult(page)
  await page.goto('/#/discover')
  await expect.poll(request.calls).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  await expect(page.getByRole('alert')).toContainText('現在地の利用を終了しました')
  await request.release()
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
  expect(request.calls()).toBe(1)
})

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('検索のライフサイクル', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})
