import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { createInitialState } from '../../../src/state/model'

const name = '川辺の散歩道（架空サンプル）'
const query = { region: '京都市', theme: '自然とカフェ' }
const status = {
  demo: false,
  configured: true,
  token: 'a'.repeat(64),
  busy: false,
  maxAttempts: 3,
  attempts: [],
}
const live = {
  mode: 'live',
  query,
  retrievedAt: '2026-09-28T11:00:00.000Z',
  omitted: 0,
  spots: [
    {
      name: '検証の緑地',
      area: '京都市・架空エリア',
      summary: 'テスト用の紹介',
      matchReason: 'テスト用の理由',
      sourceUrl: 'https://kyoto.travel/en/testing-fixture',
      verification: 'unconfirmed',
    },
  ],
}
async function enter(page: Page, region = '京都府') {
  const initial = createInitialState()
  initial.onboarded = true
  initial.discover.region = region as typeof initial.discover.region
  initial.profile.area = '東京都 渋谷'
  initial.memo.questions = '送信しない相談メモ'
  initial.savedEvents = ['fuji']
  await page.addInitScript((state) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
  }, initial)
  await page.goto('/#/discover')
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill(query.theme)
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('実サーバーの無料モードを経由し、出典・保存・詳細・戻る・再読み込み・解除をつなぐ', async ({
  page,
}) => {
  let posts = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/search')) {
      posts++
      expect(r.postDataJSON()).toEqual(query)
      expect(r.postData()).not.toContain('相談メモ')
    }
  })
  await enter(page)
  expect(posts).toBe(0)
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(3)
  await expect(page.getByText('すべて架空の検索サンプルです。')).toBeVisible()
  await page.getByRole('button', { name: `${name}の出典を確認`, exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('内容・現在の営業状況は未確認')
  await expect(page.getByRole('link', { name: '出典ページを開く', exact: true })).toHaveAttribute(
    'href',
    'https://kyoto.travel/en/',
  )
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.getByRole('button', { name: `${name}を保存`, exact: true }).click()
  await page.getByRole('button', { name: `${name}の詳細を見る`, exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByText('情報の確認日ではありません', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(3)
  await expect(page.getByRole('textbox', { name: 'お出かけを検索' })).toHaveValue(query.theme)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Webで見つけた候補' })).toBeVisible()
  await page.reload()
  await page
    .locator('.saved-web-spot')
    .getByRole('button', { name: new RegExp(name.replace(/[（）]/g, '.')) })
    .first()
    .click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(
    page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: '行きたいから外す', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.saved-web-spot')).toHaveCount(0)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(saved.savedEvents).toEqual(['fuji'])
  expect(saved.profile.area).toBe('東京都 渋谷')
  expect(saved.memo.questions).toBe('送信しない相談メモ')
  expect(posts).toBe(1)
})

test('未対応地域・空欄・イベントでは検索しない', async ({ page }) => {
  let posts = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/search')) posts++
  })
  await enter(page, '東京都')
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('京都市のみ')
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByLabel('目的地の都道府県').selectOption('京都府')
  await page.getByRole('button', { name: 'この地域で探す', exact: true }).click()
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill('')
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('1〜80文字')
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill(query.theme)
  await page.getByRole('button', { name: 'イベント', exact: true }).click()
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('常設スポット')
  expect(posts).toBe(0)
})

test('同じ出典を再検索しても保存が増殖せず、保存時点の紹介を維持する', async ({ page }) => {
  await page.route('**/api/spot-search/status', (r) => r.fulfill({ json: status }))
  await page.route('**/api/spot-search/search', (r) => r.fulfill({ json: live }))
  await enter(page)
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await page.getByRole('button', { name: '検証の緑地を保存', exact: true }).click()
  await page.route('**/api/spot-search/search', (r) =>
    r.fulfill({
      json: {
        ...live,
        spots: [{ ...live.spots[0], name: '別の表記の緑地', summary: '再取得した紹介' }],
      },
    }),
  )
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.getByRole('button', { name: '別の表記の緑地を保存解除' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-web-spot')).toHaveCount(1)
  await expect(page.locator('.saved-web-spot')).toContainText('検証の緑地')
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: '検証の緑地', exact: true })).toBeVisible()
  await expect(page.getByText('テスト用の紹介', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '検証の緑地', exact: true })).toBeVisible()
})

