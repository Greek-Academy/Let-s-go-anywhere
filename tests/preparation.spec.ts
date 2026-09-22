import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { showAllRegions } from './helpers/discovery'

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
})
async function enter(page: Page, route = '/discover') {
  await page.clock.install({ time: new Date('2026-09-14T03:00:00Z') })
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  await page.goto(`/#${route}`)
}
async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
}
async function setConditions(page: Page) {
  await page.getByLabel('お出かけ日').fill('2026-09-19')
  await page.getByLabel('出発時刻', { exact: true }).fill('09:00')
  await page.getByLabel('帰宅希望時刻').fill('18:00')
  await page.getByLabel('1人あたりの予算（円）').fill('8000')
  await page.getByRole('button', { name: '夜間', exact: true }).click()
  await page.getByRole('button', { name: '条件を保存', exact: true }).click()
}

test('arrival preview distinguishes entrances, preserves saved origin and opens only a demo map', async ({
  page,
}, info) => {
  await enter(page, '/events/fuji')
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.locator('.saved-outing').first().getByRole('button').first().click()
  await page.getByRole('button', { name: /最後の500mを、見ておこう/ }).click()
  await expect(page).toHaveURL(/\/events\/fuji\/arrival$/)
  await expect(
    page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('img', { name: /架空の配置例/ })).toBeVisible()
  await expect(page.locator('.arrival-screen')).toContainText('車の進入先ではありません')
  await expect(page.locator('.arrival-photo-empty')).toContainText('掲載できる写真はありません')
  await page.locator('#app-scroll').evaluate((el) => {
    el.scrollTop = 0
  })
  await info.attach('下見カード・入口の区別', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  })
  await page.getByRole('button', { name: '車入口の地図案内を確認（デモ）' }).click()
  await expect(page.getByRole('dialog')).toContainText('第1駐車場・車入口（架空）')
  await page.getByRole('button', { name: 'アプリに戻る' }).click()
  await expect(page.locator('.arrival-steps li')).toHaveCount(4)
  await expect(page.locator('.arrival-row').filter({ hasText: '支払い方法' })).toContainText(
    '未確認',
  )
  await page.getByRole('button', { name: 'お出かけ詳細に戻る' }).click()
  await expect(page).toHaveURL(/\/events\/fuji$/)
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page).toHaveURL(/\/saved/)
})

