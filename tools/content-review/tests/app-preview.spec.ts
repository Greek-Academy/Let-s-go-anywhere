import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { sampleDraft } from '../sample'

const app = (page: Page) => page.frameLocator('iframe[title="入力候補のスマホアプリ"]')
const open = (page: Page) =>
  page.getByRole('button', { name: 'アプリで確認する', exact: true }).click()
const close = (page: Page) => page.getByRole('button', { name: '入力に戻る', exact: true }).click()
async function load(page: Page, draft = sampleDraft()) {
  await page.goto('/')
  await page.getByLabel('JSONを読み込む', { exact: true }).setInputFiles({
    name: 'fictional.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(draft)),
  })
}
async function observeStorage(page: Page) {
  await page.addInitScript(() => {
    if (window === top) localStorage.setItem('driveplus.mock.v1', 'PRIVATE-APP-STATE')
    const calls: string[] = []
    Object.defineProperty(window, 'previewStorageCalls', { value: calls })
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear'] as const) {
      const original = Storage.prototype[method]
      Object.defineProperty(Storage.prototype, method, {
        value: function (...args: string[]) {
          calls.push(method)
          return Reflect.apply(original, this, args)
        },
      })
    }
  })
}

test('edited candidate uses the real list, detail and saved flows without reading or writing device data', async ({
  page,
}) => {
  await observeStorage(page)
  const external: string[] = [],
    errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (req) => {
    if (
      /^https?:/.test(req.url()) &&
      !['127.0.0.1', 'localhost'].includes(new URL(req.url()).hostname)
    )
      external.push(req.url())
  })
  const draft = sampleDraft()
  draft.internalNote = 'PRIVATE-NOTE-SENTINEL'
  draft.sources[0].label = 'PRIVATE-SOURCE-SENTINEL'
  await load(page, draft)
  await page.getByLabel('名称', { exact: true }).fill('架空の湖畔ピクニック')
  await page.getByRole('tab', { name: '2. 情報源・確認' }).click()
  await page.getByLabel('名称の確認状態', { exact: true }).selectOption('confirmed')
  await open(page)
  const preview = app(page)
  await expect(preview.locator('.event-card')).toHaveCount(1)
  await expect(
    preview.getByRole('heading', { name: '架空の湖畔ピクニック', exact: true }),
  ).toBeVisible()
  await preview.getByRole('button', { name: '架空の湖畔ピクニックを保存', exact: true }).click()
  await preview.getByRole('button', { name: '架空の湖畔ピクニックの詳細を見る' }).click()
  await expect(
    preview.getByRole('heading', { level: 1, name: '架空の湖畔ピクニック' }),
  ).toBeVisible()
  await expect(
    preview.getByRole('button', { name: '行きたいに保存済み', exact: true }),
  ).toBeVisible()
  await preview.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(preview.locator('.event-card')).toHaveCount(1)
  await preview
    .getByRole('navigation')
    .getByRole('button', { name: '行きたい', exact: true })
    .click()
  await expect(preview.locator('.saved-outing')).toHaveCount(1)
  await expect(preview.locator('.saved-outing')).toContainText('架空の湖畔ピクニック')
  for (const secret of ['PRIVATE-APP-STATE', 'PRIVATE-NOTE-SENTINEL', 'PRIVATE-SOURCE-SENTINEL'])
    await expect(preview.locator('body')).not.toContainText(secret)
  const child = page.frames().find((f) => f.url().includes('/app.html'))!
  expect(await child.evaluate(() => Reflect.get(window, 'previewStorageCalls'))).toEqual([])
  expect(await child.evaluate(() => sessionStorage.length)).toBe(0)
  await test.info().attach('入力候補を保存した実際のアプリ画面', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await close(page)
  await expect(page.getByRole('button', { name: 'アプリで確認する', exact: true })).toBeFocused()
  await page.getByRole('tab', { name: '1. 基本情報' }).click()
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('架空の湖畔ピクニック')
  await expect(page.getByLabel('確認メモ（カードには表示しません）')).toHaveValue(
    'PRIVATE-NOTE-SENTINEL',
  )
  await open(page)
  await preview
    .getByRole('navigation')
    .getByRole('button', { name: '行きたい', exact: true })
    .click()
  await expect(preview.locator('.saved-outing')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))).toBe(
    'PRIVATE-APP-STATE',
  )
  expect(external).toEqual([])
  expect(errors).toEqual([])
})

