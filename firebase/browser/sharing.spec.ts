import { expect, test } from '@playwright/test'
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDocFromServer,
  updateDoc,
  serverTimestamp,
  terminate,
} from 'firebase/firestore'
import type { APIRequestContext, Page, BrowserContext } from '@playwright/test'
const password = 'Sharing-only-test-123!'
const endpoint = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/'
async function account(request: APIRequestContext) {
  const email = `shared-${crypto.randomUUID()}@example.test`
  const made = await request.post(`${endpoint}accounts:signUp?key=demo`, {
    data: { email, password, returnSecureToken: true },
  })
  expect(made.ok()).toBeTruthy()
  const user = await made.json()
  expect(
    (
      await request.post(`${endpoint}accounts:update?key=demo`, {
        headers: { Authorization: 'Bearer owner' },
        data: { localId: user.localId, emailVerified: true },
      })
    ).ok(),
  ).toBeTruthy()
  return email
}
async function blockCloud(context: BrowserContext) {
  await context.route(/https:\/\/(identitytoolkit|securetoken|firestore)\.googleapis\.com/, (r) =>
    r.abort(),
  )
}
async function login(page: Page, email: string, url = '/#/saved/cloud') {
  await page.goto(url)
  await page.getByLabel('メールアドレス', { exact: true }).fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'メールでログイン', exact: true }).click()
}
async function create(page: Page, name = 'ふたりの休日') {
  await page.getByRole('button', { name: '新しい共有リストを作る' }).click()
  await page.getByLabel('リストの名前', { exact: true }).fill(name)
  await page.getByLabel('このリストでの表示名', { exact: true }).fill('あおい')
  await page.getByRole('button', { name: 'この内容で共有リストを作る' }).click()
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '候補を追加する' })).toBeEnabled()
  return page.url()
}
async function add(page: Page, name = '散歩の候補', url = 'https://example.com/park') {
  await page.getByRole('button', { name: '候補を追加する' }).click()
  await page.getByLabel('場所の名前', { exact: true }).fill(name)
  await page.getByLabel('公開ページのURL', { exact: true }).fill(url)
  await page.getByRole('button', { name: '共有前に内容を確認' }).click()
  await expect(page.getByRole('dialog')).toContainText('個人メモ・学習・不安・現在地は送信しません')
  await page.getByLabel('共有メモ（任意）', { exact: true }).fill('一緒に行ってみたい')
  await page.getByRole('button', { name: 'この内容を共有リストに追加' }).click()
  await expect(page.getByRole('button', { name: '共有メモを編集' })).toBeVisible()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'リストに戻る', exact: true }).click()
}
async function issue(page: Page) {
  await page.getByRole('button', { name: 'メンバーを招待する' }).click()
  await page.getByRole('button', { name: '招待リンクを発行', exact: true }).click()
  const field = page.getByLabel('共有する招待リンク', { exact: true })
  await expect(field).toBeVisible()
  const url = await field.inputValue()
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click()
  return url
}
async function requestJoin(page: Page) {
  await page.getByLabel('このリストでの表示名', { exact: true }).fill('はる')
  await page.getByLabel('共有範囲と、退出後も追加した候補が残ることを確認しました').check()
  await page.getByRole('button', { name: '参加をリクエスト', exact: true }).click()
  await expect(page.getByRole('heading', { name: '作成者の承認を待っています' })).toBeVisible()
}
async function approve(page: Page) {
  await page.getByRole('button', { name: '最新の内容に更新' }).click()
  await page.getByRole('button', { name: '申請した人を確認して承認' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '確認して実行' }).click()
  await expect(page.getByRole('button', { name: '二人とも興味あり' })).toBeVisible()
}
async function joinApproved(page: Page) {
  await page.getByRole('button', { name: '招待の状態を更新' }).click()
  await page.getByRole('button', { name: '共有リストを開く' }).click()
  await expect(page.getByRole('button', { name: '候補を追加する' })).toBeEnabled()
}
test.beforeEach(async ({ context }) => blockCloud(context))
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('共有の確認画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('two independent accounts invite, approve, exchange candidates and reactions, then remove access', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(100_000)
  const a = await account(request),
    b = await account(request)
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await blockCloud(other)
  const guest = await other.newPage()
  try {
    await login(page, a)
    await create(page)
    await add(page)
    const url = await issue(page)
    await login(guest, b, url)
    await expect(guest.getByText('散歩の候補', { exact: true })).toHaveCount(0)
    await requestJoin(guest)
    await expect(guest.getByText('散歩の候補', { exact: true })).toHaveCount(0)
    await approve(page)
    await joinApproved(guest)
    await expect(guest.getByText('散歩の候補', { exact: true })).toBeVisible()
    await expect(guest.locator('body')).not.toContainText(a)
    await guest.getByRole('button', { name: '気になる', exact: true }).click()
    await expect(guest.locator('.cloud-reaction-summary')).toContainText('気になる')
    await page.getByRole('button', { name: '最新の内容に更新' }).click()
    await page
      .locator('.cloud-reactions')
      .getByRole('button', { name: '行きたい', exact: true })
      .click()
    await page.getByRole('button', { name: '二人とも興味あり', exact: true }).click()
    await expect(page.locator('.cloud-candidate-card')).toHaveCount(1)
    await add(guest, 'カフェの候補', 'https://example.com/cafe')
    await page.getByRole('button', { name: 'すべて', exact: true }).click()
    await page.getByRole('button', { name: '最新の内容に更新' }).click()
    await expect(page.locator('.cloud-candidate-card')).toHaveCount(2)
    await page.getByRole('button', { name: 'カフェの候補の詳細' }).click()
    await expect(page.getByRole('button', { name: '共有メモを編集' })).toHaveCount(0)
    await page.getByRole('button', { name: '私の行きたいにも保存' }).click()
    await page.getByRole('button', { name: 'リストに戻る', exact: true }).click()
    await page.getByRole('button', { name: 'メンバーと設定' }).click()
    await page.getByRole('button', { name: '外す', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'メンバーを外す', exact: true })
      .getByRole('button', { name: '確認して実行' })
      .click()
    await expect(guest.getByRole('heading', { name: '共有リストを表示できません' })).toBeVisible()
    await expect(guest.getByText('カフェの候補', { exact: true })).toHaveCount(0)
    await expect(page.getByText('整理が必要です')).toHaveCount(0)
  } finally {
    await other.close()
  }
})