test('unknown and expired entrances never produce a vehicle map or stale description', async ({
  page,
}) => {
  await enter(page, '/events/fireworks/arrival')
  await expect(page.locator('.arrival-screen')).toContainText('未確認')
  await expect(page.getByRole('button', { name: '車入口の地図案内を確認（デモ）' })).toHaveCount(0)
  await expect(page.locator('.entrance-diagram')).toHaveCount(0)
  await page.goto('/#/events/forest/arrival')
  await expect(page.locator('.arrival-screen')).toContainText('更新待ち')
  await expect(page.locator('.arrival-screen')).not.toContainText('旧入口の位置')
  await expect(page.getByRole('button', { name: '車入口の地図案内を確認（デモ）' })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.arrival-screen')).toContainText('更新待ち')
  await page.goto('/#/events/fuji')
  await page.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  await page.clock.setSystemTime(new Date('2027-01-01T03:00:00Z'))
  await page.goto('/#/saved')
  await page.locator('.saved-outing').getByRole('button').first().click()
  await page.getByRole('button', { name: /最後の500mを、見ておこう/ }).click()
  await expect(page.locator('.arrival-screen')).toContainText('更新待ち')
  await expect(page.getByRole('button', { name: '車入口の地図案内を確認（デモ）' })).toHaveCount(0)
  await expect(page.locator('.arrival-screen')).not.toContainText('湖側の道路に面した')
})

test('trip filters separate confirmed, unknown and conflicting candidates and re-evaluate when origin changes', async ({
  page,
}, info) => {
  await enter(page)
  await showAllRegions(page)
  const original = await state(page)
  await page.getByRole('button', { name: /今回のお出かけ条件/ }).click()
  await setConditions(page)
  await page.getByRole('button', { name: '確認済みで合う 1', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(1)
  await expect(page.locator('.event-card')).toContainText('おいしいコーヒー')
  await page.getByRole('button', { name: /条件の理由を見る/ }).click()
  await expect(page.getByRole('dialog')).toContainText('16:00')
  await expect(page.getByRole('dialog')).toContainText('4,000〜6,000円')
  await info.attach('今回の条件・根拠', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  })
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.getByRole('button', { name: '合わない 1', exact: true }).click()
  await page.getByRole('button', { name: /条件の理由を見る/ }).click()
  await expect(page.getByRole('dialog')).toContainText('想定経路に夜間を含む')
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.getByRole('button', { name: '未確認 4', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(4)
  await page.reload()
  await expect(page.locator('.event-card')).toHaveCount(4)
  expect((await state(page)).profile).toEqual(original.profile)
  expect((await state(page)).quiz).toEqual(original.quiz)
  await page.getByRole('button', { name: '確認済みで合う 1', exact: true }).click()
  await page.locator('.location-select').click()
  await page.getByLabel('駅名・地域名').fill('東京・新宿駅周辺')
  await page.getByRole('button', { name: '出発エリアを保存' }).click()
  await expect(page.locator('.event-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '未確認 6', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '未確認 6', exact: true }).click()
  await expect(page.locator('.event-card')).toHaveCount(6)
})

test('outing-specific conditions do not change search or another outing; cancel, validation and clearing work', async ({
  page,
}) => {
  await enter(page, '/events/fuji')
  await page.getByRole('button', { name: /このお出かけの条件/ }).click()
  await page.getByLabel('出発時刻', { exact: true }).fill('18:00')
  await page.getByLabel('帰宅希望時刻').fill('09:00')
  await page.getByRole('button', { name: '条件を保存', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('帰宅時刻は出発時刻より後')
  expect((await state(page)).outingConditions).toEqual({})
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.getByRole('button', { name: /このお出かけの条件/ }).click()
  await expect(page.getByLabel('出発時刻', { exact: true })).toHaveValue('')
  await setConditions(page)
  await page.reload()
  expect((await state(page)).outingConditions.fuji.avoid).toEqual(['夜間'])
  expect((await state(page)).searchConditions.avoid).toEqual([])
  await page.goto('/#/events/coast')
  await page.getByRole('button', { name: /このお出かけの条件/ }).click()
  await expect(page.getByLabel('お出かけ日')).toHaveValue('')
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.goto('/#/events/fuji')
  await page.getByRole('button', { name: /このお出かけの条件/ }).click()
  await page.getByRole('button', { name: 'この条件を解除', exact: true }).click()
  await expect(page.locator('.condition-results')).toHaveCount(0)
})

test('SNS post identity detects legacy-domain duplicates and retains invalid input without network requests', async ({
  page,
}) => {
  await enter(page, '/saved')
  const outside: string[] = []
  page.on('request', (r) => {
    if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) outside.push(r.url())
  })
  const open = () =>
    page.getByRole('button', { name: 'SNSで見つけた場所を追加', exact: true }).click()
  const submit = () => page.getByRole('button', { name: '行きたいに追加', exact: true }).click()
  await open()
  await page
    .getByLabel('投稿のURL')
    .fill('https://twitter.com/sample/status/12345?s=20&utm_source=share')
  await page.getByLabel(/自分用のタイトル/).fill('次の休日の候補')
  await submit()
  await open()
  await page.getByLabel('投稿のURL').fill('https://x.com/sample/status/12345/photo/1?t=tracking')
  await submit()
  await expect(page.getByRole('alert')).toContainText('すでに保存されています')
  await expect(page.getByLabel('投稿のURL')).toHaveValue(
    'https://x.com/sample/status/12345/photo/1?t=tracking',
  )
  await page.getByRole('button', { name: '保存済みリンクを見る' }).click()
  await expect(page.locator('.saved-link')).toHaveCount(1)
  await open()
  await page.getByLabel('投稿のURL').fill('javascript:alert(1)')
  await page.getByLabel(/自分用のタイトル/).fill('消えないメモ')
  await submit()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel(/自分用のタイトル/)).toHaveValue('消えないメモ')
  await page.getByLabel('投稿のURL').fill('https://vm.tiktok.com/unresolved-short-link/')
  await submit()
  await expect(page.locator('.saved-link')).toHaveCount(2)
  await expect(page.getByText('内容未確認', { exact: true })).toHaveCount(2)
  await page.reload()
  expect((await state(page)).links).toHaveLength(2)
  expect(outside).toEqual([])
})

test('new screens fit narrow phones and enlarged text, with usable sheet keyboard focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await enter(page, '/settings')
  await page.getByRole('switch', { name: /文字を少し大きくする/ }).check()
  for (const route of [
    '/events/fuji/arrival',
    '/events/forest/arrival',
    '/events/fuji',
    '/discover',
  ]) {
    await page.goto(`/#${route}`)
    const metrics = await page.locator('#app-scroll').evaluate((el) => ({
      width: el.clientWidth,
      scroll: el.scrollWidth,
      body: document.documentElement.scrollHeight,
      height: innerHeight,
    }))
    expect(metrics.scroll, route).toBeLessThanOrEqual(metrics.width + 1)
    expect(metrics.body, route).toBeLessThanOrEqual(metrics.height)
  }
  await page.getByRole('button', { name: /今回のお出かけ条件/ }).click()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'この条件を解除', exact: true })).toBeFocused()
  const sheet = await page.getByRole('dialog').boundingBox()
  expect(sheet!.width).toBeLessThanOrEqual(320)
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await expect(page.getByRole('button', { name: /今回のお出かけ条件/ })).toBeFocused()
})
