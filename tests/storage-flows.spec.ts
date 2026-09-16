import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createInitialState } from '../src/state/model'
import { STORAGE_KEY } from '../src/state/storage'

declare global {
  interface Window {
    storageTest: { fail: boolean; writes: number; read: () => string | null }
  }
}
const sample = () => ({
  ...createInitialState(),
  onboarded: true,
  savedEvents: ['fuji'],
  profile: { ...createInitialState().profile, name: '確認用ゲスト' },
})
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
async function seed(page: Page, raw: string, route = '/discover') {
  await page.goto('/#/welcome')
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: STORAGE_KEY, raw })
  await page.goto('/#' + route)
  await page.reload()
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
})
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
})

test('corrupted nested storage keeps the app usable and preserves original bytes through edits and download', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const raw = JSON.stringify({
    ...sample(),
    memo: null,
    links: {},
    map: { offset: null },
    quiz: { answers: [] },
  })
  await seed(page, raw)
  await expect(page.getByRole('alert')).toContainText('自動保存を停止')
  for (const path of [
    '/saved',
    '/cars',
    '/check',
    '/results',
    '/profile',
    '/reflection',
    '/consult/shirokuma',
    '/profile/consultations',
  ]) {
    await page.goto('/#' + path)
    await expect(page.locator('.app-main')).toBeVisible()
    await expect(page.getByRole('navigation')).toBeVisible()
  }
  await page.goto('/#/profile/edit')
  await page.getByRole('textbox', { name: /呼ばれたい名前/ }).fill('このタブだけの変更')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByRole('heading', { name: 'このタブだけの変更さん' })).toBeVisible()
  expect(await stored(page)).toBe(raw)
  await page.getByRole('button', { name: '保存の状態を確認' }).click()
  await expect(page.locator('.storage-details')).toContainText('元のデータは変更せず')
  await expect(page.getByRole('button', { name: '保存をもう一度試す' })).toHaveCount(0)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存されている元データをダウンロード' }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('driveplus-local-backup.json')
  expect(await readFile((await download.path())!, 'utf8')).toBe(raw)
  await page.reload()
  expect(await stored(page)).toBe(raw)
  expect(errors).toEqual([])
})

