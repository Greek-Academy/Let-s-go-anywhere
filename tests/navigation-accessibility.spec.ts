import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

async function keyboardActivate(page: Page, target: Locator) {
  await target.focus()
  await page.keyboard.press('Enter')
}
async function enter(page: Page, route = '/discover') {
  await page.goto('/#/welcome')
  await keyboardActivate(page, page.getByRole('button', { name: 'まずは見てみる' }))
  if (route !== '/discover') await page.goto('/#' + route)
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
})
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
})

test('keyboard onboarding and all five tabs move focus to the new screen without opening a text field', async ({
  page,
}) => {
  await page.goto('/#/welcome')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await keyboardActivate(page, page.getByRole('button', { name: 'はじめる', exact: true }))
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(page.getByRole('textbox', { name: '出発エリア' })).not.toBeFocused()
  for (let step = 0; step < 3; step++) {
    await keyboardActivate(page, page.getByRole('button', { name: 'スキップ', exact: true }))
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  }
  for (const name of ['行きたい', '車を探す', '学ぶ', '講習', '見つける']) {
    await keyboardActivate(
      page,
      page.getByRole('navigation').getByRole('button', { name, exact: true }),
    )
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    const title = (await page.getByRole('heading', { level: 1 }).textContent())!
      .replace(/\s+/g, ' ')
      .trim()
    await expect(page).toHaveTitle(`${title} | Drive+`)
    await expect(
      page.getByRole('navigation').getByRole('button', { name, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  }
})

test('detail back and browser forward restore the originating card and its scroll position', async ({
  page,
}) => {
  await enter(page)
  const card = page.locator('.event-photo-button').last()
  const label = await card.getAttribute('aria-label')
  await card.focus()
  const scroll = await page.locator('#app-scroll').evaluate((el) => el.scrollTop)
  expect(scroll).toBeGreaterThan(100)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await keyboardActivate(page, page.getByRole('button', { name: '戻る', exact: true }))
  await expect(page.getByRole('button', { name: label!, exact: true })).toBeFocused()
  expect(await page.locator('#app-scroll').evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0)
  await page.goForward()
  await expect(page.getByRole('button', { name: '戻る', exact: true })).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('button', { name: label!, exact: true })).toBeFocused()
})

test('same-page filtering keeps focus, while profile navigation returns to the menu item', async ({
  page,
}) => {
  await enter(page)
  const filter = page.getByRole('button', { name: 'スポット', exact: true })
  await keyboardActivate(page, filter)
  await expect(filter).toBeFocused()
  await keyboardActivate(page, page.getByRole('button', { name: 'マイページを開く' }))
  const edit = page.getByRole('button', { name: 'プロフィール・出発エリア', exact: true })
  await keyboardActivate(page, edit)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await keyboardActivate(page, page.getByRole('button', { name: '戻る', exact: true }))
  await expect(edit).toBeFocused()
})

test('removed return targets and missing routes fall back to a meaningful heading', async ({
  page,
}) => {
  await enter(page, '/saved')
  const card = page.locator('.saved-outing > button').first()
  // Select a real sample via the UI before checking deletion on the destination screen.
  await page.goto('/#/events/fuji')
  const save = page.getByRole('button', { name: '行きたいに保存', exact: true })
  if (await save.count()) await save.last().click()
  await page.goto('/#/saved')
  await keyboardActivate(page, card)
  await page.getByRole('button', { name: '行きたいに保存済み', exact: true }).click()
  await keyboardActivate(page, page.getByRole('button', { name: '戻る', exact: true }))
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.goto('/#/missing-screen')
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeFocused()
})

test('map and list switches announce their heading and preserve the selected station', async ({
  page,
}) => {
  await enter(page, '/cars')
  await expect(page.getByRole('heading', { name: '車を探す・地図', exact: true })).toBeFocused()
  await keyboardActivate(page, page.getByRole('button', { name: '車の一覧に切り替え' }))
  await expect(page.getByRole('heading', { name: '借りる場所を探す' })).toBeFocused()
  const station = page.locator('.station-list .station-card-main').first()
  await keyboardActivate(page, station)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await keyboardActivate(page, page.getByRole('button', { name: '戻る', exact: true }))
  await expect(station).toBeFocused()
  await keyboardActivate(page, page.getByRole('button', { name: '地図で見る', exact: true }))
  await expect(page.getByRole('heading', { name: '車を探す・地図' })).toBeFocused()
})

test('saved sub-tabs keep the activated control focused across URL query changes', async ({
  page,
}) => {
  await enter(page, '/saved')
  const cars = page.getByRole('button', { name: /^車候補 \d+$/ })
  await keyboardActivate(page, cars)
  await expect(page).toHaveURL(/#\/saved\?type=cars$/)
  await expect(cars).toBeFocused()
  const outings = page.getByRole('button', { name: /^お出かけ \d+$/ })
  await keyboardActivate(page, outings)
  await expect(page).toHaveURL(/#\/saved\?type=events$/)
  await expect(outings).toBeFocused()
})

test('direct hash entries do not reuse the scroll position of a different screen', async ({
  page,
}) => {
  await enter(page, '/settings')
  await page.locator('#app-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect
    .poll(() => page.locator('#app-scroll').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100)
  await page.goto('/#/saved')
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  expect(await page.locator('#app-scroll').evaluate((el) => el.scrollTop)).toBe(0)
})
