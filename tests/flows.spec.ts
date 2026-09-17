import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { showAllRegions } from './helpers/discovery'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
})

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'passed') {
    await testInfo.attach('操作後の画面', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
  }
})

async function enter(page: Page, route = '/discover') {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  if (route !== '/discover') await page.goto(`/#${route}`)
}
async function readState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1') || '{}'))
}

test('three-question onboarding supports back, multiple interests, tabs and reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'はじめる', exact: true }).click()
  await page.getByRole('textbox', { name: '出発エリア' }).fill('東京・新宿駅周辺')
  await page.getByRole('button', { name: '次へ', exact: true }).click()
  await page.getByRole('button', { name: /恋人・パートナー/ }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '出発エリア' })).toHaveValue('東京・新宿駅周辺')
  await page.getByRole('button', { name: '次へ', exact: true }).click()
  await expect(page.getByRole('button', { name: /恋人・パートナー/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '次へ', exact: true }).click()
  await page.getByRole('button', { name: '自然 心ほどける景色' }).click()
  await page.getByRole('button', { name: '温泉 ゆっくり、ひと休み' }).click()
  await page.getByRole('button', { name: 'おすすめを見る' }).click()
  await expect(page).toHaveURL(/#\/discover$/)
  for (const name of ['行きたい', '車を探す', '学ぶ', '講習', '見つける']) {
    await page.getByRole('navigation').getByRole('button', { name, exact: true }).click()
    await expect(
      page.getByRole('navigation').getByRole('button', { name, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  }
  await page.reload()
  const state = await readState(page)
  expect(state.profile).toMatchObject({
    area: '東京・新宿駅周辺',
    companion: '恋人・パートナー',
    interests: ['自然', '温泉'],
  })
  expect(state.onboarded).toBe(true)
  await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5)
})

test('saved outings stay synchronized; back restores scroll; unverified SNS stays personal', async ({
  page,
}) => {
  await enter(page)
  await showAllRegions(page)
  await page.getByRole('button', { name: '湖畔のオータム花火を保存', exact: true }).click()
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.getByRole('button', { name: /開催予定（サンプル） 湖畔のオータム花火/ }).click()
  await expect(page.getByRole('button', { name: '行きたいに保存済み' })).toBeVisible()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page).toHaveURL(/#\/saved/)
  await page.getByRole('button', { name: 'SNSで見つけた場所を追加', exact: true }).click()
  await page
    .getByRole('textbox', { name: '投稿のURL' })
    .fill('https://www.tiktok.com/@sample/video/123')
  await page.getByRole('textbox', { name: /自分用のタイトル/ }).fill('海辺でコーヒー')
  await page.getByRole('button', { name: '行きたいに追加', exact: true }).click()
  await expect(page.getByRole('heading', { name: '海辺でコーヒー' })).toBeVisible()
  await expect(page.getByText('内容未確認', { exact: true })).toBeVisible()
  await page.reload()
  expect((await readState(page)).links).toHaveLength(1)
  await page.getByRole('button', { name: '湖畔のオータム花火を保存解除' }).click()
  await page.getByRole('navigation').getByRole('button', { name: '見つける', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '湖畔のオータム花火を保存', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('海辺でコーヒー', { exact: true })).toHaveCount(0)
  await page
    .getByRole('button', { name: '森の週末コーヒーマーケットの詳細を見る' })
    .scrollIntoViewIfNeeded()
  const top = await page.locator('#app-scroll').evaluate((el) => el.scrollTop)
  await page.getByRole('button', { name: '森の週末コーヒーマーケットの詳細を見る' }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  expect(
    Math.abs((await page.locator('#app-scroll').evaluate((el) => el.scrollTop)) - top),
  ).toBeLessThan(15)
})

test('quiz separates knowledge, wrong answers, self-report and skipped items', async ({ page }) => {
  await enter(page, '/check')
  await page.getByRole('button', { name: '以前は運転していたが、今はしていない' }).click()
  await page.getByRole('button', { name: '車線変更', exact: true }).click()
  await page.getByRole('button', { name: '知識チェックをはじめる' }).click()
  await page.getByRole('button', { name: '右側の歩行者を確認箇所に選ぶ' }).click()
  await page.getByRole('button', { name: /B 横断歩道の周辺と、左右の見通し/ }).click()
  await page.getByRole('button', { name: '次の問題へ' }).click()
  await page.getByRole('button', { name: /B 画面に映る範囲だけで判断する/ }).click()
  await page.getByRole('button', { name: '次の問題へ' }).click()
  await page.getByRole('button', { name: '未回答のまま次へ' }).click()
  await expect(
    page.locator('.result-group').filter({ hasText: '知識を確認できた項目' }),
  ).toContainText('一般道')
  await expect(page.locator('.result-group').filter({ hasText: '復習したい項目' })).toContainText(
    '駐車',
  )
  await expect(
    page.locator('.result-group').filter({ hasText: '講師に相談したい項目' }),
  ).toContainText('車線変更')
  await expect(page.locator('.result-group.neutral')).toContainText('高速道路')
  await expect(page.locator('.result-group.neutral')).toContainText('夜間')
  const state = await readState(page)
  expect(state.quiz.answers).toEqual({ 'q-road': 1, 'q-parking': 1, 'q-highway': null })
  await page.reload()
  await expect(page.locator('.knowledge-counter')).toContainText('2 / 3問')
  await expect(page.locator('#app-scroll')).not.toContainText(
    /運転準備度|一般道は問題なし|安全に運転できる|65%|予約可能/,
  )
  await page.getByRole('button', { name: '回答ごとの解説を見る' }).click()
  await expect(page.getByRole('dialog').locator('article')).toHaveCount(3)
  await expect(page.getByRole('dialog').locator('article').nth(1)).toContainText(
    '画面に映る範囲だけで判断する',
  )
  await expect(page.getByRole('dialog').locator('article').nth(2)).toContainText('未回答')
  await page.getByRole('button', { name: '振り返りに戻る' }).click()
})

test('learning has next/previous, adds consultation notes and persists completion', async ({
  page,
}) => {
  await enter(page, '/learn')
  await page.getByRole('button', { name: '講習後の復習', exact: true }).click()
  await expect(page.locator('.lesson-card')).toHaveCount(3)
  await page.getByRole('button', { name: /駐車の前に、確認したいこと/ }).click()
  await expect(page.getByRole('button', { name: '前の問題' })).toBeDisabled()
  await page.getByRole('button', { name: '次の問題' }).click()
  await expect(page.getByRole('heading', { name: '実車で確かめたいことを整理' })).toBeVisible()
  await page.getByRole('button', { name: '前の問題' }).click()
  await page.getByRole('button', { name: 'この内容を相談メモに追加' }).click()
  await page.getByRole('button', { name: '次の問題' }).click()
  await page.getByRole('button', { name: '学習を記録', exact: true }).click()
  expect((await readState(page)).learned).toEqual(['parking'])
  expect((await readState(page)).memo.questions).toContain('何が見えにくいかを考える')
  await page.goto('/#/profile/learning')
  await expect(page.locator('.lesson-card')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.lesson-card')).toContainText('学習済み')
})

test('map pins, station details, provider filters, lists and zero-result search', async ({
  page,
}) => {
  await enter(page, '/cars')
  await expect(page.locator('.map-pin')).toHaveCount(6)
  await page.getByRole('button', { name: 'タイムズカー 渋谷駅前・カーシェアの詳細カード' }).click()
  await expect(page.getByRole('heading', { name: 'この拠点について' })).toBeVisible()
  await page.getByRole('button', { name: '拠点の詳細を見る' }).click()
  await expect(
    page.getByRole('heading', { name: 'タイムズカー 渋谷駅前', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '車候補に保存', exact: true }).click()
  await page.getByRole('button', { name: '公式で空き状況・予約を確認' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'リンクを開くだけでは予約・問い合わせは完了しません',
  )
  await page.getByRole('button', { name: 'アプリに戻る' }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.map-pin[aria-pressed="true"]')).toHaveCount(1)
  await page.getByRole('button', { name: '車の事業者フィルター' }).click()
  await page.getByRole('button', { name: 'トヨタレンタカー サンプルの掲載拠点' }).click()
  await page.getByRole('button', { name: 'この条件で表示' }).click()
  await expect(page.locator('.map-pin')).toHaveCount(1)
  await page.getByRole('button', { name: '車の一覧に切り替え' }).click()
  await expect(page.locator('.station-list .station-card')).toHaveCount(1)
  await page.getByRole('button', { name: /トヨタレンタカー 渋谷店 渋谷駅周辺/ }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.station-list .station-card')).toHaveCount(1)
  await page.getByRole('button', { name: '地図で見る', exact: true }).click()
  await page.getByRole('textbox', { name: '駅名・地域から車を探す' }).fill('大阪')
  await page.getByRole('button', { name: 'このエリアで検索' }).click()
  await expect(page.locator('.map-pin')).toHaveCount(0)
  await page.getByRole('button', { name: '渋谷のサンプルを表示' }).click()
  await expect(page.locator('.map-pin')).toHaveCount(6)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await page.getByRole('button', { name: '車候補 1' }).click()
  await expect(page.locator('.station-list')).toContainText('タイムズカー 渋谷駅前')
})

test('consultation requires explicit consent and only stores selected snapshot fields', async ({
  page,
}) => {
  await enter(page, '/schools')
  await page.locator('.school-card').first().getByRole('button', { name: '詳細を見る' }).click()
  await page.getByRole('button', { name: '希望日時を相談', exact: true }).click()
  await page
    .getByRole('textbox', { name: /実現したいこと・目標/ })
    .fill('パートナーと旅行の運転を交代したい')
  await page.getByRole('textbox', { name: /希望日時/ }).fill('10月の土曜日')
  await page.getByRole('textbox', { name: /講師に聞きたいこと/ }).fill('車線変更が不安です')
  await page.getByRole('button', { name: '共有する内容を確認' }).click()
  const send = page.getByRole('button', { name: 'この内容で相談する（デモ）' })
  await expect(send).toBeDisabled()
  expect((await readState(page)).consultations).toHaveLength(0)
  await page.getByRole('button', { name: /講師への質問 車線変更が不安です/ }).click()
  await page.getByRole('checkbox').check()
  await send.click()
  const state = await readState(page)
  expect(state.consultations).toHaveLength(1)
  expect(state.consultations[0].snapshot).toEqual({
    goal: 'パートナーと旅行の運転を交代したい',
    when: '10月の土曜日',
    vehicle: '相談して決めたい',
  })
  expect(state.consultations[0].consentAt).toBeTruthy()
  await expect(page.locator('.status-intro')).toContainText('講習の予約は確定していません')
  await page.getByRole('button', { name: '受付後の表示を試す' }).click()
  await expect(page.locator('.status-intro')).toContainText('相談受付（デモ）')
  await page.getByRole('button', { name: '共有した内容を確認' }).click()
  await expect(page.getByRole('dialog')).not.toContainText('車線変更が不安です')
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).last().click()
  await page.reload()
  expect((await readState(page)).consultations).toHaveLength(1)
})

test('school filters work without requiring a check; empty results can be reset', async ({
  page,
}) => {
  await enter(page, '/schools')
  await page.getByRole('button', { name: '絞り込み', exact: true }).click()
  await page.getByRole('combobox', { name: '対応エリア' }).selectOption('千葉')
  await page.getByRole('button', { name: 'この条件で表示' }).click()
  await expect(page.locator('.school-card')).toHaveCount(0)
  await page.getByRole('button', { name: '条件をリセット' }).click()
  await expect(page.locator('.school-card')).toHaveCount(3)
  await page.getByRole('button', { name: '絞り込み', exact: true }).click()
  await page.getByRole('combobox', { name: '予算の目安' }).selectOption('15000')
  await page.getByRole('combobox', { name: '使いたい車' }).selectOption('マイカー')
  await page.getByRole('button', { name: 'この条件で表示' }).click()
  await expect(page.locator('.school-card')).toHaveCount(2)
})

test('profile, reflection and data reset preserve honest user outcomes', async ({ page }) => {
  await enter(page)
  await page.getByRole('button', { name: 'マイページを開く' }).click()
  await page.getByRole('button', { name: 'プロフィール・出発エリア' }).click()
  await page.getByRole('textbox', { name: /呼ばれたい名前/ }).fill('たろう')
  await page.getByRole('button', { name: '自然', exact: true }).click()
  await page.getByRole('button', { name: '変更を保存' }).click()
  await expect(page.getByRole('heading', { name: 'たろうさん' })).toBeVisible()
  await page.getByRole('button', { name: 'お出かけ・講習の振り返り' }).click()
  await page.getByRole('button', { name: '別の交通手段を選んだ' }).click()
  await page.getByRole('textbox', { name: '思ったこと・学んだこと' }).fill('今回は電車で楽しんだ。')
  await page.getByRole('button', { name: '振り返りを保存' }).click()
  await expect(page.locator('.reflection-card')).toContainText('別の交通手段を選んだ')
  await page.goto('/#/settings')
  await page.getByRole('switch', { name: /文字を少し大きくする/ }).check()
  await expect(page.locator('.mobile-frame')).toHaveClass(/large-text/)
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  expect((await readState(page)).reflections).toHaveLength(1)
  await page.getByRole('button', { name: 'モックの保存データを削除' }).click()
  await page.getByRole('button', { name: '削除して最初から始める' }).click()
  await expect(page).toHaveURL(/#\/welcome$/)
  const clean = await readState(page)
  expect(clean.reflections).toHaveLength(0)
  expect(clean.onboarded).toBe(false)
})

test('phone contains scroll; all routes render without errors, overflow or broken images', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await enter(page)
  const size = await page.locator('.mobile-frame').boundingBox()
  expect(size).toBeTruthy()
  expect(size!.width).toBeLessThanOrEqual(testInfo.project.name === 'desktop' ? 410 : 390)
  for (const route of [
    '/discover',
    '/events/fireworks',
    '/saved',
    '/check',
    '/quiz/0',
    '/results',
    '/learn',
    '/learn/parking',
    '/cars',
    '/stations/toyota-shibuya',
    '/schools',
    '/schools/shirokuma',
    '/consult/shirokuma',
    '/consult/shirokuma/review',
    '/profile',
    '/profile/edit',
    '/profile/learning',
    '/profile/consultations',
    '/settings',
    '/reflection',
  ]) {
    await page.goto(`/#${route}`)
    await expect(page.locator('.app-main')).toBeVisible()
    // Exercise lazy images as a user scrolls; offscreen images need not load in WebKit.
    for (const img of await page.locator('img').all()) {
      await img.scrollIntoViewIfNeeded()
      await expect
        .poll(() =>
          img.evaluate(
            (el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
          ),
        )
        .toBe(true)
    }
    await page.locator('#app-scroll').evaluate((el) => {
      el.scrollTop = 0
    })
    const metrics = await page.evaluate(() => {
      const main = document.querySelector('.app-main')!
      return {
        body: document.documentElement.scrollHeight,
        viewport: innerHeight,
        width: main.clientWidth,
        scrollWidth: main.scrollWidth,
        brokenImages: Array.from(document.images)
          .filter((img) => img.naturalWidth === 0)
          .map((img) => img.src),
      }
    })
    expect(metrics.body, route).toBeLessThanOrEqual(metrics.viewport)
    expect(metrics.scrollWidth, route).toBeLessThanOrEqual(metrics.width + 1)
    expect(metrics.brokenImages, route).toEqual([])
    await expect(page.locator('.bottom-nav')).toBeVisible()
    await expect(page.locator('.app-main')).not.toContainText(
      /運転準備度|一般道は問題なし|安全に運転できる|空車あり|予約可能/,
    )
  }
  expect(errors).toEqual([])
})

test('sheets stay inside the phone, trap focus and can close', async ({ page }, testInfo) => {
  await enter(page)
  await page.getByRole('button', { name: 'お出かけの絞り込み' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  const phone = await page.locator('.phone-screen').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(phone!.x - 1)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(phone!.x + phone!.width + 1)
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: '条件をリセット', exact: true })).toBeFocused()
  if (testInfo.project.name === 'desktop') await page.keyboard.press('Escape')
  else await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'お出かけの絞り込み' })).toBeFocused()
})
