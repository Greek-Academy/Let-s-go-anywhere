import { expectMapStationCount } from './support/mapFixture'
import { test, expect, mapPattern } from './support/mapFixture'
import type { Page } from '@playwright/test'
import { createRealMapState } from '../src/domain/realStations'
import { distanceMetres, nearbyStations } from '../src/domain/nearbyStations'
import { locationError, validatePosition } from '../src/platform/location'
import type { Position } from '@capacitor/geolocation'

// Public landmark: Shinjuku Station. Never a user's/home location.
const point = { lat: 35.690921, lng: 139.700258, accuracy: 30, timestamp: 1 }
const expected = nearbyStations(createRealMapState(), point)
const persisted = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
async function enter(page: Page) {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '車を探す', exact: true }).click()
  await expectMapStationCount(page, 10)
}
async function mockLocation(
  page: Page,
  options: {
    error?: number
    accuracy?: number
    lat?: number
    lng?: number
    age?: number
    ages?: number[]
    delayed?: boolean
    unsupported?: boolean
  } = {},
) {
  await page.addInitScript(
    ({ point, options }) => {
      const target = window as unknown as { calls: number; deliver: () => void }
      target.calls = 0
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: options.unsupported
          ? undefined
          : {
              getCurrentPosition(
                success: (value: unknown) => void,
                failure: (value: unknown) => void,
              ) {
                target.calls++
                const age = options.ages?.[target.calls - 1] ?? options.age ?? 0
                const deliver = () =>
                  options.error
                    ? failure({ code: options.error })
                    : success({
                        timestamp: Date.now() - age,
                        coords: {
                          latitude: options.lat ?? point.lat,
                          longitude: options.lng ?? point.lng,
                          accuracy: options.accuracy ?? point.accuracy,
                          altitude: null,
                          altitudeAccuracy: null,
                          heading: null,
                          speed: null,
                        },
                      })
                if (options.delayed) target.deliver = deliver
                else deliver()
              },
              watchPosition() {
                throw new Error('Tracking is forbidden in this pilot')
              },
            },
      })
    },
    { point, options },
  )
}
async function request(page: Page) {
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('許可して操作したときだけ現在地を取得')
  await page.getByRole('button', { name: '現在地を取得', exact: true }).click()
}

test('nearby search uses a circle, distance order and common filters; position validation rejects invalid/stale/low-accuracy fixes', () => {
  expect(expected.length).toBeGreaterThan(0)
  expect(expected.length).toBeLessThan(27)
  const distances = expected.map((s) =>
    distanceMetres(point, { lat: s.latitude, lng: s.longitude }),
  )
  expect(distances.every((d) => d <= 2000)).toBe(true)
  expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  expect(
    nearbyStations({ ...createRealMapState(), type: 'カーシェア' }, point).every(
      (s) => s.type === 'カーシェア',
    ),
  ).toBe(true)
  expect(
    nearbyStations({ ...createRealMapState(), providers: ['日産レンタカー'] }, point).every(
      (s) => s.provider === '日産レンタカー',
    ),
  ).toBe(true)
  const position = {
    timestamp: 1000000,
    coords: { latitude: point.lat, longitude: point.lng, accuracy: 30 },
  } as Position
  expect(validatePosition(position, 1000000)).toEqual({ ...point, timestamp: 1000000 })
  for (const value of [NaN, Infinity, 95])
    expect(() =>
      validatePosition({ ...position, coords: { ...position.coords, latitude: value } }, 1000000),
    ).toThrow()
  expect(() => validatePosition({ ...position, timestamp: 1 }, 1000000)).toThrow('古い')
  expect(() => validatePosition({ ...position, timestamp: 1020000 }, 1000000)).toThrow('時刻より先')
  expect(() =>
    validatePosition({ ...position, coords: { ...position.coords, accuracy: 2000 } }, 1000000),
  ).toThrow('誤差')
  expect(locationError({ code: 'OS-PLUG-GLOC-0003' })).toContain('許可')
  expect(locationError({ code: 'OS-PLUG-GLOC-0007' })).toContain('オフ')
  expect(locationError({ code: 'OS-PLUG-GLOC-0010' })).toContain('時間切れ')
})

