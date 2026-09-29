import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { showAllRegions } from './helpers/discovery'

const readState = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))

async function origin(page: Page, value: string) {
  await page.getByRole('button', { name: '出発エリアを変更', exact: true }).click()
  await page.getByLabel('駅名・地域名').fill(value)
  await page.getByRole('button', { name: '出発エリアを保存', exact: true }).click()
}
async function destination(page: Page, value: string) {
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /^地域を指定する / }).click()
  await page.getByLabel('目的地の都道府県').selectOption(value)
  await page.getByRole('button', { name: 'この地域で探す', exact: true }).click()
}
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-17T03:00:00Z') })
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
})
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('地域と候補表示の確認', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
})

test('origin region, unsupported area and explicit broadening preserve saving, back and car origin', async ({
  page,
}) => {
  await expect(page.locator('.event-card')).toHaveCount(3)
  await expect(page.locator('.discovery-region-button')).toContainText('東京都')
  await expect(page.locator('.event-card')).not.toContainText(['山梨', '神奈川'])
  await origin(page, '京都')
  await expect(page.locator('.event-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'この地域の候補はまだありません' })).toBeVisible()
  await expect(page.locator('.discovery-empty')).toContainText('京都府')
  await page.reload()
  await expect(page.locator('.event-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'すべての地域から探す', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(6)
  expect((await readState(page)).profile.area).toBe('京都')
  await page.getByRole('button', { name: '富士山と、湖畔の小さな旅を保存', exact: true }).click()
  const card = page.getByRole('button', {
    name: '富士山と、湖畔の小さな旅の詳細を見る',
    exact: true,
  })
  await card.scrollIntoViewIfNeeded()
  const scroll = await page.locator('#app-scroll').evaluate((el) => el.scrollTop)
  await card.click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.discovery-region-button')).toContainText('すべての地域')
  expect(
    Math.abs((await page.locator('#app-scroll').evaluate((el) => el.scrollTop)) - scroll),
  ).toBeLessThan(15)
  await card.click()
  await page.getByRole('button', { name: '出発地で車を探す', exact: true }).click()
  expect((await readState(page)).map.area).toBe('京都')
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-outing')).toContainText('富士山と、湖畔の小さな旅')
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await page.reload()
  expect((await readState(page)).discover.region).toBe('all')
  expect((await readState(page)).savedEvents).toEqual(['fuji'])
})

test('a chosen destination survives origin/profile changes and cancelled sheet drafts', async ({
  page,
}) => {
  await destination(page, '神奈川県')
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('海の見える温泉')
  await origin(page, '京都府 京都駅')
  await expect(page.locator('.discovery-region-button')).toContainText('神奈川県')
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByLabel('目的地の都道府県').selectOption('山梨県')
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await expect(page.getByRole('button', { name: '探す地域を変更', exact: true })).toBeFocused()
  await page.reload()
  expect((await readState(page)).discover.region).toBe('神奈川県')
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /^出発エリアと同じ都道府県 / }).click()
  await page.getByRole('button', { name: 'この地域で探す', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(0)
  await page.goto('/#/profile/edit')
  await page.getByLabel('出発エリア').fill('東京都 新宿駅')
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(3)
})

test('ambiguous origin is not guessed and manual search works without external requests', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).origin !== new URL(page.url()).origin) requests.push(r.url())
  })
  await origin(page, '府中駅')
  await expect(page.getByRole('heading', { name: '探す地域を選んでください' })).toBeVisible()
  await expect(page.locator('.event-card')).toHaveCount(0)
  await destination(page, '東京都')
  await expect(page.locator('.event-card')).toHaveCount(3)
  expect((await readState(page)).profile.area).toBe('府中駅')
  expect(requests).toEqual([])
})

