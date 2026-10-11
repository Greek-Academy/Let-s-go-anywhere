import { expect, test } from './support/mapFixture'
import type { Page } from '@playwright/test'
import { chooseStation } from './helpers/discovery'

async function enter(page: Page) {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.goto('/#/cars/sample')
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('車検索の操作後', { body: await page.screenshot(), contentType: 'image/png' })
})

test('external search uses the typed area only on confirmation and retains conditions and existing saves', async ({
  page,
  context,
}) => {
  const requests: { url: string; referrer?: string }[] = []
  await context.route('https://www.google.com/**', async (route) => {
    requests.push({ url: route.request().url(), referrer: route.request().headers().referer })
    await route.fulfill({ contentType: 'text/html', body: '<h1>Local test response</h1>' })
  })
  await enter(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('driveplus.mock.v1')!)
    state.savedStations = ['times-shibuya']
    state.profile.name = 'PRIVATE_NAME'
    state.memo.questions = 'PRIVATE_MEMO'
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
  })
  await page.reload()
  await page.getByRole('button', { name: /実際の車を探す/ }).click()
  await expect(
    page.getByRole('navigation').getByRole('button', { name: '車を探す', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.getByLabel('探す駅・地域', { exact: true }).fill('京都駅')
  await page.getByRole('button', { name: 'レンタカー', exact: true }).click()
  await page.getByLabel('事業者', { exact: true }).selectOption('toyota')
  await page.getByRole('button', { name: '外部地図で車を探す', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('京都駅 · トヨタレンタカー')
  expect(requests).toEqual([])
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  expect(requests).toEqual([])
  await page.getByRole('button', { name: '外部地図で車を探す', exact: true }).click()
  const pending = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'Googleマップで検索する', exact: true }).click()
  const popup = await pending
  await popup.waitForLoadState('domcontentloaded')
  expect(await popup.evaluate(() => window.opener)).toBeNull()
  expect(requests).toHaveLength(1)
  expect(requests[0].referrer).toBeUndefined()
  expect(new URL(requests[0].url).searchParams.get('query')).toBe('京都駅 トヨタレンタカー')
  expect(requests[0].url).not.toContain('PRIVATE_')
  await popup.close()
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page).toHaveURL(/#\/cars\/sample$/)
  await page.getByRole('button', { name: /実際の車を探す/ }).click()
  await page.reload()
  await expect(page.getByLabel('探す駅・地域', { exact: true })).toHaveValue('京都駅')
  await expect(page.getByLabel('事業者', { exact: true })).toHaveValue('toyota')
  expect((await saved(page)).savedStations).toEqual(['times-shibuya'])
  expect((await saved(page)).consultations).toEqual([])
})

test('official entrance is not a station confirmation, has no inferred query, and a failed page can be left', async ({
  page,
  context,
}) => {
  await context.route('https://share.timescar.jp/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset="utf-8"><h1>検証用：ページがありません</h1>',
    }),
  )
  await enter(page)
  await page.getByRole('button', { name: '車の一覧に切り替え' }).click()
  await page.getByRole('button', { name: /実際の車を探す/ }).click()
  await page.getByLabel('探す駅・地域', { exact: true }).fill('京都駅')
  await page.getByRole('button', { name: 'カーシェア', exact: true }).click()
  await expect(page.locator('.car-provider-card')).toHaveCount(1)
  await page.getByRole('button', { name: /タイムズカー 公式の検索ページ/ }).click()
  await expect(page.getByRole('dialog')).toContainText('自動で引き継がれません')
  await expect(page.getByRole('link', { name: '公式の検索ページを開く' })).toHaveAttribute(
    'href',
    'https://share.timescar.jp/place/',
  )
  const before = await saved(page)
  await page.getByRole('button', { name: '開けない・アプリがないとき' }).click()
  await page.getByRole('link', { name: '同じタブで公式Webを開く' }).click()
  await expect(page.getByRole('heading', { name: '検証用：ページがありません' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/cars\/search$/)
  expect(await saved(page)).toEqual(before)
})

test('changing category clears incompatible provider; empty area and narrow enlarged layout stay usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await enter(page)
  await page.goto('/#/cars/search')
  await expect(page.getByRole('button', { name: /出発エリアを使う/ })).toBeDisabled()
  await page.goto('/#/discover')
  await page.getByRole('button', { name: '出発エリアを変更', exact: true }).click()
  await chooseStation(page, '出発する最寄駅', '新宿', '新宿駅（東京都）')
  await page.getByRole('button', { name: '出発エリアを保存', exact: true }).click()
  await page.goto('/#/settings')
  await page.getByRole('switch', { name: /文字を少し大きくする/ }).check()
  await page.goto('/#/cars/search')
  await page.getByLabel('事業者', { exact: true }).selectOption('toyota')
  await page.getByRole('button', { name: 'カーシェア', exact: true }).click()
  await expect(page.getByLabel('事業者', { exact: true })).toHaveValue('')
  await page.getByLabel('探す駅・地域', { exact: true }).fill('')
  await page.getByRole('button', { name: '外部地図で車を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('駅名・地域を入力してください。')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /出発エリアを使う/ }).click()
  await expect(page.getByLabel('探す駅・地域', { exact: true })).toHaveValue('東京都 新宿駅周辺')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '外部地図で車を探す', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  expect(
    await page.locator('.car-search-screen').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
})

test('map query can be handed to real search without fabricating stations or losing sample map selection', async ({
  page,
}) => {
  await enter(page)
  await page.getByLabel('駅名・地域から車を探す', { exact: true }).fill('京都駅')
  await page.getByRole('button', { name: /実際の車を探す/ }).click()
  await expect(page.getByLabel('探す駅・地域', { exact: true })).toHaveValue('京都駅')
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.getByLabel('駅名・地域から車を探す', { exact: true })).toHaveValue('京都駅')
  await page.getByRole('button', { name: 'タイムズカー 渋谷駅前・カーシェアの詳細カード' }).click()
  await page.getByRole('button', { name: '公式で空き状況・予約を確認', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('この掲載情報はサンプルです')
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
})

test('car search destination URL disclosure is keyboard accessible inside the dialog', async ({
  page,
}) => {
  await enter(page)
  await page.goto('/#/cars/search')
  await page.getByLabel('探す駅・地域', { exact: true }).fill('京都駅')
  await page.getByRole('button', { name: '外部地図で車を探す', exact: true }).click()
  await expect(page.getByRole('button', { name: '閉じる', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('summary')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('details')).toHaveAttribute('open', '')
  await page.keyboard.press('Tab')
  await expect(
    page.getByRole('link', { name: 'Googleマップで検索する', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '外部地図で車を探す', exact: true })).toBeFocused()
})
