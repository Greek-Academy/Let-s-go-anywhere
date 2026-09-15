import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { sampleDraft } from '../sample'

async function sample(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '確認用サンプル', exact: true }).click()
  await expect(page.getByRole('heading', { name: '入力項目が揃いました' })).toBeVisible()
}
async function attach(page: Page, name: string) {
  await test
    .info()
    .attach(name, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
}
async function photoConditions(page: Page) {
  const dates = sampleDraft().checks.title
  for (const [label, value] of [
    ['写真の権利者', '架空の撮影者'],
    ['許諾記録の参照先（非公開メモ）', 'PRIVATE-PERMISSION-SENTINEL'],
    ['写真の利用範囲', 'このローカルテストの表示だけ'],
    ['写真のクレジット', '架空の写真条件（テスト）'],
    ['写真の代替テキスト', '写真条件の確認テスト画像'],
    ['写真条件の確認日', dates.checkedAt],
    ['写真条件の再確認期限', dates.reviewBy],
  ])
    await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByLabel('写真の確認状態', { exact: true }).selectOption('confirmed')
}

test('sample, editable preview, per-field invalidation and JSON round-trip preserve private notes locally', async ({
  page,
}) => {
  const external: string[] = []
  const errors: string[] = []
  page.on('request', (req) => {
    const u = new URL(req.url())
    if (
      !['127.0.0.1', 'localhost'].includes(u.hostname) &&
      !['blob:', 'data:'].includes(u.protocol)
    )
      external.push(req.url())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => localStorage.setItem('driveplus.mock.v1', 'untouched-app-state'))
  await sample(page)
  const preview = page.getByRole('region', { name: 'カードプレビュー' })
  await expect(preview.getByRole('heading', { name: 'サンプル公園の秋まつり' })).toBeVisible()
  await page.getByLabel('名称', { exact: true }).fill('入力したお出かけ')
  await page.getByLabel('確認メモ（カードには表示しません）').fill('PRIVATE-NOTE-SENTINEL')
  await expect(preview.getByRole('heading', { name: '入力したお出かけ' })).toBeVisible()
  await expect(preview).not.toContainText('PRIVATE-NOTE-SENTINEL')
  await expect(page.getByRole('region', { name: '入力チェック結果' })).toContainText(
    '名称の確認状態',
  )
  await page.getByRole('tab', { name: '2. 情報源・確認' }).click()
  await expect(page.getByLabel('名称の確認状態', { exact: true })).toHaveValue('unconfirmed')
  await page.getByLabel('名称の確認状態', { exact: true }).selectOption('confirmed')
  await expect(page.getByRole('heading', { name: '入力項目が揃いました' })).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '入力JSONを保存', exact: true }).click()
  const downloaded = await downloadEvent
  const path = await downloaded.path()
  const saved = JSON.parse(readFileSync(path!, 'utf8'))
  expect(saved.title).toBe('入力したお出かけ')
  expect(saved.internalNote).toBe('PRIVATE-NOTE-SENTINEL')
  expect(await page.evaluate(() => Object.entries(localStorage))).toEqual([
    ['driveplus.mock.v1', 'untouched-app-state'],
  ])
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0)
  page.on('dialog', (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('')
  await page.getByLabel('JSONを読み込む', { exact: true }).setInputFiles(path!)
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('入力したお出かけ')
  await expect(page.getByRole('heading', { name: '入力項目が揃いました' })).toBeVisible()
  expect(external).toEqual([])
  expect(errors).toEqual([])
  await attach(page, '入力チェックとカードプレビュー')
})

test('invalid imports preserve edits, missing references block checks and replacement can be cancelled by keyboard', async ({
  page,
}) => {
  await sample(page)
  await page.getByLabel('名称', { exact: true }).fill('残しておく入力')
  await page.getByLabel('JSONを読み込む', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"unknown":"PRIVATE-SENTINEL"}'),
  })
  await expect(page.getByRole('alert')).toContainText('入力形式')
  await expect(page.getByRole('alert')).not.toContainText('PRIVATE-SENTINEL')
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('残しておく入力')
  await page.getByRole('button', { name: '新しい下書き', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: '入力を置き換える', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('残しておく入力')
  await page.getByRole('tab', { name: '2. 情報源・確認' }).click()
  await page.getByRole('button', { name: '情報源1を削除', exact: true }).click()
  await expect(page.getByRole('region', { name: '入力チェック結果' })).toContainText(
    '参照可能な情報源',
  )
  await page.getByRole('button', { name: '新しい下書き', exact: true }).click()
  await page.getByRole('button', { name: '入力を置き換える', exact: true }).click()
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('')
  await attach(page, '未確認項目の表示')
})

test('photo conditions control visibility and replacing a file invalidates previous conditions', async ({
  page,
}) => {
  await sample(page)
  await page.getByRole('tab', { name: '3. 写真の条件' }).click()
  await page.getByLabel('写真を掲載候補に含める').check()
  await page.getByLabel('写真を選ぶ', { exact: true }).setInputFiles('public/images/cafe.jpg')
  const preview = page.getByRole('region', { name: 'カードプレビュー' })
  await expect(preview.locator('img')).toHaveCount(0)
  await photoConditions(page)
  const image = preview.getByRole('img', { name: '写真条件の確認テスト画像' })
  await expect(image).toBeVisible()
  await expect
    .poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  await expect(preview).not.toContainText('PRIVATE-PERMISSION-SENTINEL')
  await attach(page, '写真の利用条件を入力したプレビュー')
  await page.getByLabel('写真を選ぶ', { exact: true }).setInputFiles('public/images/cafe.jpg')
  await expect(page.getByLabel('写真の確認状態', { exact: true })).toHaveValue('unconfirmed')
  await expect(page.getByLabel('許諾記録の参照先（非公開メモ）')).toHaveValue('')
  await expect(preview.locator('img')).toHaveCount(0)
  await page.getByLabel('写真を選ぶ', { exact: true }).setInputFiles({
    name: 'broken.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not an image'),
  })
  await photoConditions(page)
  await expect(preview.getByText('写真を読み込めませんでした', { exact: true })).toBeVisible()
  await expect(preview.locator('img')).toHaveCount(0)
})

test('imported markup stays text, large input is rejected and mobile form does not overflow', async ({
  page,
}) => {
  await page.goto('/')
  const draft = sampleDraft()
  draft.title = '<img src=x onerror=alert(1)>'
  draft.description = '<script>globalThis.reviewInjected=true</script>'
  await page.getByLabel('JSONを読み込む', { exact: true }).setInputFiles({
    name: 'text.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(draft)),
  })
  const preview = page.getByRole('region', { name: 'カードプレビュー' })
  await expect(preview.getByRole('heading', { name: draft.title, exact: true })).toBeVisible()
  await expect(preview.locator('script,img')).toHaveCount(0)
  expect(await page.evaluate(() => Object.hasOwn(globalThis, 'reviewInjected'))).toBe(false)
  await page.getByLabel('JSONを読み込む', { exact: true }).setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(128 * 1024 + 1),
  })
  await expect(page.getByRole('alert')).toContainText('128 KiB')
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue(draft.title)
  for (const label of ['1. 基本情報', '2. 情報源・確認', '3. 写真の条件']) {
    await page.getByRole('tab', { name: label }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  }
  await attach(page, 'スマホ幅の入力ツール')
})
