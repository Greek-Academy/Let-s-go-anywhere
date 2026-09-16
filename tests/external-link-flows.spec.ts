import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function enter(page: Page) {
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
}
async function addLink(page: Page, url = 'https://external.example/posts/1?section=one#details') {
  await page.getByRole('button', { name: 'SNSで見つけた場所を追加', exact: true }).click()
  await page.getByLabel('投稿のURL').fill(url)
  await page.getByLabel(/自分用のタイトル/).fill('気になった休日の候補')
  await page.getByRole('button', { name: '行きたいに追加', exact: true }).click()
}
const state = (page: Page) => page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
})

test('personal link opens only after confirmation without opener, referrer, private fields or reservation changes', async ({
  page,
  context,
}) => {
  const externalRequests: { url: string; referer?: string }[] = []
  await context.route('https://external.example/**', async (route) => {
    externalRequests.push({
      url: route.request().url(),
      referer: route.request().headers().referer,
    })
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<title>テスト用の外部ページ</title><p>外部遷移をローカルで検証しています</p>',
    })
  })
  await enter(page)
  await addLink(page)
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('driveplus.mock.v1')!)
    data.profile.name = 'PRIVATE_NAME'
    data.memo.questions = 'PRIVATE_MEMO'
    data.quiz.concerns = ['PRIVATE_CONCERN']
    data.map.providers = ['タイムズカー']
    data.savedEvents = ['fuji']
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(data))
  })
  await page.reload()
  const before = await state(page)
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await expect(page.getByRole('dialog')).toContainText('external.example')
  await expect(page.getByRole('dialog')).toContainText('内容・開催情報は未確認')
  expect(externalRequests).toEqual([])
  const anchor = page.getByRole('link', { name: '元のページを開く', exact: true })
  await expect(anchor).toHaveAttribute('rel', 'noopener noreferrer')
  const pendingPopup = page.waitForEvent('popup')
  await anchor.click()
  const popup = await pendingPopup
  await popup.waitForLoadState('domcontentloaded')
  expect(await popup.evaluate(() => window.opener)).toBeNull()
  expect(externalRequests).toEqual([
    { url: 'https://external.example/posts/1?section=one', referer: undefined },
  ])
  await popup.close()
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  expect(await state(page)).toBe(before)
  await expect(page.getByRole('button', { name: '元の投稿を確認' })).toBeFocused()
  await page.reload()
  expect(await state(page)).toBe(before)
})

test('a failed external page offers an explicit same-tab action and browser back retains filters and saved candidates', async ({
  page,
  context,
}) => {
  await context.route('https://external.example/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/html; charset=utf-8',
      body: '<h1>テスト用：ページがありません</h1>',
    }),
  )
  await enter(page)
  await addLink(page)
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('driveplus.mock.v1')!)
    data.map.providers = ['タイムズカー']
    data.discover.tag = '自然'
    data.savedEvents = ['fuji']
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(data))
  })
  await page.reload()
  const before = await state(page)
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await page.getByRole('button', { name: '開けない・アプリがないとき' }).click()
  await expect(page.getByRole('dialog')).toContainText('接続先の応答を確認していません')
  await page.getByRole('link', { name: '同じタブで開く', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'テスト用：ページがありません' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/#\/saved$/)
  expect(await state(page)).toBe(before)
  // A restored BFCache page may retain the dialog; a fresh document may close it.
  if (await page.getByRole('dialog').count())
    await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await expect(page.locator('.saved-link')).toHaveCount(1)
})

test('sample event, station, entrance and school never produce active external links', async ({
  page,
  context,
}) => {
  const requests: string[] = []
  await context.route('https://**/*', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  await enter(page)
  const cases = [
    ['/events/fuji', '公式情報を見る'],
    ['/events/fuji', '地図・アクセスを確認'],
    ['/events/fireworks', '関連SNS投稿を見る'],
    ['/stations/times-shibuya', '公式で空き状況・予約を確認'],
    ['/stations/times-shibuya', '外部地図で行き方を見る'],
    ['/events/fuji/arrival', '車入口の地図案内を確認（デモ）'],
  ]
  for (const [path, name] of cases) {
    await page.goto('/#' + path)
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('この掲載情報はサンプルです')
    await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toContainText('予約・問い合わせは完了しません')
    await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  }
  await page.goto('/#/schools')
  await page.locator('.school-card').first().getByRole('button', { name: '詳細を見る' }).click()
  await page.getByRole('button', { name: '公式情報を確認', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
  expect(requests).toEqual([])
})

test('legacy HTTP and corrupted saved URLs are retained but cannot be activated', async ({
  page,
}) => {
  await enter(page)
  await addLink(page, 'http://example.org/old-post')
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await expect(page.getByRole('dialog')).toContainText('このURLは開けません')
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('driveplus.mock.v1')!)
    data.links[0].url = 'javascript:alert(1)'
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(data))
  })
  await page.reload()
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
  expect(JSON.parse((await state(page))!).links).toHaveLength(1)
})

test('links participate in the phone dialog focus trap and long destinations fit enlarged narrow screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await enter(page)
  await page.goto('/#/settings')
  await page.getByRole('switch', { name: /文字を少し大きくする/ }).check()
  await page.goto('/#/saved')
  await addLink(page, 'https://external.example/' + 'long-'.repeat(60))
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await expect(page.getByRole('button', { name: '閉じる', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '元のページを開く', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '閉じる', exact: true })).toBeFocused()
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '元の投稿を確認' })).toBeFocused()
})
