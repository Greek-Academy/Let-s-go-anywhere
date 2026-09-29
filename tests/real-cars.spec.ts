import { expect, test } from './support/mapFixture'
import type { Page } from '@playwright/test'
import {
  createRealMapState,
  filterRealStations,
  findPilotArea,
  pilotBounds,
  realStations,
  stationSnapshot,
} from '../src/domain/realStations'
import { evaluateExternalRequest } from '../src/domain/externalLinks'
import { createInitialState } from '../src/state/model'
import { decodeStoredState } from '../src/state/storage'

async function enter(page: Page) {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '車を探す', exact: true }).click()
}
const state = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))

test('snapshot is bounded, traceable, and rental/sharing filters use coordinates without inventing availability', () => {
  expect(realStations).toHaveLength(10)
  expect(new Set(realStations.map((station) => station.id)).size).toBe(10)
  expect(stationSnapshot.osm3s.copyright).toContain('ODbL')
  for (const station of realStations) {
    expect(station.sourceUrl).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way)\/\d+$/)
    expect(station.latitude).toBeGreaterThanOrEqual(pilotBounds.south)
    expect(station.latitude).toBeLessThanOrEqual(pilotBounds.north)
    expect(station.longitude).toBeGreaterThanOrEqual(pilotBounds.west)
    expect(station.longitude).toBeLessThanOrEqual(pilotBounds.east)
    expect(station).not.toHaveProperty('available')
  }
  const map = createRealMapState()
  expect(filterRealStations({ ...map, type: 'カーシェア' })).toHaveLength(2)
  expect(filterRealStations({ ...map, providers: ['トヨタレンタカー'] })).toHaveLength(1)
  expect(filterRealStations({ ...map, unsupported: true })).toHaveLength(0)
  expect(filterRealStations({ ...map, bounds: findPilotArea('京都駅')!.bounds })).toHaveLength(6)
  expect(findPilotArea('大阪')).toBeUndefined()
})

test('legacy data survives the map upgrade; invalid coordinates and unknown outbound station IDs fail closed', () => {
  const old = createInitialState()
  old.savedStations = ['times-shibuya']
  const { realMap: _, ...legacy } = old
  const parsed = decodeStoredState(JSON.stringify(legacy))
  expect(parsed.problem).toBeNull()
  expect(parsed.state.realMap).toEqual(createRealMapState())
  expect(parsed.state.savedStations).toEqual(['times-shibuya'])
  expect(
    decodeStoredState(
      JSON.stringify({ ...old, realMap: { ...old.realMap, center: { lat: 500, lng: 100 } } }),
    ).problem,
  ).toBe('invalid')
  expect(
    evaluateExternalRequest({ type: 'station-snapshot', id: 'https://evil.example', target: 'map' })
      .block,
  ).toBe('invalid')
  const decision = evaluateExternalRequest({
    type: 'station-snapshot',
    id: realStations[0].id,
    target: 'map',
  })
  expect(new URL(decision.destination!.url).searchParams.get('query')).toBe('35.010531,135.758918')
  expect(
    evaluateExternalRequest({ type: 'listing', catalogSource: 'sample', kind: 'map' }).block,
  ).toBe('sample')
})