test('キーなし・上限・利用中はPOSTしない', async ({ page }) => {
  let posts = 0
  await page.route('**/api/spot-search/search', (r) => {
    posts++
    return r.abort()
  })
  await enter(page)
  for (const [patch, message] of [
    [{ configured: false }, 'APIキーが未設定'],
    [{ attempts: [{}, {}, {}] }, '3回まで'],
    [{ busy: true }, '別の検索を実行中'],
  ] as const) {
    await page.route('**/api/spot-search/status', (r) =>
      r.fulfill({ json: { ...status, ...patch } }),
    )
    await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(message)
  }
  expect(posts).toBe(0)
})

test('0件・通信失敗・不正な応答でサンプルに置き換えず、保存済み候補を保つ', async ({ page }) => {
  await page.route('**/api/spot-search/status', (r) => r.fulfill({ json: status }))
  await page.route('**/api/spot-search/search', (r) => r.fulfill({ json: live }))
  await enter(page)
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await page.getByRole('button', { name: '検証の緑地を保存', exact: true }).click()
  await page.route('**/api/spot-search/search', (r) => r.fulfill({ json: { ...live, spots: [] } }))
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '出典のある候補が見つかりませんでした' }),
  ).toBeVisible()
  await expect(page.locator('.event-card')).toHaveCount(0)
  await page.route('**/api/spot-search/search', (r) =>
    r.fulfill({ status: 503, json: { error: '検証用の通信失敗' } }),
  )
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('検証用の通信失敗')
  await page.route('**/api/spot-search/search', (r) =>
    r.fulfill({ json: { ...live, query: { ...query, theme: '異なる条件' } } }),
  )
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('検索条件と結果が一致しません')
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.reload()
  await expect(page.locator('.saved-web-spot')).toContainText('検証の緑地')
})

test('入力を変えても取得結果の条件を明示し、連打・戻るで追加検索しない', async ({ page }) => {
  await page.route('**/api/spot-search/status', (r) => r.fulfill({ json: status }))
  let release!: () => void
  let posts = 0
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/spot-search/search', async (r) => {
    posts++
    await gate
    await r.fulfill({ json: live })
  })
  await enter(page)
  await page
    .getByRole('button', { name: 'Webで候補を探す', exact: true })
    .evaluate((el: HTMLButtonElement) => {
      el.click()
      el.click()
    })
  await expect(
    page.getByRole('button', { name: '候補を探しています…', exact: true }),
  ).toBeDisabled()
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill('別の希望')
  release()
  await expect(page.locator('.web-query-label')).toHaveText('検索した条件：京都市 ／ 自然とカフェ')
  await expect(page.getByText('下は前回の検索結果です', { exact: false })).toBeVisible()
  await expect(page.locator('.web-spot-card')).toHaveCount(1)
  expect(posts).toBe(1)
})

test('サンプルへ戻した後に遅延応答で画面を差し替えず、不正なOriginをブリッジで拒否する', async ({
  page,
  request,
}) => {
  await page.route('**/api/spot-search/status', (r) => r.fulfill({ json: status }))
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/spot-search/search', async (r) => {
    await gate
    await r.fulfill({ json: live }).catch(() => undefined)
  })
  await enter(page)
  await page.getByRole('button', { name: 'Webで候補を探す', exact: true }).click()
  await page.getByRole('button', { name: 'サンプル表示に戻る', exact: true }).click()
  release()
  await expect(page.locator('.web-search-results')).toHaveCount(0)
  const rejected = await request.post('/api/spot-search/search', {
    headers: { Origin: 'https://untrusted.example' },
    data: query,
  })
  expect(rejected.status()).toBe(403)
  // CI intentionally has no real key file. Probe an existing, harmless env file
  // so a missing file's SPA fallback cannot be confused with exposure/protection.
  const probe = `.env.discovery-check-${randomUUID()}.local`
  const marker = 'DRIVEPLUS_TEST_ONLY=public-fixture'
  await writeFile(probe, marker, { flag: 'wx', mode: 0o600 })
  try {
    const response = await request.get(`/${probe}`)
    expect(response.status()).toBe(403)
    expect((await response.text()).includes(marker)).toBe(false)
  } finally {
    await unlink(probe)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
