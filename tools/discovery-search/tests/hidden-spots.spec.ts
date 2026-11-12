import { test, expect, type Page, type TestInfo } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
import { driveQuery, driveTheme } from '../../../src/domain/driveSearch'
// @ts-expect-error Node-only fixture; no paid upstream requests.
import { runComparison } from '../../spot-comparison/providers.mjs'

const first = '森のカフェ（表示サンプル）'
const second = '湖畔の遊歩道（表示サンプル）'
const key = 'driveplus.mock.v1'
const drive = driveQuery('default', undefined, ['自然'])
const query = { stationId: '1130208', region: '東京都 新宿駅周辺', theme: driveTheme(drive), drive }
async function stored(page: Page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), key)
}
async function setup(page: Page, options: { gps?: boolean; invalid?: boolean } = {}) {
  const result = await runComparison({ query, demo: true, searchProvider: 'brave' })
  result.mode = 'live'
  result.spots = result.spots.slice(0, 2)
  for (const [i, spot] of result.spots.entries()) {
    spot.name = i === 0 ? first : second
    spot.area = '東京都（架空の表示サンプル）'
    spot.travel = { ...spot.travel, status: 'calculated' }
  }
  result.spots[0].googleRating = {
    rating: 4.3,
    count: 128,
    mapsUrl: 'https://maps.google.com/?cid=123',
    checkedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    attributions: [],
  }
  const state = createInitialState()
  state.onboarded = true
  state.profile.interests = ['自然']
  state.discover.region = options.gps ? 'origin' : 'station'
  state.discover.stationId = options.gps ? null : query.stationId
  const requests: any[] = []
  await page.addInitScript(
    ({ state, key, gps, invalid }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(
          key,
          JSON.stringify({
            ...state,
            ...(invalid ? { hiddenWebSpots: [{ name: 'broken' }] } : {}),
          }),
        )
      if (gps)
        Object.defineProperty(navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition(success: (v: unknown) => void) {
              success({
                timestamp: Date.now(),
                coords: { latitude: 35.690921, longitude: 139.700258, accuracy: 20 },
              })
            },
          },
        })
    },
    { state, key, ...options },
  )
  await page.route('**/api/spot-search/comparison-status', (r) =>
    r.fulfill({
      json: {
        demo: false,
        configured: true,
        searchProvider: 'brave',
        busy: false,
        token: 'a'.repeat(64),
        maxAttempts: null,
        attempts: [],
      },
    }),
  )
  await page.route('**/api/spot-search/compare', async (r) => {
    const body = r.request().postDataJSON()
    requests.push(body)
    const next = structuredClone(result)
    next.query = {
      region: body.region,
      theme: body.theme,
      drive: body.drive,
      ...(body.stationId ? { stationId: body.stationId } : {}),
      ...(body.location ? { location: body.location } : {}),
    }
    // A new search changes IDs (derived from source URLs) and sources, never the place identity.
    for (const [i, spot] of next.spots.entries()) {
      if (body.drive.mode !== 'default') {
        delete spot.matchedHobbies
        delete spot.hobby
      }
      spot.sourceUrl = `https://example.com/search-${requests.length}/spot-${i}`
      for (const proposal of spot.recommendations ?? []) proposal.sourceUrl = spot.sourceUrl
    }
    await r.fulfill({ json: next })
  })
  await page.goto('/#/discover')
  if (!options.gps)
    await page.getByRole('button', { name: 'この出発地からドライブ先を探す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(2)
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  return requests
}
const hide = (page: Page, name: string) =>
  page.getByRole('button', { name: `${name}を今後表示しない`, exact: true }).click()
async function manage(page: Page) {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'マイページ', exact: true })
    .click()
  await page.getByRole('button', { name: /非表示にしたスポット/ }).click()
}
async function capture(page: Page, info: TestInfo, name: string) {
  if (process.env.CAPTURE_HIDDEN && info.project.name === 'desktop') {
    await page.locator('.phone-screen').evaluate((el) => {
      el.scrollTop = 0
    })
    await page.locator('#app-scroll').evaluate((el) => {
      el.scrollTop = 0
    })
    await page
      .locator('.mobile-frame')
      .screenshot({ path: `docs/reviews/hidden-spots/${name}.png`, animations: 'disabled' })
  }
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('非表示と復元（架空の検証データ）', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})