test('real map pins open a sheet, then detail, save, persist, and return to map and saved cars', async ({
  page,
}) => {
  await enter(page)
  await expect(page.locator('.real-map-pin')).toHaveCount(10)
  await expect(page.locator('.real-map-credits')).toContainText('OpenStreetMap contributors')
  await page.getByRole('button', { name: '車の事業者フィルター' }).click()
  await page.getByRole('checkbox', { name: 'トヨタレンタカー', exact: true }).check()
  await page.getByRole('button', { name: 'この条件で表示', exact: true }).click()
  await page
    .getByRole('button', { name: 'トヨタレンタカー・レンタカーの詳細カード', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText('運営による確認日')
  await page.getByRole('button', { name: '拠点の詳細・保存へ' }).click()
  await expect(page.getByRole('heading', { name: 'トヨタレンタカー', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '車候補に保存', exact: true }).click()
  await page.getByRole('button', { name: '公式で空き状況・予約を確認' }).click()
  await expect(page.getByRole('link', { name: '公式の検索ページを開く' })).toHaveAttribute(
    'href',
    'https://rent.toyota.co.jp/shop/',
  )
  await expect(page.getByRole('dialog')).toContainText('自動で引き継がれません')
  await page.getByRole('button', { name: 'アプリに戻る', exact: true }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.real-map-pin.selected')).toHaveCount(1)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.getByRole('button', { name: '車候補 1', exact: true }).click()
  await expect(page.locator('.real-station-card')).toContainText('トヨタレンタカー')
  await page.reload()
  await page.locator('.real-station-main').click()
  await expect(page.getByRole('button', { name: '車候補から外す', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '車候補から外す', exact: true }).click()
  expect((await state(page)).savedStations).toEqual([])
})

test('area, type and provider filters apply equally to map and list; unknown areas have no invented pins', async ({
  page,
}) => {
  await enter(page)
  await page.getByLabel('駅名・地域から車を探す', { exact: true }).fill('京都駅')
  await page.getByRole('button', { name: '地域を検索', exact: true }).click()
  await expect(page.locator('.real-map-pin')).toHaveCount(6)
  await page.getByRole('button', { name: 'カーシェア', exact: true }).click()
  await expect(page.locator('.real-map-pin')).toHaveCount(0)
  await page.getByRole('button', { name: '京都の全掲載拠点を表示', exact: true }).click()
  await page.getByRole('button', { name: '車の事業者フィルター' }).click()
  await page.getByRole('checkbox', { name: 'トヨタレンタカー', exact: true }).check()
  await page.getByRole('button', { name: 'この条件で表示', exact: true }).click()
  await expect(page.locator('.real-map-pin')).toHaveCount(1)
  await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(1)
  await page.locator('.real-station-main').click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.real-station-main')).toBeFocused()
  await page.getByRole('button', { name: '地図で見る', exact: true }).click()
  await page.getByLabel('駅名・地域から車を探す', { exact: true }).fill('大阪')
  await page.getByRole('button', { name: '地域を検索', exact: true }).click()
  await expect(page.locator('.real-map-pin')).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'この地域はまだ収録していません' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '掲載外の地域・拠点を探す', exact: true }).click()
  await expect(page.getByLabel('探す駅・地域', { exact: true })).toHaveValue('大阪')
})

test('zoom and explicit viewport search persist without fetching new stations or leaking private data', async ({
  page,
  context,
}) => {
  const external: string[] = []
  context.on('request', (request) => {
    if (request.url().startsWith('https://')) external.push(request.url())
  })
  await enter(page)
  await page.getByLabel('駅名・地域から車を探す', { exact: true }).fill('京都駅')
  await page.getByRole('button', { name: '地域を検索', exact: true }).click()
  await expect
    .poll(async () => Math.abs((await state(page)).realMap.center.lat - 34.984))
    .toBeLessThan(0.001)
  const zoom = (await state(page)).realMap.zoom
  await page.getByRole('button', { name: '地図を拡大', exact: true }).click()
  await expect.poll(async () => (await state(page)).realMap.zoom).toBe(zoom + 1)
  await page.getByRole('button', { name: '移動したエリアで検索', exact: true }).click()
  const before = (await state(page)).realMap
  expect(before.appliedArea).toBe('表示中の地図範囲')
  const count = await page.locator('.real-map-pin').count()
  expect(count).toBeLessThan(10)
  await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
  await page.getByRole('button', { name: '地図で見る', exact: true }).click()
  await expect(page.locator('.real-map-pin')).toHaveCount(count)
  expect((await state(page)).realMap.zoom).toBe(before.zoom)
  expect(Math.abs((await state(page)).realMap.center.lat - before.center.lat)).toBeLessThan(0.001)
  await page.setViewportSize({ width: 360, height: 740 })
  await expect
    .poll(async () => Math.abs((await state(page)).realMap.center.lat - before.center.lat))
    .toBeLessThan(0.001)
  await page.reload()
  await expect(page.locator('.real-map-pin')).toHaveCount(count)
  expect((await state(page)).realMap.bounds).toEqual(before.bounds)
  expect(external.length).toBeGreaterThan(0)
  expect(
    external.every((url) =>
      /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/pale\/\d+\/\d+\/\d+\.png$/.test(url),
    ),
  ).toBe(true)
})

test('failed map tiles retain usable station list, source attribution and saved data', async ({
  page,
  context,
}) => {
  await context.route('https://cyberjapandata.gsi.go.jp/**', (route) => route.abort())
  await enter(page)
  await expect(page.getByText('地図を読み込めません。一覧からも拠点を確認できます。')).toBeVisible()
  await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(10)
  await page.locator('.real-station-main').first().click()
  await page.getByRole('button', { name: 'この拠点の出典を開く', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('公開地図の登録情報')
  await expect(page.getByRole('link', { name: '拠点の出典を開く', exact: true })).toHaveAttribute(
    'href',
    realStations[0].sourceUrl,
  )
})

test('small screens, attribution, filters and map source data remain accessible', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await enter(page)
  await expect(page.getByRole('button', { name: '一覧で見る', exact: true })).toBeInViewport()
  await expect(page.locator('.real-map-credits')).toBeInViewport()
  expect(
    await page.locator('.real-cars-screen').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
  await page.getByRole('button', { name: '車の事業者フィルター' }).click()
  await page.getByRole('checkbox', { name: 'タイムズカー', exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '車の事業者フィルター' })).toBeFocused()
  await expect(page.locator('.real-map-pin')).toHaveCount(10)
  await page.getByRole('button', { name: '出典・掲載範囲', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'まずは京都の10件から' })).toBeVisible()
  await page.getByText('元データを表示', { exact: true }).click()
  await expect(page.locator('details[open] pre')).toContainText('timestamp_osm_base')
  await expect(page.getByRole('link', { name: '拠点データのODbL 1.0' })).toHaveAttribute(
    'href',
    'https://opendatacommons.org/licenses/odbl/1-0/',
  )
})
