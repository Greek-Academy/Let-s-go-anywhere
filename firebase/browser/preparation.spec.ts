import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

const password = 'Example-only-password-123!'
const email = () => `pilot-${crypto.randomUUID()}@example.test`
const endpoint = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/'
async function account(request: APIRequestContext, address = email()) {
  const created = await request.post(`${endpoint}accounts:signUp?key=demo`, {
    data: { email: address, password, returnSecureToken: true },
  })
  expect(created.ok()).toBeTruthy()
  const user = await created.json()
  const updated = await request.post(`${endpoint}accounts:update?key=demo`, {
    headers: { Authorization: 'Bearer owner' },
    data: { localId: user.localId, emailVerified: true },
  })
  expect(updated.ok()).toBeTruthy()
  return address
}
async function login(page: Page, address: string) {
  await page.goto('/#/saved/cloud')
  await page.getByLabel('メールアドレス', { exact: true }).fill(address)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click()
  await expect(page.getByRole('button', { name: 'クラウドにリストを作る' })).toBeEnabled()
}
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'クラウドにリストを作る' }).click()
  await page.getByLabel('リストの名前').fill(name)
  await page.getByRole('button', { name: 'Firebaseに保存する' }).click()
  await expect(page.getByRole('button', { name: `${name}を編集` })).toBeVisible()
}

