import { expectMapStationCount } from './support/mapFixture'
import { expect, test } from './support/mapFixture'
import type { Page } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { nearbyStations } from '../src/domain/nearbyStations'

// These tests fake the plugin boundary to inject delays and failures. They do
// not replace the XCTest run against the installed iOS app.
async function bridge(
  page: Page,
  initial: string | null = null,
  readFailure = false,
  locationAges: number[] = [0],
) {
  await page.addInitScript(
    ({ initial, readFailure, locationAges }) => {
      const key = 'test.native.preferences'
      if (initial !== null && localStorage.getItem(key) === null) localStorage.setItem(key, initial)
      const control = {
        failRead: readFailure,
        failWrite: false,
        failOpen: false,
        opens: [] as string[],
        copies: [] as string[],
        pause: null as (() => void) | null,
        locationCalls: 0,
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
            { name: 'Geolocation', methods: [{ name: 'getCurrentPosition', rtype: 'promise' }] },
            {
              name: 'App',
              methods: [
                { name: 'addListener', rtype: 'callback' },
                { name: 'removeListener', rtype: 'promise' },
              ],
            },
            {
              name: 'Keyboard',
              methods: [
                { name: 'setAccessoryBarVisible', rtype: 'promise' },
                { name: 'addListener', rtype: 'callback' },
                { name: 'removeListener', rtype: 'promise' },
              ],
            },
          ],
          nativeCallback: (
            plugin: string,
            method: string,
            options: { eventName?: string },
            callback: () => void,
          ) => {
            if (plugin === 'App' && method === 'addListener' && options.eventName === 'pause')
              control.pause = callback
            return 'test-listener'
          },
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
            if (plugin === 'Geolocation' && method === 'getCurrentPosition') {
              const age = locationAges[control.locationCalls++] ?? 0
              return {
                timestamp: Date.now() - age,
                coords: { latitude: 35.690921, longitude: 139.700258, accuracy: 10 },
              }
            }
            return {}
          },
        },
      })
    },
    { initial, readFailure, locationAges },
  )
}

const nativeRaw = (page: Page) =>
  page.evaluate(() => localStorage.getItem('test.native.preferences'))

test('native stale locations retry once, explain simulator settings, and recover after a fresh fix', async ({
  page,
}) => {
  const state = { ...createInitialState(), onboarded: true }
  await bridge(page, JSON.stringify(state), false, [180000, 180000, 0])
  await page.goto('/#/cars')
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click()
  await page.getByRole('button', { name: '現在地を取得', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('古い位置情報')
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  await page.getByText('現在地を取得できないとき', { exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Custom Location')
  await test.info().attach('古い位置の案内とシミュレーターの設定手順', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  // Even with the explanation expanded, the next action is reachable in a small viewport.
  await page.getByRole('button', { name: '現在地を取得', exact: true }).click()
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { nativeTest: { locationCalls: number } }).nativeTest.locationCalls,
    ),
  ).toBe(3)
  expect(await nativeRaw(page)).not.toContain('35.690921')
})

test('native pause clears the GPS session without putting its position in Preferences', async ({
  page,
}) => {
  const state = { ...createInitialState(), onboarded: true }
  await bridge(page, JSON.stringify(state))
  await page.goto('/#/cars')
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click()
  await page.getByRole('button', { name: '現在地を取得', exact: true }).click()
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await expectMapStationCount(
    page,
    nearbyStations(state.realMap, { lat: 35.690921, lng: 139.700258, accuracy: 10, timestamp: 1 })
      .length,
  )
  await page.evaluate(() =>
    (window as unknown as { nativeTest: { pause: () => void } }).nativeTest.pause(),
  )
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  await expectMapStationCount(page, 10)
  const saved = JSON.parse((await nativeRaw(page))!)
  expect(saved.realMap.center.lat).toBeCloseTo(35, 3)
  expect(saved.realMap.bounds).toEqual(state.realMap.bounds)
  expect(await nativeRaw(page)).not.toContain('35.690921')
})

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

test('native car search opens the checked URL and recovers from browser failure without losing conditions', async ({
  page,
}) => {
  const state = createInitialState()
  state.onboarded = true
  state.savedStations = ['times-shibuya']
  await bridge(page, JSON.stringify(state))
  await page.goto('/#/cars/search')
  await page.getByLabel('探す駅・地域', { exact: true }).fill('京都駅')
  await page.getByRole('button', { name: 'カーシェア', exact: true }).click()
  await page.getByLabel('事業者', { exact: true }).selectOption('times')
  await page.getByRole('button', { name: '外部地図で車を探す', exact: true }).click()
  await page.evaluate(() => {
    ;(window as unknown as { nativeTest: { failOpen: boolean } }).nativeTest.failOpen = true
  })
  await page.getByRole('link', { name: 'Googleマップで検索する', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('ブラウザ画面を開けませんでした')
  await page.evaluate(() => {
    ;(window as unknown as { nativeTest: { failOpen: boolean } }).nativeTest.failOpen = false
  })
  await page.getByRole('link', { name: 'Googleマップで検索する', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { nativeTest: { opens: string[] } }).nativeTest.opens,
      ),
    )
    .toEqual([
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('京都駅') +
        '+' +
        encodeURIComponent('タイムズカー'),
    ])
  await expect(page).toHaveURL(/#\/cars\/search$/)
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('探す駅・地域', { exact: true })).toHaveValue('京都駅')
  expect(JSON.parse((await nativeRaw(page))!).savedStations).toEqual(['times-shibuya'])
  expect(JSON.parse((await nativeRaw(page))!).consultations).toEqual([])
})
