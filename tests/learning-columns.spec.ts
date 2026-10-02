import { expect, test } from './support/mapFixture'
import type { Page } from '@playwright/test'

const titles = [
  '借りた車、走り出す前にどこを見る？',
  '目的地と、車の入口は同じとは限らない',
  '曲がり損ねたら、予定を直せばいい',
  'ナビの準備は、走り出す前に',
  '全部ひとりで頑張らなくてもいい',
  '「いま集中するね」を、ふたりの合図に',
]
async function enter(page: Page) {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  await page.getByRole('navigation').getByRole('button', { name: '学ぶ', exact: true }).click()
}
async function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1') || '{}'))
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})

test('columns switch genres, retain selection on back/reload and preserve scroll/focus', async ({
  page,
}) => {
  await enter(page)
  const genres = page.getByRole('group', { name: 'コラムのジャンル' })
  await expect(page.locator('.column-card')).toHaveCount(7)
  for (const [index, name] of ['出発前の準備', '道中の判断', '同乗者との過ごし方'].entries()) {
    await genres.getByRole('button', { name, exact: true }).click()
    await expect(genres.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('.column-card')).toHaveCount(2)
    await expect(page.locator('.column-card')).toContainText(titles.slice(index * 2, index * 2 + 2))
  }
  const card = page.getByRole('button', { name: `${titles[5]}を読む`, exact: true })
  await card.scrollIntoViewIfNeeded()
  const scroll = await page.locator('#app-scroll').evaluate((el) => el.scrollTop)
  await card.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles[5])
  await expect(
    page.getByRole('navigation').getByRole('button', { name: '学ぶ', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'コラム一覧へ戻る', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn\?genre=companions$/)
  await expect(card).toBeFocused()
  expect(
    Math.abs((await page.locator('#app-scroll').evaluate((el) => el.scrollTop)) - scroll),
  ).toBeLessThan(15)
  await page.reload()
  await expect(
    genres.getByRole('button', { name: '同乗者との過ごし方', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.column-card')).toHaveCount(2)
  await genres.getByRole('button', { name: 'すべて', exact: true }).click()
  await expect(page.locator('.column-card')).toHaveCount(7)
})

test('all six columns have complete readable bodies; reading does not award quiz or learning results', async ({
  page,
}) => {
  const externalRequests: string[] = []
  await enter(page)
  const before = await readState(page)
  const origin = new URL(page.url()).origin
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) externalRequests.push(request.url())
  })
  for (const title of titles) {
    await page.getByRole('button', { name: `${title}を読む`, exact: true }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.locator('.column-body-section')).toHaveCount(3)
    await expect(page.locator('.column-preparation li')).toHaveCount(2)
    await expect(page.locator('.column-article')).toContainText('試作・未監修')
    await expect(page.locator('.column-article')).not.toContainText(
      /運転準備度|65%|一般道は問題なし|安全に運転できる|信号待ちでも法律上は原則不可/,
    )
    await expect
      .poll(() =>
        page.locator('.column-hero').evaluate((el) => (el as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0)
    await page.getByRole('button', { name: '戻る', exact: true }).click()
  }
  const after = await readState(page)
  expect(after).toEqual(before)
  expect(externalRequests).toEqual([])
  await page.getByRole('button', { name: `${titles[3]}を読む`, exact: true }).click()
  const source = page.getByRole('link', { name: /警察庁/ })
  await expect(source).toHaveAttribute(
    'href',
    'https://www.npa.go.jp/bureau/traffic/keitai/info.html',
  )
  await page
    .context()
    .route('https://www.npa.go.jp/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Reference fixture</title>' }),
    )
  const popup = page.waitForEvent('popup')
  await source.click()
  const referencePage = await popup
  await referencePage.waitForLoadState()
  await expect(referencePage).toHaveTitle('Reference fixture')
  await referencePage.close()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles[3])
})

test('direct detail has a useful back fallback, and invalid column/genre recover', async ({
  page,
}) => {
  await page.goto('/#/learn/columns/parking-entrance')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(titles[1])
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page).toHaveURL(/#\/learn\?genre=preparation$/)
  await expect(page.locator('.column-card')).toHaveCount(2)
  await page.goto('/#/learn?genre=unknown')
  await expect(page.locator('.column-card')).toHaveCount(7)
  await expect(
    page
      .getByRole('group', { name: 'コラムのジャンル' })
      .getByRole('button', { name: 'すべて', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/#/learn/columns/missing')
  await expect(page.getByRole('heading', { name: 'コラムが見つかりません' })).toBeVisible()
  await page.getByRole('button', { name: 'コラム一覧へ', exact: true }).click()
  await expect(page.locator('.column-card')).toHaveCount(7)
})

test('320px with larger text still fits, scrolls and reaches the article return', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 680 })
  await enter(page)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('driveplus.mock.v1') || '{}')
    state.settings.largeText = true
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
  })
  await page.reload()
  await expect(page.locator('.mobile-frame')).toHaveClass(/large-text/)
  await page
    .getByRole('group', { name: 'コラムのジャンル' })
    .getByRole('button', { name: '道中の判断', exact: true })
    .click()
  await page.getByRole('button', { name: `${titles[2]}を読む`, exact: true }).click()
  await page.getByRole('heading', { name: '次のお出かけ前に' }).scrollIntoViewIfNeeded()
  expect(await page.locator('#app-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(400)
  expect(await page.locator('#app-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'コラム一覧へ戻る', exact: true }).click()
  await expect(page.locator('.column-card')).toHaveCount(2)
  expect(await page.locator('#app-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
})
