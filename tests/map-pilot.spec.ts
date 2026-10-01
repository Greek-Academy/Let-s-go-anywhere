import { test, expect, mapFixture, mapPattern } from './support/mapFixture'
import { TileCache, tileUrl } from '../src/domain/mapTiles'

test('tile cache bounds memory, expires, deduplicates, and does not cache failed requests', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls++
    return new Response(new Uint8Array(6))
  }
  const cache = new TileCache(fetcher, 12)
  const a = cache.acquire(tileUrl(1, 1, 12)),
    shared = cache.acquire(tileUrl(1, 1, 12))
  await Promise.all([a.promise, shared.promise])
  a.release()
  shared.release()
  expect(calls).toBe(1)
  await cache.acquire(tileUrl(1, 1, 12)).promise
  await cache.acquire(tileUrl(2, 1, 12)).promise
  await cache.acquire(tileUrl(3, 1, 12)).promise
  expect(cache.snapshot().cachedBytes).toBe(12)
  expect(cache.snapshot().hits).toBe(1)
  await cache.acquire(tileUrl(1, 1, 12)).promise
  expect(calls).toBe(4)
  const expired = new TileCache(fetcher, 12, 0)
  await expired.acquire(tileUrl(1, 1, 12)).promise
  await expired.acquire(tileUrl(1, 1, 12)).promise
  expect(expired.snapshot().hits).toBe(0)
  let fail = true
  const retry = new TileCache(async () =>
    fail ? new Response('', { status: 503 }) : new Response(mapFixture),
  )
  await expect(retry.acquire(tileUrl(1, 1, 12)).promise).rejects.toThrow('503')
  expect(retry.snapshot().cachedTiles).toBe(0)
  fail = false
  await retry.acquire(tileUrl(1, 1, 12)).promise
  expect(retry.snapshot().completed).toBe(1)
  expect(() => tileUrl(1, 1, 18)).toThrow('coordinates')
  expect(() => cache.acquire('https://evil.example/map')).toThrow('source')
})

test('abandoned tiles abort after the last consumer; a new consumer can retry', async () => {
  let aborted = 0
  const cache = new TileCache(
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options!.signal!.addEventListener('abort', () => {
          aborted++
          reject(new DOMException('Aborted', 'AbortError'))
        })
      }),
  )
  const a = cache.acquire(tileUrl(1, 1, 12)),
    b = cache.acquire(tileUrl(1, 1, 12))
  const settled = Promise.allSettled([a.promise, b.promise])
  a.release()
  expect(aborted).toBe(0)
  b.release()
  b.release()
  await settled
  expect(aborted).toBe(1)
  expect(cache.snapshot().cachedBytes).toBe(0)
})

test('three regions retain map/list selection, use only tile requests and reuse recently viewed tiles', async ({
  page,
  context,
}) => {
  const urls: string[] = []
  await context.route(mapPattern, (route) => {
    urls.push(route.request().url())
    return route.fulfill({ body: mapFixture, contentType: 'application/vnd.mapbox-vector-tile' })
  })
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '車を探す', exact: true }).click()
  for (const [name, count] of [
    ['大阪・梅田', 5],
    ['滋賀・草津', 3],
    ['京都中心部', 10],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('.real-map-pin')).toHaveCount(count)
    await expect(page.locator('.real-map-status')).toHaveCount(0)
    await expect(page.locator('[data-map-ready="true"]').first()).toBeVisible()
    await page.getByRole('button', { name: '一覧で見る', exact: true }).click()
    await expect(page.locator('.real-station-card')).toHaveCount(count)
    await page.locator('.real-station-main').first().click()
    await expect(page.getByText('データ取得日', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '車候補に保存', exact: true }).click()
    await page.getByRole('button', { name: '戻る', exact: true }).click()
    await page.getByRole('button', { name: '地図で見る', exact: true }).click()
  }
  const before = urls.length
  await page.getByRole('button', { name: '大阪・梅田', exact: true }).click()
  await expect(page.locator('.real-map-status')).toHaveCount(0)
  expect(urls.length).toBe(before)
  await page.getByRole('button', { name: '出典・掲載範囲' }).click()
  await page.getByText('今回の地図読み込み（検証用）', { exact: true }).click()
  expect(parseInt(await page.locator('[data-metric="hits"]').innerText())).toBeGreaterThan(0)
  await page.reload()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.getByRole('button', { name: '車候補 3', exact: true }).click()
  await expect(page.locator('.real-station-card')).toHaveCount(3)
})

test('malformed tiles show failure and can be retried without affecting stations', async ({
  page,
  context,
}) => {
  await context.route(mapPattern, (route) => route.fulfill({ body: 'not a tile' }))
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '車を探す', exact: true }).click()
  await expect(page.locator('.real-map-status')).toContainText('地図を読み込めません')
  await expect(page.locator('.real-map-pin')).toHaveCount(10)
  await context.route(mapPattern, (route) => route.fulfill({ body: mapFixture }))
  await page.getByRole('button', { name: '地図を再読み込み' }).click()
  await expect(page.locator('.real-map-status')).toHaveCount(0)
})