test.beforeEach(async ({ context }) => {
  // A misconfiguration must never send credentials or data to real Firebase during tests.
  await context.route(
    /https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com/,
    (route) => route.abort(),
  )
})
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('確認画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('register, block unverified reads, consume email link, save, reload and log out', async ({
  page,
  request,
}) => {
  const address = email()
  const firestoreRequests: string[] = []
  page.on('request', (req) => {
    if (req.url().includes(':8086/')) firestoreRequests.push(req.url())
  })
  await page.goto('/#/saved/cloud')
  await page.getByRole('button', { name: '新規登録', exact: true }).click()
  await page.getByLabel('メールアドレス', { exact: true }).fill(address)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByLabel('検証用アカウントをFirebaseに作成することを確認しました').check()
  await page.getByRole('button', { name: '登録して確認メールを送る' }).click()
  await expect(page.getByRole('heading', { name: 'メールアドレスを確認しましょう' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '確認メールを送信済み', exact: false }),
  ).toBeDisabled()
  expect(firestoreRequests).toHaveLength(0)
  const codes = await (
    await request.get('http://127.0.0.1:9099/emulator/v1/projects/demo-driveplus/oobCodes')
  ).json()
  const code = codes.oobCodes.find((c: { email: string }) => c.email === address)
  expect(code).toBeTruthy()
  expect(
    (
      await request.post(`${endpoint}accounts:update?key=demo`, { data: { oobCode: code.oobCode } })
    ).ok(),
  ).toBeTruthy()
  await page.getByRole('button', { name: 'メールの確認ができました' }).click()
  await create(page, 'ふたりの休日')
  await page.reload()
  await expect(page.getByRole('button', { name: 'メールでログイン' })).toBeVisible()
  await expect(page.getByText('ふたりの休日', { exact: true })).toHaveCount(0)
  await login(page, address)
  await expect(page.getByText('ふたりの休日', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await expect(page.getByText('ふたりの休日', { exact: true })).toHaveCount(0)
})

test('same account can reread; another account sees none; edit/delete and three-list limit work', async ({
  page,
  request,
}) => {
  const owner = await account(request),
    other = await account(request)
  await login(page, owner)
  for (const name of ['温泉の休日', 'カフェへ', '季節の楽しみ']) await create(page, name)
  await expect(page.getByRole('button', { name: 'クラウドにリストを作る' })).toBeDisabled()
  await page.getByRole('button', { name: '温泉の休日を編集' }).click()
  await page.getByLabel('リストの名前').fill('新しい休日')
  await page.getByRole('button', { name: '空色', exact: true }).click()
  await page.getByRole('button', { name: 'Firebaseに保存する' }).click()
  await expect(page.getByRole('button', { name: '新しい休日を編集' })).toBeVisible()
  await page.getByRole('button', { name: 'カフェへを削除' }).click()
  await page.getByRole('button', { name: 'このリストを削除する' }).click()
  await expect(page.getByRole('button', { name: 'クラウドにリストを作る' })).toBeEnabled()
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await login(page, other)
  await expect(page.getByText('新しい休日', { exact: true })).toHaveCount(0)
  await expect(page.getByText('まだリストはありません。最初のリストを作りましょう。')).toBeVisible()
  await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
  await login(page, owner)
  await expect(page.getByText('新しい休日', { exact: true })).toBeVisible()
  await expect(page.getByText('カフェへ', { exact: true })).toHaveCount(0)
})

test('concurrent editing does not overwrite another browser and typed text survives failure', async ({
  page,
  context,
  request,
}) => {
  const owner = await account(request)
  await login(page, owner)
  await create(page, '編集前のリスト')
  const second = await context.newPage()
  await login(second, owner)
  await page.getByRole('button', { name: '編集前のリストを編集' }).click()
  await page.getByLabel('リストの名前').fill('古い画面からの編集')
  await second.getByRole('button', { name: '編集前のリストを編集' }).click()
  await second.getByLabel('リストの名前').fill('別のブラウザで変更')
  await second.getByRole('button', { name: 'Firebaseに保存する' }).click()
  await expect(second.getByRole('button', { name: '別のブラウザで変更を編集' })).toBeVisible()
  await page.getByRole('button', { name: 'Firebaseに保存する' }).click()
  await expect(page.getByRole('alert').last()).toContainText('別の画面で変更されました')
  await expect(page.getByLabel('リストの名前')).toHaveValue('古い画面からの編集')
  await second.getByRole('button', { name: '最新の内容を読み直す' }).click()
  await expect(second.getByRole('button', { name: '別のブラウザで変更を編集' })).toBeVisible()
  await second.close()
})

test('reset flow, wrong password error and 320px width remain usable', async ({
  page,
  request,
}) => {
  const address = await account(request)
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/#/saved/cloud')
  await page.getByLabel('メールアドレス', { exact: true }).fill(address)
  await page.getByLabel('パスワード', { exact: true }).fill('incorrect-password')
  await page.getByRole('button', { name: 'メールでログイン' }).click()
  await expect(page.getByRole('alert')).toContainText('メールアドレスまたはパスワードを確認')
  await expect(page.getByLabel('パスワード', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: 'パスワードを忘れた方' }).click()
  await page.getByRole('button', { name: '再設定メールを送る' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: '対象のアカウントがある場合' }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('background hides the cloud list and private storage is never part of outbound writes', async ({
  page,
  request,
}) => {
  const owner = await account(request)
  await page.goto('/#/saved')
  await page.evaluate(() =>
    localStorage.setItem('private-test-marker', 'do-not-upload-learning-location'),
  )
  const bodies: string[] = []
  page.on('request', (req) => {
    if (req.url().includes(':8086/')) bodies.push(req.postData() ?? '')
  })
  await login(page, owner)
  await create(page, '表示を隠すテスト')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText('表示を隠すテスト', { exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByText('表示を隠すテスト', { exact: true })).toBeVisible()
  expect(bodies.join('')).not.toContain('do-not-upload-learning-location')
  expect(await page.evaluate(() => localStorage.getItem('private-test-marker'))).toBe(
    'do-not-upload-learning-location',
  )
})

test('read failure clears stale list and re-enables refresh after reconnect', async ({
  page,
  context,
  request,
}) => {
  const owner = await account(request)
  await login(page, owner)
  await create(page, '通信が戻ったら確認')
  await context.setOffline(true)
  await page.getByRole('button', { name: '最新の内容を読み直す' }).click()
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('通信が戻ったら確認', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'クラウドにリストを作る' })).toBeDisabled()
  await context.setOffline(false)
  await page.getByRole('button', { name: '最新の内容を読み直す' }).click()
  await expect(page.getByText('通信が戻ったら確認', { exact: true })).toBeVisible()
})

test('device reset logs out but does not delete the separately stored cloud list', async ({
  page,
  request,
}) => {
  const owner = await account(request)
  await login(page, owner)
  await create(page, 'クラウドに残るリスト')
  await page.getByRole('button', { name: 'マイページを開く' }).click()
  await page.getByRole('button', { name: '設定', exact: true }).click()
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await expect(
    page.getByText(
      '共有用アカウントからもログアウトします。Firebase側のリストやアカウントは削除されません。',
    ),
  ).toBeVisible()
  await page.getByRole('button', { name: '削除して最初から始める' }).click()
  await expect(page).toHaveURL(/welcome/)
  await page.evaluate(() => {
    location.hash = '/saved/cloud'
  })
  await expect(page.getByRole('button', { name: 'メールでログイン', exact: true })).toBeVisible()
  await login(page, owner)
  await expect(page.getByText('クラウドに残るリスト', { exact: true })).toBeVisible()
})
