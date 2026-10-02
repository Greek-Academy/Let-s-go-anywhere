import { expect, test } from './support/mapFixture'
import { createInitialState } from '../src/state/model'

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('retired URLs lead to learning without a referral form or a back loop', async ({ page }) => {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  const navigation = page.getByRole('navigation')
  await expect(navigation.getByRole('button')).toHaveText([
    '見つける',
    '行きたい',
    '車を探す',
    '学ぶ',
  ])
  for (const path of [
    '/schools',
    '/schools/shirokuma',
    '/consult/shirokuma',
    '/consult/shirokuma/review',
    '/consultations/old-demo',
    '/profile/consultations',
  ]) {
    await page.goto('/#/discover')
    // Push a real history entry as an old in-app link would do.
    await page.evaluate((path) => {
      location.hash = path
    }, path)
    await expect(page).toHaveURL(/#\/learn\?retired=schools$/)
    await expect(
      page.getByRole('status').filter({ hasText: '講習会社の紹介・相談機能は終了' }),
    ).toContainText('講習会社の紹介・相談機能は終了')
    await expect(navigation.getByRole('button', { name: '学ぶ', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.locator('.school-card, .consult-progress, .consent-checkbox')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/#\/discover$/)
  }
  for (const path of ['/profile', '/settings', '/results', '/events/fuji']) {
    await page.goto('/#' + path)
    await expect(
      page.getByRole('button', {
        name: /講習を探す|希望日時を相談|講習相談・共有履歴|共有した内容・同意履歴|講師に聞きたいことを相談する/,
      }),
    ).toHaveCount(0)
  }
})

test('return-to-driving panel filters, opens a complete column and restores its list', async ({
  page,
}) => {
  await page.goto('/#/learn')
  const genres = page.getByRole('group', { name: 'コラムのジャンル' })
  await genres.getByRole('button', { name: '運転の再開', exact: true }).click()
  await expect(page.locator('.column-card')).toHaveCount(1)
  const card = page.getByRole('button', {
    name: '久しぶりの運転は、ペーパードライバー講習で練習しようを読む',
    exact: true,
  })
  await card.click()
  await expect(page.locator('.column-body-section')).toHaveCount(3)
  await expect(page.locator('.column-article')).toContainText('料金の総額と追加費用')
  await expect(page.locator('.column-article')).toContainText('公共交通を使う')
  await expect(page.locator('.column-article')).toContainText('試作・未監修')
  await expect(
    page.getByRole('link', { name: '東京指定自動車教習所協会｜各種講習のご案内' }),
  ).toHaveAttribute('href', 'https://www.tadsa.or.jp/class/')
  await expect(page.getByRole('button', { name: /予約|相談する|申し込む/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'コラム一覧へ戻る' }).click()
  await expect(page).toHaveURL(/#\/learn\?genre=restart$/)
  await expect(card).toBeFocused()
  await page.reload()
  await expect(genres.getByRole('button', { name: '運転の再開', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('v1 data and private notes survive removal of schools on a narrow screen', async ({
  page,
}) => {
  const legacy = createInitialState()
  legacy.onboarded = true
  legacy.savedEvents = ['fuji']
  legacy.savedStations = ['times-shibuya']
  legacy.learned = ['parking']
  legacy.learningDates = { parking: '2026-09-20T00:00:00Z' }
  legacy.memo = {
    goal: '温泉へ行く',
    when: '土曜日',
    vehicle: 'マイカー',
    questions: '以前の質問を残したい',
  }
  legacy.consultations = [
    {
      id: 'old-demo',
      schoolId: 'shirokuma',
      createdAt: '2026-09-20T00:00:00Z',
      consentAt: '2026-09-20T00:00:00Z',
      status: '送信済み（デモ）',
      shared: ['questions'],
      snapshot: { questions: '外部送信しない旧相談' },
    },
  ]
  legacy.reflections = [
    {
      id: 'old-reflection',
      type: '講習',
      outcome: '教わったこと',
      note: '以前の振り返り',
      advice: '以前の助言',
      createdAt: '2026-09-20T00:00:00Z',
    },
  ]
  legacy.settings.largeText = true
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('driveplus.mock.v1')) localStorage.setItem('driveplus.mock.v1', raw)
  }, JSON.stringify(legacy))
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/#/profile')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '学習メモ', exact: true }).click()
  const note = page.getByRole('textbox', { name: '自分用の学習メモ' })
  await expect(note).toHaveValue('以前の質問を残したい')
  await note.fill('以前の質問を残したい\n新しい気づき')
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).memo.questions),
    )
    .toContain('新しい気づき')
  await page.getByRole('button', { name: '学ぶに戻る' }).click()
  await page.reload()
  await page.getByRole('button', { name: '学習メモを開く' }).click()
  await expect(note).toHaveValue('以前の質問を残したい\n新しい気づき')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(stored).toEqual({
    ...legacy,
    memo: { ...legacy.memo, questions: '以前の質問を残したい\n新しい気づき' },
  })
  await page.goto('/#/reflection')
  await expect(page.locator('.reflection-card')).toContainText('以前の助言')
  await page.getByRole('button', { name: '練習の振り返り', exact: true }).click()
  await page.getByRole('textbox', { name: '思ったこと・学んだこと' }).fill('今回の練習メモ')
  await page.getByRole('button', { name: '振り返りを保存' }).click()
  await expect(page.locator('.reflection-card').first()).toContainText('今回の練習メモ')
  const overflow = await page
    .locator('#app-scroll')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