test('保存は残し、非表示・取り消し・一覧から復元。全件非表示を区別し追加APIなし', async ({
  page,
}, info) => {
  const requests = await setup(page)
  await capture(page, info, 'card')
  await page.getByRole('button', { name: `${first}を保存`, exact: true }).click()
  await expect.poll(async () => (await stored(page)).savedWebSpots.length).toBe(1)
  await hide(page, first)
  await expect(page.locator('.web-spot-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeFocused()
  await capture(page, info, 'undo')
  await page.getByRole('button', { name: '元に戻す', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(2)
  await hide(page, first)
  await page.getByRole('button', { name: '通知を閉じる', exact: true }).click()
  await hide(page, second)
  await expect(
    page.getByRole('heading', { name: 'この検索結果の候補はすべて非表示になっています' }),
  ).toBeVisible()
  await expect(page.getByText('この条件の候補はありません', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '通知を閉じる', exact: true }).click()
  await capture(page, info, 'all-hidden')
  await page.getByRole('button', { name: '非表示にしたスポットを見る', exact: true }).click()
  await expect(page.locator('.hidden-spots-list li')).toHaveCount(2)
  await capture(page, info, 'list')
  const data = await stored(page)
  expect(data.savedWebSpots).toHaveLength(1)
  expect(data.hiddenWebSpots).toEqual([
    { name: first, area: '東京都（架空の表示サンプル）', mode: 'live' },
    { name: second, area: '東京都（架空の表示サンプル）', mode: 'live' },
  ])
  expect(JSON.stringify(data)).not.toMatch(/googleRating|maps.google.com|durationSeconds/)
  await page.getByRole('button', { name: `${first}を再び候補に表示する`, exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(1)
  await expect(page.locator('.web-spot-card')).toContainText(first)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-web-spot')).toHaveCount(1)
  expect(requests).toHaveLength(1)
  await manage(page)
  await page.getByRole('button', { name: `${second}を再び候補に表示する`, exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '非表示にしたスポットはありません' }),
  ).toBeVisible()
})

test('再起動・趣味・自由入力・気分の検索と過去結果でも非表示を維持。送信条件に履歴を含めない', async ({
  page,
}) => {
  const requests = await setup(page, { gps: true })
  await hide(page, first)
  await expect.poll(async () => (await stored(page)).hiddenWebSpots.length).toBe(1)
  await page.reload()
  await expect(page.locator('.web-spot-card')).toHaveCount(1)
  await expect(page.locator('.web-spot-card')).toContainText(second)
  await page.getByRole('textbox', { name: 'お出かけを検索' }).fill('カフェに行きたい')
  await page.getByRole('button', { name: 'この希望で探す', exact: true }).click()
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.web-spot-card')).toHaveCount(1)
  await page.getByRole('button', { name: '気分から選ぶ', exact: true }).click()
  await page.getByRole('button', { name: '夜景を見たい', exact: true }).click()
  await page.getByRole('button', { name: '選んだ条件で探す', exact: true }).click()
  await expect(page.locator('.web-search-results')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.web-spot-card')).toHaveCount(1)
  await page.getByRole('button', { name: '趣味のおすすめ', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(1)
  expect(requests).toHaveLength(4)
  expect(requests.map((body) => body.drive.mode)).toEqual([
    'default',
    'default',
    'free',
    'conditions',
  ])
  expect(JSON.stringify(requests)).not.toMatch(/hiddenWebSpots|表示サンプル/)
  await manage(page)
  await page.reload()
  await expect(page.locator('.hidden-spots-list li')).toHaveCount(1)
  await page.getByRole('button', { name: `${first}を再び候補に表示する`, exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '非表示にしたスポットはありません' }),
  ).toBeVisible()
  expect(requests).toHaveLength(4)
})

test('保存失敗は成功と案内せず、再試行で保存できる。元データ保護中は操作不可', async ({ page }) => {
  await setup(page)
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    ;(window as any).failHiddenWrite = true
    Storage.prototype.setItem = function (k, value) {
      if (k === key && (window as any).failHiddenWrite)
        throw new DOMException('test quota', 'QuotaExceededError')
      return original.call(this, k, value)
    }
  }, key)
  await hide(page, first)
  await expect(page.locator('.toast')).toContainText('非表示の変更を保存できませんでした')
  expect((await stored(page)).hiddenWebSpots).toEqual([])
  await expect(page.locator('.storage-notice')).toBeVisible()
  await page.getByRole('button', { name: '通知を閉じる', exact: true }).click()
  await page.getByRole('button', { name: '保存の状態を確認', exact: true }).click()
  await page.evaluate(() => {
    ;(window as any).failHiddenWrite = false
  })
  await page.getByRole('button', { name: '保存をもう一度試す', exact: true }).click()
  await expect.poll(async () => (await stored(page)).hiddenWebSpots.length).toBe(1)
  await expect(page.locator('.storage-notice')).toHaveCount(0)
  await page.getByRole('button', { name: 'モックの保存データを削除', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('非表示にしたスポット')
  await page.getByRole('button', { name: '削除して最初から始める', exact: true }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
  await expect.poll(async () => (await stored(page)).hiddenWebSpots).toEqual([])
})

test('不正な非表示データがある場合は上書きせず、保存済みの元データを保護する', async ({ page }) => {
  await setup(page, { invalid: true })
  await expect(
    page.getByRole('button', { name: `${first}を今後表示しない`, exact: true }),
  ).toBeDisabled()
  const before = await stored(page)
  await manage(page)
  expect(await stored(page)).toEqual(before)
  await expect(page.locator('.storage-notice')).toBeVisible()
})
