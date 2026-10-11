import { expect, test } from './support/mapFixture'
import type { Page } from '@playwright/test'
import { createInitialState } from '../src/state/model'
const readState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
async function select(page: Page, label: string, query: string, station: string) {
  await page.getByRole('combobox', { name: label, exact: true }).fill(query)
  await page.getByRole('option').filter({ hasText: station }).first().click()
}
async function destination(page: Page, query = 'しぶや', station = '渋谷駅（東京都）') {
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /別の駅の周辺/ }).click()
  await select(page, '探したい駅', query, station)
  await page.getByRole('button', { name: 'この駅の周辺で探す', exact: true }).click()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
})
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('駅選択の画面', { body: await page.screenshot(), contentType: 'image/png' })
})
test('onboarding selects a station in kana, goes back and preserves the selection after reload', async ({
  page,
}) => {
  await page.goto('/#/onboarding/1')
  await expect(page.getByRole('button', { name: '次へ', exact: true })).toBeDisabled()
  await select(page, '出発する最寄駅', 'しんじゅ', '新宿駅（東京都）')
  await page.getByRole('button', { name: '次へ', exact: true }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '出発する最寄駅' })).toHaveValue('新宿')
  await page.reload()
  expect((await readState(page)).profile.stationId).toBe('1130208')
})
test('station destination is independent of origin, preserves saves, cancels drafts and restores after reload', async ({
  page,
}) => {
  await destination(page)
  await expect(page.locator('.event-card')).toHaveCount(1)
  await page
    .getByRole('button', { name: 'おいしいコーヒーと、小さな寄り道を保存', exact: true })
    .click()
  await page.getByRole('button', { name: '出発エリアを変更', exact: true }).click()
  await select(page, '出発する最寄駅', 'きょうと', '京都駅（京都府）')
  await page.getByRole('button', { name: '出発エリアを保存', exact: true }).click()
  await expect(page.locator('.discovery-region-button')).toContainText('渋谷駅')
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await select(page, '探したい駅', 'かまくら', '鎌倉駅（神奈川県）')
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await expect(page.getByRole('button', { name: '探す地域を変更', exact: true })).toBeFocused()
  await page.reload()
  expect((await readState(page)).discover.stationId).toBe('1130205')
  expect((await readState(page)).profile.stationId).toBe('100216')
  expect((await readState(page)).savedEvents).toEqual(['cafe'])
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /出発駅の周辺/ }).click()
  await page.getByRole('button', { name: 'この駅の周辺で探す', exact: true }).click()
  await expect(page.locator('.discovery-region-button')).toContainText('京都駅')
  await expect(page.locator('.event-card')).toHaveCount(0)
})
test('same-name stations have prefectures and lines; changing text invalidates the previous selection', async ({
  page,
}) => {
  await destination(page)
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  const input = page.getByRole('combobox', { name: '探したい駅' })
  await input.fill('府中')
  await expect(page.getByRole('option').filter({ hasText: /^府中駅（東京都）/ })).toContainText(
    '京王',
  )
  await expect(page.getByRole('option').filter({ hasText: '府中駅（広島県）' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'この駅の周辺で探す', exact: true })).toBeDisabled()
  await page
    .getByRole('option')
    .filter({ hasText: /^府中駅（東京都）/ })
    .click()
  await input.fill('存在しない検証駅')
  await expect(
    page.getByText('駅が見つかりません。漢字や読み方を変えてみてください。'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'この駅の周辺で探す', exact: true })).toBeDisabled()
  await expect(page.getByText('すべての地域', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '探したい駅をクリア', exact: true }).click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(page.getByRole('dialog').getByRole('option')).toHaveCount(0)
})
test('keyboard, narrow phone, attribution and no external autocomplete traffic', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const external: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith(new URL(page.url()).origin)) external.push(r.url())
  })
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  const input = page.getByRole('combobox', { name: '探したい駅' })
  await input.fill('シンジュク')
  await input.press('ArrowUp')
  await input.press('Enter')
  await expect(page.getByText('南新宿駅（東京都）', { exact: true })).toBeVisible()
  await input.fill('シンジュク')
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(page.getByText('新宿駅（東京都）', { exact: true })).toBeVisible()
  await page.getByText('駅データについて', { exact: true }).click()
  await expect(page.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeVisible()
  await page.getByRole('button', { name: 'この駅の周辺で探す', exact: true }).click()
  expect(external).toEqual([])
  expect(
    await page.locator('#app-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true)
})
test('legacy region preferences survive without reassigning saved data to an arbitrary station', async ({
  page,
}) => {
  const initial = createInitialState()
  delete initial.profile.stationId
  delete initial.discover.stationId
  initial.onboarded = true
  initial.profile.area = '東京都'
  initial.discover.region = 'all'
  initial.savedEvents = ['fuji']
  initial.memo.questions = '残しておく学習メモ'
  await page.evaluate((s) => localStorage.setItem('driveplus.mock.v1', JSON.stringify(s)), initial)
  await page.reload()
  await expect(page.locator('.discovery-region-button')).toContainText('駅を選択')
  await expect(page.locator('.storage-notice')).toHaveCount(0)
  await destination(page)
  await page.reload()
  expect((await readState(page)).memo.questions).toBe('残しておく学習メモ')
  expect((await readState(page)).savedEvents).toEqual(['fuji'])
  expect((await readState(page)).profile.area).toBe('東京都')
})

test('a reduced phone viewport keeps the first station suggestion visible while typing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 420 })
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('combobox', { name: '探したい駅' }).fill('しんじゅく')
  await expect(page.getByRole('option').filter({ hasText: /^新宿駅（東京都）/ })).toBeInViewport({
    ratio: 1,
  })
  await page
    .getByRole('option')
    .filter({ hasText: /^新宿駅（東京都）/ })
    .click()
  await page.getByRole('button', { name: 'この駅の周辺で探す', exact: true }).click()
  await expect(page.locator('.discovery-region-button')).toContainText('新宿駅')
})
