import { expect, test } from './support/mapFixture'
import { createInitialState } from '../src/state/model'

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('retired URLs lead to home without a referral form or a back loop', async ({ page }) => {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  const navigation = page.getByRole('navigation')
  await expect(navigation.getByRole('button')).toHaveText([
    '見つける',
    '行きたい',
    '車を探す',
    'マイページ',
  ])
  for (const path of [
    '/schools',
    '/schools/shirokuma',
    '/consult/shirokuma',
    '/consult/shirokuma/review',
    '/consultations/old-demo',
  ]) {
    await page.goto('/#/saved')
    // Push a real history entry as an old in-app link would do.
    await page.evaluate((path) => {
      location.hash = path
    }, path)
    await expect(page).toHaveURL(/#\/discover$/)
    await expect(navigation.getByRole('button', { name: '見つける', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.locator('.school-card, .consult-progress, .consent-checkbox')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/#\/saved$/)
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
  await page.getByRole('button', { name: '自分用メモ', exact: true }).click()
  const note = page.getByRole('textbox', { name: '自分用メモ' })
  await expect(note).toHaveValue('以前の質問を残したい')
  await note.fill('以前の質問を残したい\n新しい気づき')
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).memo.questions),
    )
    .toContain('新しい気づき')
  await page.getByRole('button', { name: 'マイページに戻る' }).click()
  await page.reload()
  await page.getByRole('button', { name: '自分用メモ' }).click()
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
