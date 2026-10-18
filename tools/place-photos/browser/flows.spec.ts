import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'

const photo = {
  imageUrl: 'https://lh3.googleusercontent.com/test-photo',
  sourceUrl: 'https://www.google.com/maps/place/?photo=test',
  authors: [{ name: '架空の撮影者', url: 'https://maps.google.com/maps/contrib/test' }],
}

test('手動取得だけ、出典を表示。対象外はイラスト、保存せず再読込で再課金しない', async ({
  page,
}) => {
  let posts = 0
  await page.route('**/api/place-photos/status', (r) =>
    r.fulfill({
      json: {
        configured: true,
        limit: 3,
        used: posts,
        consumed: posts ? ['inoda-honten'] : [],
        token: 'test-token',
      },
    }),
  )
  await page.route('**/api/place-photos/lookup', (r) => {
    posts++
    expect(r.request().postDataJSON()).toEqual({ id: 'inoda-honten' })
    return r.fulfill({ json: { photo, reason: '架空応答による表示確認' } })
  })
  // This is our bundled artwork, not a fetched Google photograph. No external request.
  await page.route('https://lh3.googleusercontent.com/**', (r) =>
    r.fulfill({
      path: resolve('public/images/spot-illustrations/cafe.jpg'),
      contentType: 'image/jpeg',
    }),
  )
  await page.goto('/#/photo-pilot')
  await expect(page.getByRole('button', { name: 'このお店の写真を確認する' })).toHaveCount(3)
  expect(posts).toBe(0)
  await page.getByRole('button', { name: 'このお店の写真を確認する' }).first().click()
  await expect(page.getByText('Google Maps', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '架空の撮影者' })).toHaveAttribute(
    'href',
    photo.authors[0].url,
  )
  await expect(page.getByRole('link', { name: '元の写真・問題の報告' })).toHaveAttribute(
    'href',
    photo.sourceUrl,
  )
  await expect
    .poll(() =>
      page.locator('.place-photo > img').evaluate((el: HTMLImageElement) => el.naturalWidth),
    )
    .toBe(960)
  await expect(page.locator('.photo-pilot-card .spot-illustration')).toHaveCount(3)
  const raw = await page.evaluate(() => JSON.stringify(localStorage))
  expect(raw).not.toContain('googleusercontent')
  expect(raw).not.toContain('架空の撮影者')
  await page.reload()
  await expect(page.getByRole('button', { name: '初回の取得は実行済み' })).toBeDisabled()
  expect(posts).toBe(1)
  await expect(page.locator('.spot-illustration')).toHaveCount(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('未設定・照合不一致・画像失敗でもイラストを残す', async ({ page }) => {
  let configured = false,
    posts = 0
  await page.route('**/api/place-photos/status', (r) =>
    r.fulfill({
      json: {
        configured,
        limit: 3,
        used: posts,
        consumed: [],
        token: 'test-token',
      },
    }),
  )
  await page.route('**/api/place-photos/lookup', (r) => {
    posts++
    return r.fulfill({
      json:
        posts === 1
          ? { photo: null, reason: '同じ店舗と一意に確認できません。' }
          : { photo, reason: '画像の失敗を確認' },
    })
  })
  await page.route('https://lh3.googleusercontent.com/**', (r) => r.abort())
  await page.goto('/#/photo-pilot')
  await expect(
    page.getByRole('button', { name: 'このお店の写真を確認する' }).first(),
  ).toBeDisabled()
  configured = true
  await page.getByRole('button', { name: '設定状況を再確認' }).click()
  await page.getByRole('button', { name: 'このお店の写真を確認する' }).first().click()
  await expect(page.getByText('同じ店舗と一意に確認できません。')).toBeVisible()
  await page.getByRole('button', { name: 'このお店の写真を確認する' }).first().click()
  await expect(
    page.getByText('写真を読み込めなかったため、イラストを表示しています。'),
  ).toBeVisible()
  await expect(page.locator('.spot-illustration')).toHaveCount(4)
  await expect(page.getByText('Google Maps', { exact: true })).toHaveCount(0)
  expect(posts).toBe(2)
})

test('開発サーバーでもキーを配信せず、外部Origin・トークンなし・対象外の取得を拒否', async ({
  request,
}) => {
  const status = await request.get('/api/place-photos/status')
  const data = await status.json()
  expect(data).not.toHaveProperty('key')
  expect(data).not.toHaveProperty('apiKey')
  // CI intentionally has no real .env.photos.local. Vite serves SPA HTML for a
  // missing file, so verify its deny rule using an existing, fake secret file.
  // A unique filename avoids touching the developer's actual key or other workers.
  const filename = `.env.photo-guard-${randomUUID()}.local`
  const path = resolve(filename)
  const sentinel = 'PHOTO_TEST_SENTINEL_NOT_A_REAL_KEY'
  await writeFile(path, `GOOGLE_PLACES_API_KEY=${sentinel}\n`, { flag: 'wx', mode: 0o600 })
  try {
    for (const url of [`/${filename}`, `/@fs${path}`]) {
      const denied = await request.get(url)
      expect(denied.status()).toBe(403)
      expect(await denied.text()).not.toContain(sentinel)
    }
  } finally {
    await unlink(path)
  }
  expect(
    (
      await request.get('/api/place-photos/status', { headers: { Origin: 'https://evil.example' } })
    ).status(),
  ).toBe(403)
  expect(
    (await request.post('/api/place-photos/lookup', { data: { id: 'unknown' } })).status(),
  ).toBe(403)
  const response = await request.post('/api/place-photos/lookup', {
    headers: { Origin: 'http://127.0.0.1:5287', 'X-Photo-Token': data.token },
    data: { id: 'unknown' },
  })
  expect(response.status()).toBe(404)
  expect((await request.get('/api/place-photos/lookup')).status()).toBe(405)
  expect((await request.get('/api/place-photos/status')).ok()).toBe(true)
})