test('region combines with interest, category, keyword, hidden items and condition resets', async ({
  page,
}) => {
  await page.goto('/#/profile/edit')
  await page.getByRole('button', { name: '自然', exact: true }).click()
  await page.getByRole('button', { name: '変更を保存', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('.event-card').first()).toContainText('緑に包まれる、森さんぽ')
  await page.getByRole('button', { name: '今週末', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('コーヒーマーケット')
  await destination(page, '山梨県')
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('湖畔のオータム花火')
  await page.getByLabel('お出かけを検索').fill('コーヒー')
  await expect(page.getByRole('heading', { name: 'ぴったりの候補が見つかりません' })).toBeVisible()
  await page.getByRole('button', { name: '条件をリセット', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(2)
  expect((await readState(page)).discover.region).toBe('山梨県')
  await page.getByRole('button', { name: 'お出かけの絞り込み', exact: true }).click()
  await page.getByRole('button', { name: 'アウトドア', exact: true }).click()
  await page.getByRole('button', { name: 'この条件で表示', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('富士山')
  await page
    .locator('.event-card')
    .getByRole('button', { name: /おすすめ理由/ })
    .click()
  await page.getByRole('button', { name: '興味がない・おすすめから外す', exact: true }).click()
  await showAllRegions(page)
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('森さんぽ')
  expect((await readState(page)).hiddenEvents).toEqual(['fuji'])
})

test('regional and all-area searches never bring back expired or stopped content', async ({
  page,
}) => {
  await destination(page, '山梨県')
  await page.getByRole('button', { name: '湖畔のオータム花火を保存', exact: true }).click()
  await page.getByRole('button', { name: '今週末', exact: true }).click()
  await page.clock.setSystemTime(new Date('2026-09-19T11:00:00Z'))
  await page.clock.runFor(30_001)
  await expect(page.locator('.event-card')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'ぴったりの候補が見つかりません' })).toBeVisible()
  await showAllRegions(page)
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('コーヒーマーケット')
  await page.clock.setSystemTime(new Date('2027-01-01T03:00:00Z'))
  await page.clock.runFor(30_001)
  await expect(page.getByRole('heading', { name: 'いま表示できる候補がありません' })).toBeVisible()
  await expect(page.locator('.event-card')).toHaveCount(0)
  expect((await readState(page)).savedEvents).toEqual(['fireworks'])
})

test('old browser data receives the regional default without losing saved choices or filters', async ({
  page,
}) => {
  const initial = createInitialState()
  const legacy = {
    ...initial,
    onboarded: true,
    savedEvents: ['fuji'],
    profile: { ...initial.profile, area: '東京都', interests: ['グルメ'] },
    discover: { category: 'スポット', search: 'コーヒー', tag: 'グルメ' },
    memo: { ...initial.memo, questions: '保存していた相談メモ' },
  }
  await page.evaluate(
    (value) => localStorage.setItem('driveplus.mock.v1', JSON.stringify(value)),
    legacy,
  )
  await page.reload()
  await expect(page.locator('.storage-notice')).toHaveCount(0)
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('小さな寄り道')
  await destination(page, '京都府')
  await page.reload()
  const stored = await readState(page)
  expect(stored.savedEvents).toEqual(['fuji'])
  expect(stored.memo.questions).toBe('保存していた相談メモ')
  expect(stored.discover).toEqual({ ...legacy.discover, region: '京都府' })
})

test('region selection fits a narrow phone with large text and preserves keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/#/settings')
  await page.getByRole('switch', { name: /文字を少し大きくする/ }).check()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  const trigger = page.getByRole('button', { name: '探す地域を変更', exact: true })
  await trigger.click()
  await page.getByRole('button', { name: /^地域を指定する / }).click()
  await page.getByLabel('目的地の都道府県').selectOption('京都府')
  const bounds = await page.getByRole('dialog').boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(320)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await destination(page, '京都府')
  await page.getByRole('button', { name: 'すべての地域から探す', exact: true }).click()
  const metrics = await page.locator('#app-scroll').evaluate((el) => ({
    width: el.clientWidth,
    scrollWidth: el.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewport: innerHeight,
  }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width + 1)
  expect(metrics.height).toBeLessThanOrEqual(metrics.viewport)
})
