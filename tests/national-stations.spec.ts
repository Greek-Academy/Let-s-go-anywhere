import { expectMapStationCount } from './support/mapFixture'
import { test, expect } from './support/mapFixture'
import type { Page } from '@playwright/test'
import {
  realStations,
  createRealMapState,
  searchStationArea,
  nationalBounds,
  filterRealStations,
} from '../src/domain/realStations'
import { groupStations } from '../src/domain/stationClusters'
import { nearbyStations } from '../src/domain/nearbyStations'
import kyoto from '../src/data/kyoto-car-stations.osm.json' with { type: 'json' }
import umeda from '../src/data/umeda-car-stations.osm.json' with { type: 'json' }
import kusatsu from '../src/data/kusatsu-car-stations.osm.json' with { type: 'json' }
import shinjuku from '../src/data/shinjuku-car-stations.osm.json' with { type: 'json' }

async function enter(page: Page) {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '車を探す', exact: true }).click()
}
async function search(page: Page, query: string) {
  await page.getByLabel('駅名・地域から車を探す', { exact: true }).fill(query)
  await page.getByRole('button', { name: '地域を検索', exact: true }).click()
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('nationwide clusters retain every ID, cover several cities and preserve all 45 previous saved IDs', () => {
  const groups = groupStations(realStations, 5, nationalBounds)
  expect(groups.length).toBeLessThan(250)
  expect(groups.length).toBeGreaterThan(10)
  expect(
    groups
      .flatMap((g) => g.stations)
      .map((s) => s.id)
      .sort(),
  ).toEqual(realStations.map((s) => s.id).sort())
  for (const old of [kyoto, umeda, kusatsu, shinjuku]) {
    for (const item of old.elements)
      expect(realStations.some((s) => s.id === `osm-${item.type}-${item.id}`)).toBe(true)
  }
  for (const city of ['浜松町', '札幌', '仙台', '名古屋', '広島', '福岡・博多', '那覇']) {
    expect(
      filterRealStations({ ...createRealMapState(), bounds: searchStationArea(city)!.bounds })
        .length,
    ).toBeGreaterThan(0)
  }
  // Public Hamamatsucho station coordinates: bounded proximity, not claimed live GPS.
  const nearby = nearbyStations(createRealMapState(), {
    lat: 35.6554,
    lng: 139.7571,
    accuracy: 30,
    timestamp: 1,
  })
  expect(nearby).toHaveLength(3)
  expect(
    realStations
      .filter((station) => station.type === 'カーシェア')
      .every(
        (station) =>
          station.officialSearchProvider === null || station.officialSearchProvider === 'times',
      ),
  ).toBe(true)
  const overlapping = [realStations[0], { ...realStations[0], id: 'test-other' }]
  expect(groupStations(overlapping, 18, nationalBounds)[0].stations).toHaveLength(2)
})

test('Hamamatsucho and nationwide map/list searches, pagination, filtering, detail/save/reload work', async ({
  page,
}) => {
  await enter(page)
  await search(page, '浜松町')
  await expect(page.locator('.real-map-heading')).toContainText('浜松町')
  const expected = filterRealStations({
    ...createRealMapState(),
    bounds: searchStationArea('浜松町')!.bounds,
  })
  await expectMapStationCount(page, expected.length)
  await page.locator('.real-map-preview .real-station-main').click()
  await page.getByRole('button', { name: '拠点の詳細・保存へ', exact: true }).click()
  await page.getByRole('button', { name: '車候補に保存', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '車候補から外す', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await search(page, '全国')
  await expect(page.locator('.real-map-heading')).toContainText('2927件')
  await expect.poll(() => page.locator('.real-map-cluster').count()).toBeGreaterThan(0)
  expect(await page.locator('.real-map-pin, .real-map-cluster').count()).toBeLessThan(250)
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).realMap.zoom),
    )
    .toBeLessThanOrEqual(5)
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).realMap.zoom,
  )
  await page.locator('.real-map-cluster').first().click()
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).realMap.zoom),
    )
    .toBe(before + 2)
  await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(50)
  await page.getByRole('button', { name: 'さらに50件を表示', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(100)
  await page.getByRole('button', { name: '車の事業者フィルター', exact: true }).click()
  await page.getByRole('checkbox', { name: 'トヨタレンタカー', exact: true }).check()
  await page.getByRole('button', { name: 'この条件で表示', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(50)
  const titles = await page.locator('.real-station-main strong').allTextContents()
  const toyotaNames = new Set(
    realStations
      .filter((station) => station.provider === 'トヨタレンタカー')
      .map((station) => station.name),
  )
  expect(titles.every((title) => toyotaNames.has(title))).toBe(true)
  await page.getByRole('button', { name: '地図で見る', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '車の事業者フィルター' })).toHaveClass(/has-filter/)
})

test('catalog name search keeps matching IDs on reload and missing saved IDs remain visible', async ({
  page,
}) => {
  await enter(page)
  const query = '三田札の辻'
  await search(page, query)
  await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(1)
  await expect(page.locator('.real-station-card')).toContainText(query)
  await page.reload()
  await expect(page.locator('.real-station-card')).toHaveCount(1)
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('driveplus.mock.v1')!)
    state.savedStations.push('osm-node-999999999999')
    localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
  })
  await page.reload()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.getByRole('button', { name: /車候補/ }).click()
  await expect(page.getByText('保存した拠点の情報を確認できません', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'この車候補の保存を解除', exact: true }).click()
  await expect(page.getByText('保存した拠点の情報を確認できません', { exact: true })).toHaveCount(0)
})

test('Sapporo GPS finds nationwide data with no server search, no persisted position and no fee API', async ({
  page,
  context,
}) => {
  const calls: string[] = []
  context.on('request', (request) => {
    if (request.url().startsWith('https://')) calls.push(request.url())
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: (value: unknown) => void) =>
          success({
            timestamp: Date.now(),
            coords: { latitude: 43.0687, longitude: 141.3508, accuracy: 20 },
          }),
      },
    })
  })
  await enter(page)
  await page.getByRole('button', { name: '現在地から探す', exact: true }).click()
  const before = await page.evaluate(
    () => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).realMap,
  )
  await page.getByRole('button', { name: '現在地を取得', exact: true }).click()
  await expect(page.getByRole('img', { name: '取得した現在地' })).toBeVisible()
  await expectMapStationCount(
    page,
    nearbyStations(createRealMapState(), {
      lat: 43.0687,
      lng: 141.3508,
      accuracy: 20,
      timestamp: 1,
    }).length,
  )
  const persisted = await page.evaluate(
    () => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).realMap,
  )
  // Leaflet may round the original manual center to screen pixels during its first layout.
  expect(persisted.center.lat).toBeCloseTo(before.center.lat, 3)
  expect(persisted.center.lng).toBeCloseTo(before.center.lng, 3)
  expect({ ...persisted, center: before.center }).toEqual(before)
  expect(JSON.stringify(persisted)).not.toContain('43.0687')
  expect(
    calls.every((url) =>
      url.startsWith('https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/'),
    ),
  ).toBe(true)
})
