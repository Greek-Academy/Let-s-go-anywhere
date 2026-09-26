import { expect, test } from '@playwright/test'

test('地域・テーマからカード、出典、ファイル保存まで確認する', async ({ page }, testInfo) => {
  const external: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4182')) external.push(r.url())
  })
  await page.goto('/')
  await expect(page.getByText('サンプル確認中', { exact: false })).toBeVisible()
  await page.getByLabel('気になる場所や、したいこと').fill('自然とカフェ')
  await page.getByRole('button', { name: 'サンプルのカードを確認する' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByRole('link', { name: '出典リンクの例', exact: false })).toHaveCount(3)
  await expect(page.getByText('営業時間・料金・駐車場：未確認')).toHaveCount(3)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '検証結果をファイルに保存' }).click()
  expect((await download).suggestedFilename()).toBe('driveplus-research-sample.json')
  expect(external).toEqual([])
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([])
  await page.locator('.screen').evaluate((element) => {
    element.scrollTop = 500
  })
  await testInfo.attach('候補カードのサンプル', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
})

test('0件・通信失敗ではサンプルへ置き換えず、入力を残す', async ({ page }) => {
  await page.goto('/')
  await page.route('**/api/search', (route) =>
    route.fulfill({ json: { spots: [], mode: 'sample', omitted: 0, sourcesNote: 'サンプル検証' } }),
  )
  await page.getByRole('button', { name: 'サンプルのカードを確認する' }).click()
  await expect(
    page.getByText('条件に合い、出典を確認できる候補はありませんでした。', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.route('**/api/search', (route) =>
    route.fulfill({ status: 502, json: { error: 'APIの残高・利用制限を確認してください。' } }),
  )
  await page.getByRole('button', { name: 'サンプルのカードを確認する' }).click()
  await expect(page.getByRole('alert')).toContainText('APIの残高')
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByLabel('気になる場所や、したいこと')).toHaveValue(
    '自然を楽しんで、カフェにも寄りたい',
  )
})

test('APIキー未設定と回数上限では課金ボタンを押せない', async ({ page }) => {
  await page.route('**/api/status', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ json: { ...(await response.json()), demo: false, configured: false } })
  })
  await page.goto('/')
  await expect(page.getByText('キー未設定', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '候補を探す（APIを1回利用）' })).toBeDisabled()
  await page.route('**/api/status', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      json: {
        ...(await response.json()),
        demo: false,
        configured: true,
        attempts: [{ usage: null }, { usage: null }, { usage: null }],
      },
    })
  })
  await page.reload()
  await expect(page.getByRole('button', { name: '候補を探す（APIを1回利用）' })).toBeDisabled()
  await page.getByText('今回の検証と利用回数', { exact: true }).click()
  await expect(page.getByText('利用量・費用が未確定の試行：3件。0円とは扱いません。')).toBeVisible()
})

test('狭い画面でも横にはみ出さず、スマホ枠の内側をスクロールできる', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'サンプルのカードを確認する' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.locator('.screen').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.locator('footer')).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
