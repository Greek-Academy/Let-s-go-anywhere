import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../../../src/state/model'
import { driveQuery, emptyDriveChoices } from '../../../src/domain/driveSearch'
const first = 'サンプル01・小さな喫茶店'
async function enter(page: Page) {
  const state = createInitialState()
  state.onboarded = true
  state.profile.interests = ['音楽', '自然']
  state.discover.search = '海鮮を食べたい'
  await page.addInitScript((s) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(s))
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success: (v: unknown) => void) {
          success({
            timestamp: Date.now(),
            coords: { latitude: 35.690921, longitude: 139.700258, accuracy: 20 },
          })
        },
        watchPosition() {
          throw new Error('must not track')
        },
      },
    })
  }, state)
  await page.goto('/#/discover')
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('ドライブ検索', { body: await page.screenshot(), contentType: 'image/png' })
})
test('GPS starts one search, ten time-labelled cards; modes are independent and saved data excludes routes and coordinates', async ({
  page,
}) => {
  const bodies: Record<string, any>[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('/api/spot-search/compare')) bodies.push(r.postDataJSON())
  })
  await enter(page)
  await expect(page.getByRole('button', { name: 'お出かけの絞り込み' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '前回の比較結果を開く（無料）' })).toHaveCount(0)
  expect(bodies).toHaveLength(0)
  await page.getByRole('button', { name: '現在地からドライブ先を探す', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Google')
  await page.getByRole('button', { name: '現在地を取得して検索', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({
    location: { lat: 35.691, lng: 139.7 },
    drive: driveQuery('default'),
  })
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '車で片道 約',
  )
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '架空の時間',
  )
  await page.getByRole('button', { name: first + 'を保存', exact: true }).click()
  await page.getByRole('button', { name: first + 'の詳細を見る', exact: true }).click()
  await expect(page.locator('.event-detail .drive-travel-info')).toContainText('車で片道 約')
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  const free = page.getByRole('textbox', { name: 'お出かけを検索' })
  await free.fill('海鮮を食べたい')
  await page.getByRole('button', { name: 'この希望で探す', exact: true }).click()
  await expect(page.locator('.web-query-label')).toContainText('海鮮を食べたい')
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies[1].drive).toEqual(driveQuery('free'))
  await page.getByRole('button', { name: /気分からドライブを探す/ }).click()
  await page.getByRole('button', { name: '夜景を見たい', exact: true }).click()
  await page.getByRole('button', { name: '県を越えたい', exact: true }).click()
  await page.getByRole('button', { name: '1〜2時間', exact: true }).click()
  expect(bodies).toHaveLength(2)
  await page.getByRole('button', { name: '選んだ条件で探す', exact: true }).click()
  await expect(page.locator('.web-drive-query-label')).toContainText('夜景を見たい')
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  expect(bodies[2].theme).not.toContain('海鮮')
  expect(bodies[2].drive).toEqual(
    driveQuery('conditions', {
      ...emptyDriveChoices(),
      duration: '1〜2時間',
      activities: ['夜景を見たい'],
      road: '県を越えたい',
    }),
  )
  await page.getByRole('button', { name: '自由入力の結果', exact: true }).click()
  await expect(page.locator('.web-query-label')).toContainText('海鮮を食べたい')
  await page.getByRole('button', { name: 'イベント', exact: true }).click()
  await page.getByRole('button', { name: '趣味のイベントを探す', exact: true }).click()
  await expect(page.getByRole('heading', { name: '10件のイベント候補' })).toBeVisible()
  expect(bodies[3].drive).toEqual(driveQuery('events', undefined, ['音楽', '自然']))
  expect(bodies[3].theme).toBe('イベント')
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click()
  await page.getByRole('button', { name: 'ドライブデート', exact: true }).click()
  await expect(page.locator('.web-query-label')).toContainText('ドライブデートを楽しめる行き先')
  expect(bodies).toHaveLength(4)
  const raw = await page.evaluate(() => localStorage.getItem('driveplus.mock.v1')!)
  for (const secret of ['35.691', '139.7', 'durationSeconds', 'distanceMeters', 'travel'])
    expect(raw).not.toContain(secret)
  expect(JSON.parse(raw).savedWebSpots).toHaveLength(1)
  await page.reload()
  await expect(page.locator('.web-spot-card')).toHaveCount(0)
  expect(bodies).toHaveLength(4)
  await page.goto('/#/saved')
  await page.locator('.saved-web-spot').getByRole('button').first().click()
  await expect(page.locator('.event-detail .drive-travel-info')).toContainText('未確認')
})
test('failed route calculations retain candidates with unconfirmed labels and no invented duration', async ({
  page,
}) => {
  await enter(page)
  await page.route('**/api/spot-search/compare', async (r) => {
    const response = await r.fetch()
    const json = await response.json()
    json.spots = json.spots.map((s: object) => ({ ...s, travel: { status: 'unconfirmed' } }))
    await r.fulfill({ json })
  })
  await page.getByRole('button', { name: '現在地からドライブ先を探す', exact: true }).click()
  await page.getByRole('button', { name: '現在地を取得して検索', exact: true }).click()
  await expect(page.locator('.web-spot-card')).toHaveCount(10)
  await expect(page.locator('.web-spot-card .drive-travel-info').first()).toContainText(
    '所要時間は未確認',
  )
  await expect(page.getByText(/車で片道 約/)).toHaveCount(0)
})
