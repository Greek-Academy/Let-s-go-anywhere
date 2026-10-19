import { driveQuery } from '../../../src/domain/driveSearch'
import { expect, test } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
import { eventDates, addDays } from '../../../src/domain/eventSearch'
import type { Page } from '@playwright/test'
const first = 'イベントサンプル01・週末マルシェ'
async function enter(page: Page) {
  const state = createInitialState()
  state.onboarded = true
  state.discover = {
    ...state.discover,
    region: 'station',
    stationId: '1130208',
    search: '落ち着いたカフェ',
    tag: '自然',
  }
  await page.addInitScript((s) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(s))
  }, state)
  await page.goto('/#/discover')
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('イベント検索', { body: await page.screenshot(), contentType: 'image/png' })
})
test('地域＋日付でイベント検索、タブ間の入力と結果保持、保存・詳細・再読み込み', async ({
  page,
}) => {
  const posts: unknown[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) posts.push(r.postDataJSON())
  })
  await enter(page)
  await page.getByRole('button', { name: 'この希望で探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await page.getByRole('button', { name: 'イベント', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'お出かけを検索' })).toHaveCount(0)
  await page.getByRole('button', { name: '今週末', exact: true }).click()
  await page.getByRole('button', { name: '今日', exact: true }).click()
  expect(posts).toHaveLength(1)
  await page.getByRole('button', { name: '趣味のイベントを探す', exact: true }).click()
  await expect(page.getByRole('heading', { name: '10件のイベント候補' })).toBeVisible()
  expect(posts[1]).toEqual({
    stationId: '1130208',
    region: '東京都 新宿駅周辺',
    theme: 'イベント',
    drive: driveQuery('events'),
    purpose: 'events',
    eventDates: eventDates({ mode: 'today', date: '' }),
  })
  await page.getByRole('button', { name: `${first}を保存`, exact: true }).click()
  await page.getByRole('button', { name: `${first}の詳細を見る`, exact: true }).click()
  await expect(page.locator('.event-detail .web-event-schedule')).toContainText('会場：架空の会場1')
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'お出かけを検索' })).toHaveValue(
    '落ち着いたカフェ',
  )
  await expect(page.locator('.web-query-label')).toContainText('落ち着いたカフェ')
  await expect(page.getByRole('heading', { name: '10件のお店・スポット候補' })).toBeVisible()
  await page.getByRole('button', { name: 'イベント', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await page.getByRole('button', { name: '日付を選ぶ', exact: true }).click()
  await page
    .getByLabel('イベントの日付', { exact: true })
    .fill(addDays(eventDates({ mode: 'today', date: '' })!.start, 1))
  await expect(page.getByText('下は前回の検索結果です', { exact: false })).toBeVisible()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.locator('.event-detail .web-event-schedule')).toContainText('AI整理・未確認')
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.getByRole('button', { name: '前回の比較結果を開く（無料）' })).toHaveCount(0)
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
  expect(posts).toHaveLength(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('日付未選択は課金前に止まり、検索中に別タブへ移っても結果は元タブへ届く', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'イベント', exact: true }).click()
  await page.getByRole('button', { name: '日付を選ぶ', exact: true }).click()
  let posts = 0
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  await page.route('**/api/spot-search/compare', async (r) => {
    posts++
    await gate
    const response = await r.fetch()
    await r.fulfill({ response })
  })
  await page.getByRole('button', { name: '趣味のイベントを探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('日付を選んで')
  expect(posts).toBe(0)
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await page.getByRole('button', { name: '趣味のイベントを探す', exact: true }).click()
  await expect.poll(() => posts).toBe(1)
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click()
  release()
  await expect(page.getByRole('button', { name: 'この希望で探す', exact: true })).toBeEnabled()
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'イベント', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(posts).toBe(1)
})
