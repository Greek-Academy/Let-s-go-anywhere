import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink, realpath } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
const first = 'サンプル01・小さな喫茶店'
async function enter(page: Page) {
  const s = createInitialState()
  s.onboarded = true
  s.discover.region = '東京都'
  s.discover.search = '自然とカフェ'
  s.memo.questions = '共有しない不安のメモ'
  await page.addInitScript((initial) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(initial))
  }, s)
  await page.goto('/#/discover')
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('比較検索の画面', { body: await page.screenshot(), contentType: 'image/png' })
})
test('2社の18候補→提案元フィルター→出典→保存→好み順→詳細→再読込を追加検索なしで操作', async ({
  page,
}) => {
  let requests = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) {
      requests++
      expect(r.postDataJSON()).toEqual({ region: '東京都', theme: '自然とカフェ' })
    }
  })
  await enter(page)
  await expect(page.getByLabel('検索方法', { exact: true })).toHaveValue('comparison')
  expect(requests).toBe(0)
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(18)
  await expect(page.getByText('重なった提案2件をまとめました。')).toBeVisible()
  await page.getByRole('button', { name: 'Claude 10', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await page.getByRole('button', { name: 'すべて 18', exact: true }).click()
  await page.getByRole('button', { name: `${first}のClaudeの出典を確認`, exact: true }).click()
  await expect(page.getByRole('link', { name: '出典ページを開く' })).toHaveAttribute(
    'href',
    'https://example.com/shops/1',
  )
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.getByRole('button', { name: `${first}を保存`, exact: true }).click()
  const card = page
    .locator('.web-spot-card')
    .filter({ has: page.getByRole('heading', { name: first, exact: true }) })
  await card.getByRole('button', { name: 'コーヒー', exact: true }).click()
  await expect(card.getByRole('button', { name: 'コーヒー', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await page.getByRole('button', { name: '好みに寄せたおすすめ', exact: true }).click()
  await expect(page.locator('.preference-summary')).toContainText('カフェ（1件）')
  await expect(page.locator('.preference-summary')).not.toContainText('コーヒー')
  await page.getByRole('button', { name: `${first}の詳細を見る`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'OpenAIの提案理由' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Claudeの提案理由' })).toBeVisible()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(18)
  await expect(
    page.getByRole('button', { name: '好みに寄せたおすすめ', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await expect(page.locator('.saved-web-spot')).toHaveCount(1)
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: first, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'このいいねを好み順に使わない', exact: true }).click()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(stored.savedWebSpots[0].likedFor).toEqual([])
  expect(stored.memo.questions).toBe('共有しない不安のメモ')
  expect(requests).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('不足キー・1回上限・地域未指定で比較POSTせず、入力変更も自動検索しない', async ({ page }) => {
  await enter(page)
  let posts = 0
  await page.route('**/api/spot-search/compare', (r) => {
    posts++
    return r.abort()
  })
  for (const [config, message] of [
    [{ configured: false, attempts: [] }, '両方のAPIキー'],
    [{ configured: true, attempts: [{}] }, '1回まで'],
  ] as const) {
    await page.route('**/api/spot-search/comparison-status', (r) =>
      r.fulfill({
        json: { demo: false, busy: false, token: 'a'.repeat(64), maxAttempts: 1, ...config },
      }),
    )
    await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(message)
  }
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill('別の希望')
  expect(posts).toBe(0)
})
test('片方の失敗・件数不足を明示し、残った候補で保存と詳細を使える', async ({ page }) => {
  await enter(page)
  await page.route('**/api/spot-search/compare', async (r) => {
    const response = await r.fetch()
    const data = await response.json()
    data.spots = data.spots
      .filter((s: { recommendations: { provider: string }[] }) =>
        s.recommendations.some((p) => p.provider === 'openai'),
      )
      .map((s: { recommendations: { provider: string }[] }) => ({
        ...s,
        recommendations: s.recommendations.filter((p) => p.provider === 'openai'),
      }))
    data.reports[1] = { ...data.reports[1], state: 'failed', count: 0, error: '検証用の通信失敗' }
    data.duplicates = 0
    await r.fulfill({ json: data })
  })
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.getByRole('alert')).toContainText('Claude：検証用の通信失敗')
  await expect(page.getByText('今回は10件です', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: `${first}を保存`, exact: true }).click()
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill('違う条件')
  await expect(page.getByText('下は前回の検索結果です', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: `${first}の詳細を見る`, exact: true }).click()
  await expect(page.getByRole('button', { name: '行きたいに保存済み', exact: true })).toBeVisible()
})

test('検索結果を再読み込み後に無料で開き直せる。比較検索POSTは増えない', async ({ page }) => {
  let posts = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) posts++
  })
  await enter(page)
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(18)
  await page.reload()
  await page.getByRole('button', { name: '前回の比較結果を開く（無料）', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(18)
  expect(posts).toBe(1)
})

test('Mac内の比較結果・台帳は開発サーバーの直接URLから配信しない', async ({ request }) => {
  await mkdir('.local-research', { recursive: true, mode: 0o700 })
  const file = `.local-research/probe-${randomUUID()}.json`
  const marker = 'private-comparison-fixture-only'
  await writeFile(file, JSON.stringify({ marker }), { mode: 0o600, flag: 'wx' })
  try {
    const path = await realpath(file)
    for (const url of [`/${file}`, `/@fs/${path}`]) {
      const response = await request.get(url)
      expect(response.status()).toBe(403)
      expect(await response.text()).not.toContain(marker)
    }
  } finally {
    await unlink(file)
  }
})
