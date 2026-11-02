import { test, expect, type Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
import { parseWebSearchResult } from '../../../src/domain/webSearch'
import { driveQuery, driveTheme } from '../../../src/domain/driveSearch'
// @ts-expect-error Node-only synthetic provider; never calls an external API.
import { runComparison } from '../../spot-comparison/providers.mjs'

const hobbies = ['自然', 'グルメ', '温泉']
const drive = driveQuery('default', undefined, hobbies)
const query = { stationId: '1130208', region: '東京都 新宿駅周辺', theme: driveTheme(drive), drive }
const status = {
  demo: true,
  configured: true,
  searchProvider: 'brave',
  busy: false,
  token: 'a'.repeat(64),
  maxAttempts: null,
  attempts: [],
}
async function enter(page: Page) {
  const state = createInitialState()
  state.onboarded = true
  state.profile.interests = hobbies
  state.discover.region = 'station'
  state.discover.stationId = query.stationId
  await page.addInitScript((s) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(s))
  }, state)
  await page.route('**/api/spot-search/comparison-status', (r) => r.fulfill({ json: status }))
  await page.goto('/#/discover')
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('BraveとGeminiの検索画面', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})

test('BraveとGeminiのカード・趣味・所要時間・出典・保存を既存画面で使える', async ({ page }) => {
  let requests = 0
  const result = await runComparison({ query, demo: true, searchProvider: 'brave' })
  await page.route('**/api/spot-search/compare', (r) => {
    requests++
    expect(r.request().postDataJSON()).toEqual(query)
    return r.fulfill({ json: result })
  })
  await enter(page)
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  for (const hobby of hobbies)
    await expect(page.locator('.web-spot-hobby').filter({ hasText: hobby }).first()).toBeVisible()
  await expect(page.locator('.web-spot-card').first()).toContainText('車で片道')
  await expect(page.locator('iframe[title="Google検索の関連候補"]')).toHaveCount(0)
  await expect(page.locator('.comparison-providers')).toHaveCount(0)
  const first = result.spots[0].name
  await page.getByRole('button', { name: `${first}の詳細を見る`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Geminiの提案理由' })).toBeVisible()
  await expect(page.getByRole('link', { name: `${first}のGeminiの出典を確認` })).toHaveAttribute(
    'href',
    result.spots[0].sourceUrl,
  )
  await expect(page.getByRole('link', { name: `${first}のGeminiの出典を確認` })).toHaveAttribute(
    'target',
    '_blank',
  )
  await expect(page.locator('iframe[title="Google検索の関連候補"]')).toHaveCount(0)
  await page
    .locator('.detail-body')
    .getByRole('button', { name: '行きたいに保存', exact: true })
    .click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await expect(page.locator('.saved-web-spot')).toHaveCount(1)
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: 'Geminiの提案理由' })).toBeVisible()
  const stored = await page.evaluate(() => localStorage.getItem('driveplus.mock.v1')!)
  expect(stored).not.toContain('searchAttribution')
  expect(requests).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Braveの検索元を区別し、Google検索の出典欠落を見逃さない', async () => {
  const result = await runComparison({ query, demo: true, searchProvider: 'brave' })
  expect((await parseWebSearchResult(result, query)).searchBackend).toBe('brave')
  const missing = { ...result, searchBackend: undefined }
  await expect(parseWebSearchResult(missing, query)).rejects.toThrow('Google検索の出典情報')
  await expect(
    parseWebSearchResult({ ...result, searchBackend: 'unknown' }, query),
  ).rejects.toThrow()
  await expect(
    parseWebSearchResult({ ...result, searchAttribution: { html: '<div>Google</div>' } }, query),
  ).rejects.toThrow()
})

test('Braveのキー不足とAPIエラーを候補ゼロと区別し、操作したときだけ再検索する', async ({
  page,
}) => {
  let requests = 0
  const result = await runComparison({
    query,
    searchProvider: 'brave',
    braveApiKey: 'test',
    geminiApiKey: 'test',
    fetcher: async () => Response.json({}, { status: 429 }),
  })
  await page.route('**/api/spot-search/compare', (r) => {
    requests++
    return r.fulfill({ json: { ...result, mode: 'sample' } })
  })
  await enter(page)
  await page.route('**/api/spot-search/comparison-status', (r) =>
    r.fulfill({ json: { ...status, configured: false } }),
  )
  const search = page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true })
  await search.click()
  await expect(page.getByRole('alert')).toContainText('Brave SearchとGeminiの接続準備中')
  expect(requests).toBe(0)
  await page.route('**/api/spot-search/comparison-status', (r) => r.fulfill({ json: status }))
  await search.click()
  await expect(page.getByRole('heading', { name: '検索を完了できませんでした' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Brave Searchの利用枠')
  await expect(page.getByText('この条件の候補はありません')).toHaveCount(0)
  expect(requests).toBe(1)
  const completed = await runComparison({ query, demo: true, searchProvider: 'brave' })
  await page.route('**/api/spot-search/compare', (r) => {
    requests++
    return r.fulfill({ json: completed })
  })
  await search.click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(requests).toBe(2)
})

test('接続先がGoogle検索の場合はBrave結果を受け入れない', async ({ page }) => {
  const result = await runComparison({ query, demo: true, searchProvider: 'brave' })
  await page.route('**/api/spot-search/compare', (r) => r.fulfill({ json: result }))
  await enter(page)
  await page.route('**/api/spot-search/comparison-status', (r) =>
    r.fulfill({ json: { ...status, searchProvider: 'gemini' } }),
  )
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('検索元と接続先が一致しません')
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
})
