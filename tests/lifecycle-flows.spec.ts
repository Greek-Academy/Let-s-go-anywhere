import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { showAllRegions } from './helpers/discovery'

async function enter(page: Page, time = '2026-09-16T03:00:00Z') {
  await page.clock.install({ time: new Date(time) })
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await showAllRegions(page)
}
const savedIds = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).savedEvents)
async function saveDetail(page: Page, id: string) {
  await page.goto(`/#/events/${id}`)
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
})

test('cancelled and ended events stay out of discovery but remain saved with status and normal back navigation', async ({
  page,
}) => {
  await enter(page)
  await expect(page.locator('.event-card')).toHaveCount(6)
  await expect(page.locator('.event-card')).not.toContainText(['中止された', '終了した'])
  await saveDetail(page, 'sample-cancelled')
  await expect(page.locator('.outing-status-detail')).toContainText('中止（サンプル）')
  await saveDetail(page, 'sample-ended')
  await expect(page.locator('.outing-status-detail')).toContainText('終了（サンプル）')
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await expect(page.locator('.saved-outing')).toHaveCount(2)
  const cancelled = page.locator('.saved-outing').filter({ hasText: '中止された' })
  await expect(cancelled).toContainText('中止（サンプル）')
  await cancelled.getByRole('button').first().click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page).toHaveURL(/\/saved$/)
  expect(await savedIds(page)).toEqual(['sample-cancelled', 'sample-ended'])
})

test('a passed end boundary updates open discovery and saved detail without changing saved IDs', async ({
  page,
}) => {
  await enter(page, '2026-09-19T10:59:00Z')
  await page.getByRole('button', { name: '湖畔のオータム花火を保存', exact: true }).click()
  await page.clock.setSystemTime(new Date('2026-09-19T11:00:00Z'))
  await page.clock.runFor(30_001)
  await expect(page.getByRole('button', { name: '湖畔のオータム花火の詳細を見る' })).toHaveCount(0)
  await page.getByRole('button', { name: '今週末', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(1)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-outing')).toContainText('終了（サンプル）')
  await page.locator('.saved-outing').getByRole('button').first().click()
  await expect(page.locator('.outing-status-detail')).toContainText('次回の開催情報とは別')
  expect(await savedIds(page)).toEqual(['fireworks'])
})

test('stopped photos never request their URL in detail or saved list; fallback retains the phone layout', async ({
  page,
}) => {
  const images: string[] = []
  page.on('request', (req) => {
    if (req.resourceType() === 'image') images.push(req.url())
  })
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  await page.goto('/#/events/sample-photo-stopped')
  await expect(page.locator('.detail-hero img')).toHaveCount(0)
  await expect(page.locator('.detail-hero .outing-photo-empty')).toBeVisible()
  await expect(page.locator('.outing-status-detail')).toContainText('要確認（サンプル）')
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-outing img')).toHaveCount(0)
  await expect(page.locator('.saved-outing .outing-photo-empty')).toBeVisible()
  await page.reload()
  expect(images.some((url) => url.includes('/images/coast.jpg'))).toBe(false)
  const overflow = await page
    .locator('#app-scroll')
    .evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(overflow).toBe(false)
})

test('JST review expiry removes a visible photo and marks saved information for rechecking on focus', async ({
  page,
}) => {
  await enter(page, '2026-12-31T14:59:00Z')
  await saveDetail(page, 'fuji')
  await expect(page.locator('.detail-hero img')).toBeVisible()
  await page.clock.setSystemTime(new Date('2026-12-31T15:00:00Z'))
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.locator('.detail-hero img')).toHaveCount(0)
  await expect(page.locator('.outing-status-detail')).toContainText('確認期限を過ぎています')
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-outing')).toContainText('要確認（サンプル）')
  expect(await savedIds(page)).toEqual(['fuji'])
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(0)
})

test('withdrawn listing direct URLs cannot expose the old description or arrival details', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  await page.goto('/#/events/sample-withdrawn')
  await expect(page.getByRole('heading', { name: 'このお出かけは掲載停止中です' })).toBeVisible()
  await expect(page.locator('.screen')).not.toContainText(
    'この紹介文は掲載停止後に表示しない確認用の本文です。',
  )
  await expect(page.locator('.screen img')).toHaveCount(0)
  await page.goto('/#/events/sample-withdrawn/arrival')
  await expect(page.locator('.arrival-screen')).toContainText(
    'この下見カードは掲載を停止しています',
  )
  await expect(page.locator('.arrival-panel')).toHaveCount(0)
})

test('failed image loading shows a fallback while retaining event facts and saving controls', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  await page.route('**/images/fireworks.jpg', (route) => route.abort())
  await page.goto('/#/events/fireworks')
  await expect(page.locator('.detail-hero .outing-photo-empty')).toBeVisible()
  await expect(page.getByRole('heading', { name: '湖畔のオータム花火', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  expect(await savedIds(page)).toEqual(['fireworks'])
})