test('explicit location finds nearby real stations, retains detail/list navigation, and never persists GPS-derived views', async ({
  page,
  context,
}) => {
  await mockLocation(page)
  const external: string[] = []
  context.on('request', (r) => {
    if (r.url().startsWith('https://')) external.push(r.url())
  })
  await enter(page)
  expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(0)
  const before = (await persisted(page)).realMap
  await request(page)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await expectMapStationCount(page, expected.length)
  await expect(page.locator('.real-map-preview')).toContainText('直線距離順')
  // WebKit can round the previous manual view by a fraction of a CSS pixel
  // during its initial ResizeObserver pass, before the GPS view mounts.
  const manual = (await persisted(page)).realMap
  expect(manual.bounds).toEqual(before.bounds)
  expect(manual.center.lat).toBeCloseTo(before.center.lat, 3)
  expect(manual.center.lng).toBeCloseTo(before.center.lng, 3)
  const first = expected[0]
  // Dense pins may be grouped; the nearest candidate also opens from the bottom card.
  await page.locator('.real-map-preview .real-station-main').click()
  await page.getByRole('button', { name: '拠点の詳細・保存へ', exact: true }).click()
  await page.getByRole('button', { name: '車候補に保存', exact: true }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(expected.length)
  await expect(page.locator('.real-station-card').first()).toContainText(first.name)
  await page.getByRole('button', { name: 'カーシェア', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(
    expected.filter((s) => s.type === 'カーシェア').length,
  )
  await page.getByRole('button', { name: 'すべて', exact: true }).click()
  await page.getByRole('button', { name: '地図で見る', exact: true }).click()
  await page.getByRole('button', { name: '地図を拡大', exact: true }).click()
  await page.getByRole('button', { name: '移動したエリアで検索', exact: true }).click()
  await expect(page.locator('.real-map-heading')).toContainText('表示中の地図範囲')
  expect((await persisted(page)).realMap).toEqual(manual)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(String(point.lat))
  expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(1)
  expect(external.length).toBeGreaterThan(0)
  expect(external.every((url) => url.startsWith(mapPattern.slice(0, -2)))).toBe(true)
  await page.reload()
  await expectMapStationCount(page, 10)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  expect((await persisted(page)).savedStations).toContain(first.id)
})

for (const [name, options, message] of [
  ['denied', { error: 1 }, '位置情報が許可されていません'],
  ['unavailable', { error: 2 }, '現在地を取得できませんでした'],
  ['timeout', { error: 3 }, '時間切れ'],
  ['coarse', { accuracy: 3000 }, '誤差が大きい'],
  ['stale', { age: 180000 }, '古い位置情報'],
  ['future-clock', { age: -20000 }, '時刻より先'],
  ['outside-japan', { lat: 37.33, lng: -122.03 }, '国内の地図表示範囲外'],
  ['unsupported-browser', { unsupported: true }, 'この接続では'],
] as const) {
  test(`${name}: location does not invent a point and manual area search remains usable`, async ({
    page,
  }) => {
    await mockLocation(page, options)
    await enter(page)
    await request(page)
    await expect(page.getByRole('alert')).toContainText(message)
    if (name !== 'unsupported-browser')
      expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(
        name === 'stale' ? 2 : 1,
      )
    await page.getByRole('button', { name: '地域名から探す', exact: true }).click()
    await page.getByLabel('駅名・地域から車を探す', { exact: true }).fill('新宿')
    await page.getByRole('button', { name: '地域を検索', exact: true }).click()
    await expectMapStationCount(page, 27)
    await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  })
}

test('a stale fix is retried once; only the fresh result is shown and nothing starts a watch', async ({
  page,
}) => {
  await mockLocation(page, { ages: [180000, 0] })
  await enter(page)
  await request(page)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(2)
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(String(point.lat))
})

test('cancel during the stale retry ignores its late result and never retries again', async ({
  page,
}) => {
  await mockLocation(page, { ages: [180000, 0], delayed: true })
  await enter(page)
  await request(page)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
    .toBe(1)
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
    .toBe(2)
  await page.getByRole('button', { name: '地域名から探す', exact: true }).click()
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  await expectMapStationCount(page, 10)
  expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(2)
})

test('the shared deadline rejects a hung request; a late stale fix cannot start a retry', async ({
  page,
}) => {
  await mockLocation(page, { age: 180000, delayed: true })
  await page.clock.install()
  await enter(page)
  await request(page)
  // The Capacitor adapter loads asynchronously. Advance the simulated clock only
  // after the geolocation request has registered its delayed callback.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
    .toBe(1)
  await page.clock.fastForward(30001)
  await expect(page.getByRole('alert')).toContainText('時間切れ')
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(1)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
})

test('backgrounding before a stale response prevents another request and does not show a cancellation error', async ({
  page,
}) => {
  await mockLocation(page, { age: 180000, delayed: true })
  await enter(page)
  await request(page)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
    .toBe(1)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    ;(window as unknown as { deliver: () => void }).deliver()
  })
  await expect(page.getByRole('button', { name: '現在地を取得', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { calls: number }).calls)).toBe(1)
})

test('cancel ignores a late result; a second explicit request can succeed', async ({ page }) => {
  await mockLocation(page, { delayed: true })
  await enter(page)
  await request(page)
  await expect(page.getByText('位置情報を取得しています…')).toBeVisible()
  await page.getByRole('button', { name: '地域名から探す', exact: true }).click()
  await page.getByRole('button', { name: '滋賀・草津', exact: true }).click()
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  await expectMapStationCount(page, 3)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  await request(page)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
    .toBe(2)
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  await expectMapStationCount(page, expected.length)
})

test('location outside station coverage explains the limit and offers manual search', async ({
  page,
}) => {
  await mockLocation(page, { lat: 30, lng: 140 }) // Sea: no registered stations within 2 km
  await enter(page)
  await request(page)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await expectMapStationCount(page, 0)
  await expect(page.locator('.real-map-empty')).toContainText('店舗がないという意味ではありません')
  await page.getByRole('button', { name: '掲載外の地域・拠点を探す', exact: true }).click()
  await expect(page.getByLabel('探す駅・地域', { exact: true })).toHaveValue('')
})

test('location expires after ten minutes and manual search clears the transient position', async ({
  page,
}) => {
  await mockLocation(page)
  await page.clock.install()
  await enter(page)
  await request(page)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await page.clock.fastForward(601000)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  await expectMapStationCount(page, 10)
  await request(page)
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await page.getByRole('button', { name: '大阪・梅田', exact: true }).click()
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  await expectMapStationCount(page, 6)
})

test('unresponsive location calls time out and backgrounding clears a successful position', async ({
  page,
}) => {
  await mockLocation(page, { delayed: true })
  await page.clock.install()
  await enter(page)
  await request(page)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
    .toBe(1)
  await page.clock.fastForward(31000)
  await expect(page.getByRole('alert')).toContainText('時間切れ')
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
  await page.getByRole('button', { name: '現在地を取得', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { calls: number }).calls))
    .toBe(2)
  await page.evaluate(() => (window as unknown as { deliver: () => void }).deliver())
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('img', { name: '取得した現在地' })).toHaveCount(0)
})
