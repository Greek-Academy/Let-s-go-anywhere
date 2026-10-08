import { test, expect } from '@playwright/test'
import type { Page, APIRequestContext } from '@playwright/test'
// Same provider envelopes as the offline comparison tests. No paid services.
// @ts-expect-error Existing JavaScript comparison fixtures are not a public TypeScript API.
import { runComparison } from '../../spot-comparison/providers.mjs'

const code = 'T'.repeat(43)
const password = 'Example-only-password-123!'
const authEndpoint = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/'
async function account(request: APIRequestContext) {
  const email = `dogfood-${crypto.randomUUID()}@example.test`
  const created = await (
    await request.post(`${authEndpoint}accounts:signUp?key=demo`, {
      data: { email, password, returnSecureToken: true },
    })
  ).json()
  expect(
    (
      await request.post(`${authEndpoint}accounts:update?key=demo`, {
        headers: { Authorization: 'Bearer owner' },
        data: { localId: created.localId, emailVerified: true },
      })
    ).ok(),
  ).toBeTruthy()
  return email
}
async function login(page: Page, email: string) {
  await page.getByLabel('メールアドレス', { exact: true }).fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click()
  await expect(page.getByLabel('参加コード', { exact: true })).toBeVisible()
}
async function participate(page: Page) {
  await page.getByLabel('参加コード', { exact: true }).fill(code)
  await page.getByLabel('検索条件の送信・保存と、利用回数を確認しました').check()
  await page.getByRole('button', { name: '参加して見つけるへ' }).click()
  await expect(page).toHaveURL(/#\/discover$/)
}

test.beforeEach(async ({ context }) => {
  await context.route(
    /https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com/,
    (route) => route.abort(),
  )
  await context.route(/https:\/\/api\.(openai|anthropic)\.com/, (route) => route.abort())
})
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('確認画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('invited tester logs in, searches, saves and ranks; logout/reload isolate private cached results', async ({
  page,
  context,
  request,
}) => {
  const results = new Map<string, unknown>()
  const calls: string[] = []
  await context.route('http://127.0.0.1:8787/api/spot-search/**', async (route) => {
    const headers = route.request().headers()
    const token = headers.authorization?.slice(7)
    expect(token).toBeTruthy()
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expect(claims.aud).toBe('demo-driveplus')
    const uid = claims.sub as string
    if (headers['x-test-code'] !== code)
      return route.fulfill({ status: 403, json: { error: '参加コードを確認してください。' } })
    const path = new URL(route.request().url()).pathname.split('/').at(-1)
    if (path === 'comparison-status')
      return route.fulfill({
        json: {
          kind: 'comparison',
          demo: false,
          configured: true,
          enabled: true,
          busy: false,
          maxAttempts: 1,
          attempts: results.has(uid) ? [{ state: 'completed' }] : [],
          globalRemaining: 3 - results.size,
        },
      })
    if (path === 'comparison-result')
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(results.get(uid) ?? null),
      })
    if (path === 'compare') {
      if (results.has(uid)) return route.fulfill({ status: 429, json: { error: '利用上限です。' } })
      calls.push(uid)
      const result = await runComparison({ demo: true, query: route.request().postDataJSON() })
      result.mode = 'live'
      results.set(uid, result)
      return route.fulfill({ json: result })
    }
    throw new Error('Unexpected API path')
  })
  const email = await account(request)
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  await page.getByRole('button', { name: 'AI検索の参加・ログイン', exact: true }).click()
  await login(page, email)
  await page.getByLabel('参加コード', { exact: true }).fill('W'.repeat(43))
  await page.getByLabel('検索条件の送信・保存と、利用回数を確認しました').check()
  await page.getByRole('button', { name: '参加して見つけるへ' }).click()
  await expect(page.getByRole('alert')).toContainText('参加コードを確認')
  expect(calls).toHaveLength(0)
  await participate(page)
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /^地域を指定する/ }).click()
  await page.getByLabel('目的地の都道府県').selectOption('京都府')
  await page.getByRole('button', { name: 'この地域で探す' }).click()
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill('自然とカフェ')
  await page.getByRole('button', { name: 'Webで候補を探す' }).click()
  await expect(page.getByText('18件のお店・スポット候補', { exact: true })).toBeVisible()
  expect(calls).toHaveLength(1)
  await page.getByRole('button', { name: 'サンプル01・小さな喫茶店を保存', exact: true }).click()
  await page.getByRole('button', { name: '好みに寄せたおすすめ', exact: true }).click()
  await expect(page.getByText('参考にしている特徴', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'サンプル01・小さな喫茶店の詳細を見る', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'サンプル01・小さな喫茶店', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await page.getByRole('button', { name: 'Webで候補を探す' }).click()
  await expect(page.getByText(/今回の比較検索は1回まで/)).toBeVisible()
  expect(calls).toHaveLength(1)
  await page.getByRole('button', { name: '前回の比較結果を開く（無料）' }).click()
  await expect(page.getByText('18件のお店・スポット候補', { exact: true })).toBeVisible()
  // Changing account must clear results and the in-memory participation grant.
  await page.getByRole('button', { name: 'AI検索の参加・ログイン', exact: true }).click()
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await login(page, await account(request))
  await participate(page)
  await page.getByRole('button', { name: '前回の比較結果を開く（無料）' }).click()
  await expect(page.getByText(/開ける結果がありません/)).toBeVisible()
  await expect(page.getByText('18件のお店・スポット候補', { exact: true })).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: '前回の比較結果を開く（無料）' }).click()
  await expect(page.getByText(/メール確認と参加コードの入力をしてください/)).toBeVisible()
  await page.getByRole('button', { name: 'AI検索の参加・ログイン', exact: true }).click()
  await login(page, email)
  await participate(page)
  await page.getByRole('button', { name: '前回の比較結果を開く（無料）' }).click()
  await expect(page.getByText('18件のお店・スポット候補', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'サンプル01・小さな喫茶店を保存解除', exact: true }),
  ).toBeVisible()
  expect(calls).toHaveLength(1)
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  expect(storage).not.toContain(code)
  expect(storage).not.toContain('Bearer')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})
