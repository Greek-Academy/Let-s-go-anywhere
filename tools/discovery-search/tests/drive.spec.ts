import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
import { driveQuery, emptyDriveChoices } from '../../../src/domain/driveSearch'
const first = 'サンプル01・小さな喫茶店'
async function enter(page: Page, start = '/#/discover') {
  const state = createInitialState()
  state.onboarded = true
  state.profile.interests = ['音楽', '自然']
  state.discover.search = '海鮮を食べたい'
  await page.addInitScript((s) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(s))
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: (v: unknown) => void) {
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
  }, state)
  await page.goto(start)
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('ドライブ検索', { body: await page.screenshot(), contentType: 'image/png' })
})
test('GPS starts one search, ten time-labelled cards; modes are independent and saved data excludes routes and coordinates', async ({
  page,
}) => {
  const bodies: Record<string, any>[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) bodies.push(r.postDataJSON())
  })
  await enter(page)
  await expect(page.getByRole('button', { name: 'お出かけの絞り込み' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '前回の比較結果を開く（無料）' })).toHaveCount(0)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies).toHaveLength(1)
  const layout = await page.evaluate(() => {
    const tabs = document.querySelector('.discovery-chips')!.getBoundingClientRect()
    const firstCard = document.querySelector('.web-spot-card')!.getBoundingClientRect()
    const controls = document.querySelector('.drive-home-controls')!
    const cards = document.querySelectorAll('.web-spot-card')
    const last = cards[cards.length - 1]
    const bottom = document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? innerHeight
    return {
      afterTabs: firstCard.top >= tabs.bottom,
      gap: firstCard.top - tabs.bottom,
      visible: firstCard.top < bottom,
      controlsAfterCards: !!(
        last.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
    }
  })
  expect(layout.afterTabs).toBe(true)
  expect(layout.gap).toBeLessThan(32)
  expect(layout.visible).toBe(true)
  expect(layout.controlsAfterCards).toBe(true)
  await expect(
    page.locator(
      '.web-result-heading, .web-query-label, .web-hobby-query-label, .web-drive-query-label, .comparison-order',
    ),
  ).toHaveCount(0)
  await expect(page.getByText(/10件を目安に探していますが/)).toHaveCount(0)
  expect(bodies[0]).toMatchObject({
    location: { lat: 35.691, lng: 139.7 },
    drive: driveQuery('default', undefined, ['音楽', '自然']),
  })
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '車で片道 約',
  )
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '架空の時間',
  )
  await expect(page.getByRole('button', { name: '好みに寄せたおすすめ', exact: true })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: first + 'を保存', exact: true }).click()
  await page.getByRole('button', { name: first + 'の詳細を見る', exact: true }).click()
  await expect(page.locator('.event-detail .drive-travel-info')).toContainText('車で片道 約')
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  const free = page.getByRole('textbox', { name: 'お出かけを検索' })
  await free.fill('海鮮を食べたい')
  await page.getByRole('button', { name: 'この希望で探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies[1].drive).toEqual(driveQuery('free'))
  await page.getByRole('button', { name: /気分からドライブを探す/ }).click()
  await page.getByRole('button', { name: '夜景を見たい', exact: true }).click()
  await page.getByRole('button', { name: '県を越えたい', exact: true }).click()
  await page.getByRole('button', { name: '1〜2時間', exact: true }).click()
  expect(bodies).toHaveLength(2)
  await page.getByRole('button', { name: '選んだ条件で探す', exact: true }).click()
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies[2].theme).not.toContain('海鮮')
  expect(bodies[2].drive).toEqual(
    driveQuery('conditions', {
      ...emptyDriveChoices(),
      duration: '1〜2時間',
      activities: ['夜景を見たい'],
      road: '県を越えたい',
    }),
  )
  await page.getByRole('button', { name: '自由入力の結果', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await page.getByRole('button', { name: 'イベント', exact: true }).click()
  await page.getByRole('button', { name: '趣味のイベントを探す', exact: true }).click()
  await expect(page.locator('.web-spot-card').first()).toContainText('イベントサンプル')
  expect(bodies[3].drive).toEqual(driveQuery('events', undefined, ['音楽', '自然']))
  expect(bodies[3].theme).toBe('イベント')
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click()
  await page.getByRole('button', { name: 'ドライブデート', exact: true }).click()
  await expect(page.locator('.web-spot-card').first()).toContainText(first)
  expect(bodies).toHaveLength(4)
  const raw = await page.evaluate(() => localStorage.getItem('driveplus.mock.v1')!)
  for (const secret of ['35.691', '139.7', 'durationSeconds', 'distanceMeters', 'travel'])
    expect(raw).not.toContain(secret)
  expect(JSON.parse(raw).savedWebSpots).toHaveLength(1)
  await page.reload()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies).toHaveLength(5)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.locator('.event-detail .drive-travel-info')).toContainText('未確認')
})
test('onboarding hobbies feed the home search; editing hobbies does not change results or start a paid search', async ({
  page,
}) => {
  const bodies: Record<string, any>[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) bodies.push(r.postDataJSON())
  })
  await enter(page, '/#/onboarding/1')
  await page.getByRole('button', { name: '音楽', exact: true }).click()
  await page.getByRole('button', { name: '温泉', exact: true }).click()
  await page.getByRole('button', { name: 'ドライブ先を見つける', exact: true }).click()
  await expect(page.getByRole('region', { name: 'おすすめに使う趣味' })).toContainText('自然・温泉')
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies).toHaveLength(1)
  expect(bodies[0].drive.hobbies).toEqual(['自然', '温泉'])
  // Home results are encountered before the alternative free-text form.
  expect(
    await page
      .locator('.web-search-results')
      .evaluate(
        (el) =>
          !!(
            el.compareDocumentPosition(document.querySelector('.drive-free-search')!) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
  ).toBe(true)
  await page.getByRole('button', { name: '趣味を変更する', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '温泉', exact: true }).click()
  await page.getByRole('button', { name: 'この趣味にする', exact: true }).click()
  await expect(page.getByText(/入力条件が変わっています/)).toHaveCount(0)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies).toHaveLength(1)
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  expect(bodies).toHaveLength(2)
  expect(bodies[1].drive.hobbies).toEqual(['自然'])
})
test('unlimited status with historical attempts allows an automatic search and another manual search', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/spot-search/comparison-status', async (r) => {
    const response = await r.fetch()
    await r.fulfill({
      json: {
        ...(await response.json()),
        maxAttempts: null,
        attempts: Array.from({ length: 25 }, () => ({})),
      },
    })
  })
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) calls++
  })
  await enter(page)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(calls).toBe(1)
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(calls).toBe(2)
})
test('failed route calculations retain candidates with unconfirmed labels and no invented duration', async ({
  page,
}) => {
  await page.route('**/api/spot-search/compare', async (r) => {
    const response = await r.fetch()
    const json = await response.json()
    json.spots = json.spots.map((s: object) => ({ ...s, travel: { status: 'unconfirmed' } }))
    await r.fulfill({ json })
  })
  await enter(page)
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '所要時間は未確認',
  )
  await expect(page.getByText(/車で片道 約/)).toHaveCount(0)
})