test('invalid JSON is kept until explicit reset; cancel and a narrow-screen dialog do not delete it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const raw = '{"memo":"未完了の保存データ"'
  await seed(page, raw, '/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  expect(await stored(page)).toBe(raw)
  await page.getByRole('button', { name: '保存の状態を確認' }).click()
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await expect(page.getByRole('dialog')).toContainText('読み込めなかった元のデータ')
  expect(
    await page.locator('.storage-notice').evaluate((el) => el instanceof HTMLElement && el.inert),
  ).toBe(true)
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  expect(await stored(page)).toBe(raw)
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await page.getByRole('button', { name: '削除して最初から始める' }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(JSON.parse((await stored(page))!)).toEqual(createInitialState())
  expect(
    await page.locator('.phone-screen').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
})

test('quota failures retain the last saved version and an explicit retry saves in-memory edits', async ({
  page,
}) => {
  await seed(page, JSON.stringify(sample()), '/profile/edit')
  const before = await stored(page)
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    window.storageTest = { fail: true, writes: 0, read: () => localStorage.getItem(key) }
    Storage.prototype.setItem = function (k, value) {
      if (k === key) {
        window.storageTest.writes++
        if (window.storageTest.fail) throw new DOMException('test quota', 'QuotaExceededError')
      }
      return original.call(this, k, value)
    }
  }, STORAGE_KEY)
  await page.getByRole('textbox', { name: /呼ばれたい名前/ }).fill('保存を再試行する名前')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('heading', { name: '保存を再試行する名前さん' })).toBeVisible()
  expect(await stored(page)).toBe(before)
  expect(await page.evaluate(() => window.storageTest.writes)).toBe(1)
  await page.getByRole('button', { name: '保存の状態を確認' }).click()
  await page.evaluate(() => {
    window.storageTest.fail = false
  })
  await page.getByRole('button', { name: '保存をもう一度試す' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(JSON.parse((await stored(page))!).profile.name).toBe('保存を再試行する名前')
  await page.reload()
  expect(JSON.parse((await stored(page))!).profile.name).toBe('保存を再試行する名前')
})

test('unavailable storage never silently replaces unknown data and failed deletion keeps the confirmation open', async ({
  page,
}) => {
  const raw = JSON.stringify(sample())
  await page.addInitScript(
    ({ key, raw }) => {
      const get = Storage.prototype.getItem
      const set = Storage.prototype.setItem
      const remove = Storage.prototype.removeItem
      set.call(localStorage, key, raw)
      window.storageTest = { fail: true, writes: 0, read: () => get.call(localStorage, key) }
      Storage.prototype.getItem = function (k) {
        if (k === key && window.storageTest.fail)
          throw new DOMException('test denied', 'SecurityError')
        return get.call(this, k)
      }
      Storage.prototype.setItem = function (k, v) {
        if (k === key) window.storageTest.writes++
        return set.call(this, k, v)
      }
      Storage.prototype.removeItem = function (k) {
        if (k === key && window.storageTest.fail)
          throw new DOMException('test denied', 'SecurityError')
        return remove.call(this, k)
      }
    },
    { key: STORAGE_KEY, raw },
  )
  await page.goto('/#/settings')
  await expect(page.locator('.storage-details')).toContainText('保存領域を読み取れません')
  expect(await page.evaluate(() => window.storageTest.writes)).toBe(0)
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await page.getByRole('button', { name: '削除して最初から始める' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.toast')).toContainText('削除できませんでした')
  expect(await page.evaluate(() => window.storageTest.read())).toBe(raw)
  await page.evaluate(() => {
    window.storageTest.fail = false
  })
  await page.getByRole('button', { name: '削除して最初から始める' }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
  expect(JSON.parse((await stored(page))!)).toEqual(createInitialState())
})

test('markup and hostile URLs stay text and do not become published content or network requests', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.url().startsWith('https://')) requests.push(r.url())
  })
  const markup = '<img src="https://untrusted.example/pixel" onerror="alert(1)">'
  const data = {
    ...sample(),
    contentSource: 'approved',
    links: [
      {
        id: 'bad-link',
        url: 'javascript:alert(1)',
        title: markup,
        source: '内容未確認',
        addedAt: '2026-09-16T03:00:00.000Z',
      },
    ],
  }
  const raw = JSON.stringify(data)
  await seed(page, raw, '/saved')
  await expect(page.locator('.saved-link h3')).toHaveText(markup)
  await expect(page.locator('.saved-link img, .saved-link script')).toHaveCount(0)
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(0)
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('.event-list')).not.toContainText(markup)
  expect(requests).toEqual([])
  expect(await stored(page)).toBe(raw)
})

test('another tab changing storage stops stale writes and reloading reads the newer version', async ({
  page,
  context,
}) => {
  const stamp = '2026-09-16T03:00:00.000Z'
  const raw = JSON.stringify(
    {
      ...sample(),
      consultations: [
        {
          id: 'c1',
          schoolId: 'shirokuma',
          createdAt: stamp,
          status: '送信済み（デモ）',
          consentAt: stamp,
          shared: ['goal'],
          snapshot: { goal: '相談用' },
        },
      ],
    },
    null,
    2,
  )
  await seed(page, raw, '/profile/edit')
  expect(await stored(page)).toBe(raw)
  const other = await context.newPage()
  await other.goto(page.url())
  expect(await stored(page)).toBe(raw)
  await other.getByRole('textbox', { name: /呼ばれたい名前/ }).fill('別タブの保存')
  await other.getByRole('button', { name: '変更を保存' }).click()
  await page.getByRole('textbox', { name: /呼ばれたい名前/ }).fill('古いタブの変更')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await page.getByRole('button', { name: '保存の状態を確認' }).click()
  await expect(page.locator('.storage-details')).toContainText('別のタブなどで保存データが変更')
  expect(JSON.parse((await stored(page))!).profile.name).toBe('別タブの保存')
  await page.reload()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.goto('/#/profile')
  await expect(page.getByRole('heading', { name: '別タブの保存さん' })).toBeVisible()
  await other.close()
})
