import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../src/state/model'

// These tests fake the plugin boundary to inject delays and failures. They do
// not replace the XCTest run against the installed iOS app.
async function bridge(page: Page, initial: string | null = null, readFailure = false) {
  await page.addInitScript(
    ({ initial, readFailure }) => {
      const key = 'test.native.preferences'
      if (initial !== null && localStorage.getItem(key) === null) localStorage.setItem(key, initial)
      const control = {
        failRead: readFailure,
        failWrite: false,
        failOpen: false,
        opens: [] as string[],
        copies: [] as string[],
      }
      Object.assign(window, {
        nativeTest: control,
        webkit: { messageHandlers: { bridge: {} } },
        Capacitor: {
          PluginHeaders: [
            {
              name: 'Preferences',
              methods: ['get', 'set', 'remove'].map((name) => ({ name, rtype: 'promise' })),
            },
            { name: 'Browser', methods: [{ name: 'open', rtype: 'promise' }] },
            { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
            {
              name: 'Keyboard',
              methods: [
                { name: 'setAccessoryBarVisible', rtype: 'promise' },
                { name: 'addListener', rtype: 'callback' },
                { name: 'removeListener', rtype: 'promise' },
              ],
            },
          ],
          nativeCallback: () => 'test-listener',
          nativePromise: async (
            plugin: string,
            method: string,
            options: { value: string; url: string; text: string },
          ) => {
            if (plugin === 'Preferences') {
              await new Promise((resolve) => setTimeout(resolve, method === 'get' ? 50 : 80))
              if (method === 'get') {
                if (control.failRead) throw new Error('read unavailable')
                return { value: localStorage.getItem(key) }
              }
              if (control.failWrite) throw new Error('write unavailable')
              if (method === 'set') localStorage.setItem(key, options.value)
              if (method === 'remove') localStorage.removeItem(key)
            }
            if (plugin === 'Browser') {
              if (control.failOpen) throw new Error('browser unavailable')
              control.opens.push(options.url)
            }
            if (plugin === 'Share') control.copies.push(options.text)
            return {}
          },
        },
      })
    },
    { initial, readFailure },
  )
}

const nativeRaw = (page: Page) =>
  page.evaluate(() => localStorage.getItem('test.native.preferences'))

test('native startup waits for saved data, serializes rapid edits, survives reload and resets only on confirmation', async ({
  page,
}) => {
  const state = { ...createInitialState(), onboarded: true, savedEvents: ['fuji'] }
  await bridge(page, JSON.stringify(state))
  await page.goto('/')
  await expect(page).toHaveURL(/#\/discover$/)
  await expect(page.locator('.status-bar')).toBeHidden()
  await expect(page.locator('.prototype-label')).toBeHidden()
  await page.goto('/#/onboarding/1')
  const name = page.getByRole('textbox', { name: '出発エリア' })
  await name.fill('')
  await name.pressSequentially('native rapid edits', { delay: 8 })
  await expect
    .poll(async () => JSON.parse((await nativeRaw(page))!).profile.area)
    .toBe('native rapid edits')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  expect(JSON.parse((await nativeRaw(page))!).savedEvents).toEqual(['fuji'])
  expect(await page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))).toBeNull()
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  expect(JSON.parse((await nativeRaw(page))!).profile.area).toBe('native rapid edits')
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await page.getByRole('button', { name: '削除して最初から始める' }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
  await expect
    .poll(async () => JSON.parse((await nativeRaw(page)) || 'null')?.savedEvents)
    .toEqual([])
})

test('native read failure protects original data and original JSON can be copied', async ({
  page,
}) => {
  const raw = JSON.stringify({ ...createInitialState(), onboarded: true })
  await bridge(page, raw, true)
  await page.goto('/#/settings')
  await expect(page.getByRole('alert')).toContainText('自動保存を停止')
  expect(await nativeRaw(page)).toBe(raw)
  await page.evaluate(() => {
    ;(window as unknown as { nativeTest: { failRead: boolean } }).nativeTest.failRead = false
  })
  await page.getByRole('button', { name: '保存されている元データを共有・コピー' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { nativeTest: { copies: string[] } }).nativeTest.copies,
      ),
    )
    .toEqual([raw])
  expect(await nativeRaw(page)).toBe(raw)
})

test('native write failure retains the previous record and an explicit retry saves the latest edits', async ({
  page,
}) => {
  const raw = JSON.stringify({ ...createInitialState(), onboarded: true })
  await bridge(page, raw)
  await page.goto('/#/onboarding/1')
  await page.getByRole('textbox', { name: '出発エリア' }).waitFor()
  await page.evaluate(() => {
    ;(window as unknown as { nativeTest: { failWrite: boolean } }).nativeTest.failWrite = true
  })
  await page.getByRole('textbox', { name: '出発エリア' }).fill('京都')
  await expect(page.getByRole('alert')).toContainText('自動保存を停止')
  expect(await nativeRaw(page)).toBe(raw)
  await page.getByRole('textbox', { name: '出発エリア' }).fill('京都駅周辺')
  await page.getByRole('button', { name: '保存の状態を確認' }).click()
  await page.evaluate(() => {
    ;(window as unknown as { nativeTest: { failWrite: boolean } }).nativeTest.failWrite = false
  })
  await page.getByRole('button', { name: '保存をもう一度試す' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect
    .poll(async () => JSON.parse((await nativeRaw(page))!).profile.area)
    .toBe('京都駅周辺')
})

test('native external browser failures retain the app and retry only the confirmed personal URL', async ({
  page,
}) => {
  const state = createInitialState()
  state.onboarded = true
  state.links = [
    {
      id: 'native-url',
      title: '確認用リンク',
      url: 'https://example.com/outing',
      source: 'Web',
      addedAt: new Date().toISOString(),
    },
  ]
  await bridge(page, JSON.stringify(state))
  await page.goto('/#/saved')
  await page.getByRole('button', { name: '元の投稿を確認' }).click()
  await page.evaluate(() => {
    ;(window as unknown as { nativeTest: { failOpen: boolean } }).nativeTest.failOpen = true
  })
  await page.getByRole('link', { name: '元のページを開く', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('ブラウザ画面を開けませんでした')
  await page.evaluate(() => {
    ;(window as unknown as { nativeTest: { failOpen: boolean } }).nativeTest.failOpen = false
  })
  await page.getByRole('link', { name: '元のページを開く', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { nativeTest: { opens: string[] } }).nativeTest.opens,
      ),
    )
    .toEqual(['https://example.com/outing'])
  await expect(page).toHaveURL(/#\/saved$/)
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  expect(JSON.parse((await nativeRaw(page))!).consultations).toEqual([])
})