test('unconfirmed and expired input stays out of recommendations but its detail and photo absence can be inspected', async ({
  page,
}) => {
  const draft = sampleDraft()
  draft.checks.title.reviewBy = '2020-01-01'
  draft.checks.title.checkedAt = '2019-12-31'
  await load(page, draft)
  await open(page)
  const preview = app(page)
  await expect(preview.locator('.event-card')).toHaveCount(0)
  await page.getByRole('button', { name: '入力候補の詳細を見る' }).click()
  await expect(preview.getByRole('heading', { level: 1, name: draft.title })).toBeVisible()
  await expect(preview.getByText('名称の確認期限を過ぎています。', { exact: true })).toBeVisible()
  await expect(
    preview.getByRole('img', { name: '写真は表示していません', exact: true }),
  ).toBeVisible()
  await preview.getByRole('button', { name: '行きたいに保存', exact: true }).last().click()
  await preview
    .getByRole('navigation')
    .getByRole('button', { name: '行きたい', exact: true })
    .click()
  await expect(preview.locator('.saved-outing')).toContainText('要確認')
  await close(page)
  await page.getByLabel('名称', { exact: true }).fill('未確認の架空スポット')
  await open(page)
  await expect(preview.locator('.event-card')).toHaveCount(0)
  await page.getByRole('button', { name: '入力候補の詳細を見る' }).click()
  await expect(
    preview.getByRole('heading', { level: 1, name: '未確認の架空スポット' }),
  ).toBeVisible()
})

test('identity errors and invalid JSON retain the editor; all tabs and reset stay inside the preview session', async ({
  page,
}) => {
  await observeStorage(page)
  await page.goto('/')
  await open(page)
  await expect(page.getByRole('alert')).toContainText('管理IDと名称')
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: '確認用サンプル', exact: true }).click()
  await page.getByLabel('JSONを読み込む', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"private":"HIDDEN-INPUT"}'),
  })
  await expect(page.getByRole('alert')).not.toContainText('HIDDEN-INPUT')
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue(sampleDraft().title)
  await open(page)
  const preview = app(page)
  for (const name of ['車を探す', '学ぶ', '講習', '見つける']) {
    await preview.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    await expect(
      preview.getByRole('navigation').getByRole('button', { name, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  }
  await preview.getByRole('button', { name: 'マイページを開く', exact: true }).click()
  await preview.getByRole('button', { name: '設定', exact: true }).click()
  await expect(preview.getByRole('heading', { name: '確認画面での保存' })).toBeVisible()
  await preview.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await preview.getByRole('button', { name: '削除して最初から始める' }).click()
  await expect(preview.getByRole('button', { name: 'はじめる', exact: true })).toBeVisible()
  const child = page.frames().find((f) => f.url().includes('/app.html'))!
  expect(await child.evaluate(() => Reflect.get(window, 'previewStorageCalls'))).toEqual([])
  expect(await page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))).toBe(
    'PRIVATE-APP-STATE',
  )
  await close(page)
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue(sampleDraft().title)
})

test('photo conditions and private permission notes stay separate in the full app, including invalidation', async ({
  page,
}) => {
  const draft = sampleDraft()
  await load(page, draft)
  await page.getByRole('tab', { name: '3. 写真の条件' }).click()
  await page.getByLabel('写真を掲載候補に含める').check()
  await page.getByLabel('写真を選ぶ', { exact: true }).setInputFiles('public/images/cafe.jpg')
  for (const [label, value] of [
    ['写真の権利者', 'PRIVATE-OWNER'],
    ['許諾記録の参照先（非公開メモ）', 'PRIVATE-PERMISSION'],
    ['写真の利用範囲', 'PRIVATE-SCOPE'],
    ['写真のクレジット', '架空の写真クレジット'],
    ['写真の代替テキスト', '架空の写真の説明'],
    ['写真条件の確認日', draft.checks.title.checkedAt],
    ['写真条件の再確認期限', draft.checks.title.reviewBy],
  ])
    await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByLabel('写真の確認状態', { exact: true }).selectOption('confirmed')
  await open(page)
  const preview = app(page)
  await expect(preview.getByRole('img', { name: '架空の写真の説明' })).toBeVisible()
  await expect(preview.getByText('架空の写真クレジット', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '入力候補の詳細を見る' }).click()
  await expect(preview.getByRole('img', { name: '架空の写真の説明' })).toBeVisible()
  await expect(preview.getByText('架空の写真クレジット', { exact: true })).toBeVisible()
  await expect(preview.locator('body')).not.toContainText('PRIVATE-')
  await close(page)
  await page.getByLabel('写真を選ぶ', { exact: true }).setInputFiles('public/images/cafe.jpg')
  await open(page)
  await expect(preview.locator('.event-photo-button img')).toHaveCount(0)
  await expect(preview.getByText('架空の写真クレジット', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  const child = page.frames().find((f) => f.url().includes('/app.html'))!
  expect(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
})

test('a failed app frame can be retried without losing the draft', async ({ page }) => {
  await load(page)
  await page.route('**/app.html', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'text/html',
      body: '<!doctype html><title>Test failure</title>',
    }),
  )
  await open(page)
  await expect(page.getByRole('alert')).toContainText('確認画面を読み込めませんでした')
  await page.unroute('**/app.html')
  await page.getByRole('button', { name: '再試行', exact: true }).click()
  await expect(
    app(page).getByRole('heading', { name: sampleDraft().title, exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await close(page)
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue(sampleDraft().title)
})