test('location denial ends startup without AI calls, permits station search, and never loops on returning home', async ({
  page,
}) => {
  let calls = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) calls++
  })
  await enter(page, '/#/onboarding/1')
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_success: unknown, error: (e: unknown) => void) {
          error({ code: 1 })
        },
      },
    }),
  )
  await page.getByRole('button', { name: 'ドライブ先を見つける', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('許可されていません')
  expect(calls).toBe(0)
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /^駅を出発地にする/ }).click()
  await page.getByRole('combobox', { name: '探したい駅' }).fill('しんじゅく')
  await page.getByRole('option').filter({ hasText: '新宿駅（東京都）' }).first().click()
  await page.getByRole('button', { name: 'この駅を出発地にする', exact: true }).click()
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await page.getByRole('navigation').getByRole('button', { name: '学ぶ', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(calls).toBe(1)
})

const waitingMessage = '前の検索が終わるのを待っています。このままお待ちください。'
async function busyStatus(page: Page, isBusy: () => boolean) {
  await page.route('**/api/spot-search/comparison-status', (r) =>
    r.fulfill({
      json: {
        demo: true,
        configured: true,
        token: 'a'.repeat(64),
        busy: isBusy(),
        maxAttempts: null,
        attempts: [],
      },
    }),
  )
}
test('startup waits for an existing search, then sends only its own query once and shows cards', async ({
  page,
}) => {
  let busy = true
  let posts = 0
  // Preserve the real demo server token when the queue becomes available.
  await page.route('**/api/spot-search/comparison-status', async (r) => {
    const response = await r.fetch()
    await r.fulfill({ json: { ...(await response.json()), busy } })
  })
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) posts++
  })
  await enter(page)
  await expect(page.getByText(waitingMessage)).toBeVisible()
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'true')
  expect(posts).toBe(0)
  busy = false
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(posts).toBe(1)
  await page.getByRole('navigation').getByRole('button', { name: '学ぶ', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(posts).toBe(1)
})
test('a busy rejection after the status check waits and retries; an upstream failure never retries', async ({
  page,
}) => {
  let requests = 0
  let accepted = 0
  let fail = false
  await page.route('**/api/spot-search/compare', async (r) => {
    requests++
    if (requests === 1)
      return r.fulfill({ status: 409, json: { error: '比較検索中です。結果を待ってください。' } })
    accepted++
    if (fail) return r.fulfill({ status: 503, json: { error: '検証用の通信失敗' } })
    return r.continue()
  })
  await enter(page)
  await expect(page.getByText(waitingMessage)).toBeVisible()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(requests).toBe(2)
  expect(accepted).toBe(1)
  fail = true
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('検証用の通信失敗')
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  await page.clock.install()
  await page.clock.fastForward(5000)
  expect(requests).toBe(3)
  expect(accepted).toBe(2)
})
test('waiting times out without a paid POST and offers a way to search again', async ({ page }) => {
  let posts = 0
  await busyStatus(page, () => true)
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) posts++
  })
  await enter(page)
  await expect(page.getByText(waitingMessage)).toBeVisible()
  await page.clock.install()
  await page.clock.fastForward(121_000)
  await expect(page.getByRole('alert')).toContainText('検索が混み合っています')
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  expect(posts).toBe(0)
  await expect(
    page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }),
  ).toBeEnabled()
})
for (const cancel of ['button', 'location'] as const) {
  test(`waiting stops on ${cancel} cancellation and never starts a delayed search`, async ({
    page,
  }) => {
    let busy = true
    let posts = 0
    await busyStatus(page, () => busy)
    page.on('request', (r) => {
      if (r.url().endsWith('/api/spot-search/compare')) posts++
    })
    await enter(page)
    await expect(page.getByText(waitingMessage)).toBeVisible()
    if (cancel === 'button')
      await page.getByRole('button', { name: '待機をやめる', exact: true }).click()
    else {
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
      await expect(page.getByRole('alert')).toContainText('現在地の利用を終了しました')
    }
    await expect(page.getByText(waitingMessage)).toHaveCount(0)
    busy = false
    await page.clock.install()
    await page.clock.fastForward(5000)
    expect(posts).toBe(0)
    await expect(page.locator('.web-spot-card')).toHaveCount(0)
  })
}
