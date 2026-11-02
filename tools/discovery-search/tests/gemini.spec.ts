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
  searchProvider: 'gemini',
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
    await info.attach('Gemini検索の画面', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})

test('Gemini単独のカード・趣味・所要時間・出典・保存を既存画面で使える', async ({ page }) => {
  let requests = 0
  const result = await runComparison({ query, demo: true, searchProvider: 'gemini' })
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
  const frame = page.frameLocator('iframe[title="Google検索の関連候補"]')
  await expect(frame.getByText('Google検索の関連候補（架空サンプル）')).toBeVisible()
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
  await expect(frame.getByText('Google検索の関連候補（架空サンプル）')).toBeVisible()
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

test('Googleの検索候補HTMLのスクリプト・アプリへのアクセス・CSS漏れを防ぐ', async ({ page }) => {
  const result = await runComparison({ query, demo: true, searchProvider: 'gemini' })
  result.searchAttribution.html =
    '<style>body {background: rgb(255, 0, 0)} button {display:none}</style><div>検索候補の表示</div><script>document.body.dataset.executed="yes";parent.document.body.dataset.executed="yes"</script><a href="https://www.google.com/search?q=test">関連する検索</a>'
  await page.route('**/api/spot-search/compare', (r) => r.fulfill({ json: result }))
  await enter(page)
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  const iframe = page.locator('iframe[title="Google検索の関連候補"]')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox')
  const frame = page.frameLocator('iframe[title="Google検索の関連候補"]')
  await expect(frame.getByText('検索候補の表示')).toBeVisible()
  await expect(frame.locator('body')).not.toHaveAttribute('data-executed', 'yes')
  expect(
    await page.evaluate(() => ({
      executed: document.body.dataset.executed,
      color: getComputedStyle(document.body).backgroundColor,
    })),
  ).toEqual({ executed: undefined, color: expect.not.stringMatching('rgb\\(255, 0, 0\\)') })
  await expect(
    page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }),
  ).toBeVisible()
})

test('キー不足とクレジットエラーを表示し他社へ切り替えない', async ({ page }) => {
  let requests = 0
  const result = await runComparison({
    query,
    searchProvider: 'gemini',
    geminiApiKey: 'test',
    fetcher: async () => Response.json({}, { status: 402 }),
  })
  await page.route('**/api/spot-search/compare', (r) => {
    requests++
    return r.fulfill({ json: { ...result, mode: 'sample' } })
  })
  await enter(page)
  await page.route('**/api/spot-search/comparison-status', (r) =>
    r.fulfill({ json: { ...status, configured: false } }),
  )
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Geminiの接続準備中')
  expect(requests).toBe(0)
  await page.route('**/api/spot-search/comparison-status', (r) => r.fulfill({ json: status }))
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Geminiのクレジット残高')
  await expect(page.getByRole('heading', { name: '検索を完了できませんでした' })).toBeVisible()
  await expect(page.getByText('この条件の候補はありません')).toHaveCount(0)
  expect(requests).toBe(1)
})

test('検索未実行を候補ゼロと区別し、手動再検索で復帰できる', async ({ page }) => {
  let requests = 0
  const completed = await runComparison({ query, demo: true, searchProvider: 'gemini' })
  const failed = {
    ...completed,
    spots: [],
    searchAttribution: undefined,
    reports: [
      {
        ...completed.reports[0],
        state: 'failed',
        count: 0,
        error: 'Web検索の実行を確認できませんでした。',
      },
    ],
  }
  await page.route('**/api/spot-search/compare', (r) => {
    requests++
    return r.fulfill({ json: requests === 1 ? failed : completed })
  })
  await enter(page)
  const search = page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true })
  await search.click()
  await expect(page.getByRole('heading', { name: '検索を完了できませんでした' })).toBeVisible()
  await expect(page.getByText('この条件の候補はありません')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('Web検索の実行を確認できませんでした')
  expect(requests).toBe(1)
  await search.click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.getByText('検索を完了できませんでした')).toHaveCount(0)
  expect(requests).toBe(2)
})

test('検索が成功して候補ゼロの場合は条件変更を案内する', async ({ page }) => {
  const result = await runComparison({ query, demo: true, searchProvider: 'gemini' })
  result.spots = []
  result.reports[0].count = 0
  await page.route('**/api/spot-search/compare', (r) => r.fulfill({ json: result }))
  await enter(page)
  await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'この条件の候補はありません' })).toBeVisible()
  await expect(page.getByText('検索を完了できませんでした')).toHaveCount(0)
})

test('Geminiの実行記録と出典表示を検証し既存2社の結果も引き続き読める', async () => {
  const result = await runComparison({ query, demo: true, searchProvider: 'gemini' })
  result.reports[0].usage = {
    inputTokens: 10,
    outputTokens: 20,
    searchCalls: 1,
    estimatedUsd: null,
    pricingDate: null,
  }
  expect((await parseWebSearchResult(result, query)).spots).toHaveLength(10)
  const missing = structuredClone(result)
  delete missing.searchAttribution
  await expect(parseWebSearchResult(missing, query)).rejects.toThrow('Google検索の出典情報')
  await expect(
    parseWebSearchResult({ ...result, reports: [result.reports[0], result.reports[0]] }, query),
  ).rejects.toThrow()
  const legacy = await runComparison({ query, demo: true })
  expect((await parseWebSearchResult(legacy, query)).reports).toHaveLength(2)
})