test('an invitation survives registration gate; withdrawn or cancelled requests never expose candidates', async ({
  page,
  browser,
  request,
}) => {
  const a = await account(request),
    b = await account(request)
  const other = await browser.newContext({ viewport: { width: 320, height: 740 } })
  await blockCloud(other)
  const guest = await other.newPage()
  try {
    await login(page, a)
    await create(page, '友だちと行きたい')
    const url = await issue(page)
    await guest.goto(url)
    await expect(guest.getByText('友だちと行きたい', { exact: true })).toHaveCount(0)
    await login(guest, b, url)
    await requestJoin(guest)
    await guest.getByRole('button', { name: '参加申請を取り下げる' }).click()
    await expect(guest.getByRole('button', { name: '参加をリクエスト', exact: true })).toBeVisible()
    await requestJoin(guest)
    await page.getByRole('button', { name: 'メンバーを招待する' }).click()
    await page.getByRole('button', { name: 'この招待を取り消す' }).click()
    await expect(page.getByRole('button', { name: 'この招待を取り消す' })).toHaveCount(0)
    await guest.getByRole('button', { name: '招待の状態を更新' }).click()
    await expect(guest.getByRole('alert')).toBeVisible()
    await expect(guest.getByRole('button', { name: '共有リストを開く' })).toHaveCount(0)
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  } finally {
    await other.close()
  }
})

test('duplicate additions converge, stale edits retain input, reload and logout do not retain another session', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(100_000)
  const a = await account(request),
    other = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await blockCloud(other)
  const second = await other.newPage()
  try {
    await login(page, a)
    const url = await create(page)
    await add(page)
    await login(second, a)
    await second.getByRole('button', { name: 'ふたりの休日' }).click()
    await add(second)
    await expect(second.locator('.cloud-candidate-card')).toHaveCount(1)
    await page.getByRole('button', { name: '散歩の候補の詳細' }).click()
    await second.getByRole('button', { name: '散歩の候補の詳細' }).click()
    await page.bringToFront()
    await page.getByRole('button', { name: '共有メモを編集' }).click()
    await page.getByRole('textbox', { name: '共有メモ', exact: true }).fill('古い画面の入力')
    // A second authenticated client edits without putting the first browser in the background.
    const app = initializeApp(
      { projectId: 'demo-driveplus', apiKey: 'demo' },
      `concurrent-${crypto.randomUUID()}`,
    )
    const auth = getAuth(app),
      db = getFirestore(app)
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8086)
    try {
      await signInWithEmailAndPassword(auth, a, password)
      const match = page.url().match(/list\/([a-f0-9]+)\/item\/([a-f0-9]+)/)!
      const ref = doc(db, 'sharedLists', match[1], 'items', match[2])
      const snapshot = await getDocFromServer(ref)
      await updateDoc(ref, {
        note: '別画面で更新した内容',
        revision: snapshot.data()!.revision + 1,
        updatedAt: serverTimestamp(),
      })
    } finally {
      await terminate(db)
      await deleteApp(app)
    }
    await page.getByRole('button', { name: '共有メモを保存' }).click()
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('別の画面で変更')
    await expect(page.getByRole('textbox', { name: '共有メモ', exact: true })).toHaveValue(
      '古い画面の入力',
    )
    await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click()
    await page.reload()
    await expect(page.getByRole('button', { name: 'メールでログイン' })).toBeVisible()
    await expect(page.getByText('散歩の候補', { exact: true })).toHaveCount(0)
    await login(page, a, url)
    await expect(page.getByText('散歩の候補', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'ログアウト', exact: true }).click()
    await expect(page.getByText('散歩の候補', { exact: true })).toHaveCount(0)
  } finally {
    await other.close()
  }
})

test('owner can complete list deletion and the UI returns to a usable hub', async ({
  page,
  request,
}) => {
  await login(page, await account(request))
  await create(page, '削除を確認するリスト')
  await add(page)
  await issue(page)
  await page.getByRole('button', { name: 'メンバーと設定' }).click()
  await page.getByRole('button', { name: '共有リスト全体を削除', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'リスト全体を削除する' })
    .getByRole('button', { name: '確認して実行' })
    .click()
  await expect(page.getByRole('button', { name: '新しい共有リストを作る' })).toBeEnabled()
  await expect(page.getByText('削除を確認するリスト', { exact: true })).toHaveCount(0)
})

test('draft promotion is explicit; sharing a saved catalog candidate sends only the selected snapshot', async ({
  page,
  request,
}) => {
  const address = await account(request)
  await login(page, address, '/#/saved/cloud/preparation')
  await page.getByRole('button', { name: 'クラウドにリストを作る' }).click()
  await page.getByLabel('リストの名前', { exact: true }).fill('前回の準備リスト')
  await page.getByRole('button', { name: 'Firebaseに保存する' }).click()
  await expect(page.getByRole('button', { name: '前回の準備リストを編集' })).toBeVisible()
  await page.evaluate(() => {
    location.hash = '/saved/cloud'
  })
  await page.getByRole('button', { name: '新しい共有リストを作る' }).click()
  await page.getByLabel('前回の準備リストから名前と色をコピー', { exact: false }).selectOption('1')
  await expect(page.getByLabel('リストの名前', { exact: true })).toHaveValue('前回の準備リスト')
  await page.getByLabel('このリストでの表示名', { exact: true }).fill('あおい')
  await page.getByRole('button', { name: 'この内容で共有リストを作る' }).click()
  await expect(page.getByRole('heading', { name: '前回の準備リスト', exact: true })).toBeVisible()
  await expect(page.locator('.cloud-candidate-card')).toHaveCount(0)
  await page.evaluate(() => {
    location.hash = '/events/fuji'
  })
  await page.getByRole('button', { name: '共有リストに追加', exact: true }).click()
  await page.getByRole('button', { name: /前回の準備リスト 1人/ }).click()
  await expect(page.getByRole('dialog')).toContainText('サンプル')
  await page.getByRole('button', { name: 'この内容を共有リストに追加' }).click()
  await expect(page.getByRole('button', { name: '共有メモを編集' })).toBeVisible()
  await page.evaluate(() => {
    location.hash = '/saved/cloud/preparation'
  })
  await expect(page.getByRole('button', { name: '前回の準備リストを編集' })).toBeVisible()
})
