import { expect, test } from './support/mapFixture'
import { createInitialState } from '../src/state/model'

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('old learning URLs replace their history entry and retain a single active tab', async ({
  page,
}) => {
  await page.goto('/#/welcome')
  await page.getByRole('button', { name: 'まずは見てみる' }).click()
  const navigation = page.getByRole('navigation')
  await expect(navigation.getByRole('button')).toHaveText([
    '見つける',
    '行きたい',
    '車を探す',
    'マイページ',
  ])
  for (const [oldPath, destination, activeTab] of [
    ['/learn', '/discover', '見つける'],
    ['/learn?genre=restart', '/discover', '見つける'],
    ['/learn/parking?page=1', '/discover', '見つける'],
    ['/learn/columns/return-to-driving', '/discover', '見つける'],
    ['/learn/columns/missing', '/discover', '見つける'],
    ['/profile/learning', '/profile', 'マイページ'],
    ['/profile/consultations', '/profile', 'マイページ'],
    ['/learn/notes', '/profile/notes', 'マイページ'],
  ]) {
    await page.goto('/#/saved')
    await page.evaluate((path) => {
      location.hash = path
    }, oldPath)
    await expect.poll(() => new URL(page.url()).hash).toBe('#' + destination)
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(activeTab)
    await expect(page.locator('.lesson-card, .column-card')).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/#\/saved$/)
  }
})

test('profile, settings, reflections and check results do not offer retired learning screens', async ({
  page,
}) => {
  const initial = createInitialState()
  initial.onboarded = true
  initial.learned = ['parking']
  initial.learningDates = { parking: '2026-09-20T00:00:00Z' }
  initial.quiz.completed = true
  await page.addInitScript((state) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
  }, initial)
  for (const path of ['/profile', '/settings', '/reflection', '/results', '/events/fuji']) {
    await page.goto('/#' + path)
    await expect(
      page.getByRole('button', {
        name: /学ぶ|学習履歴|学習した内容|学習メモ|おすすめの学習|久しぶりの運転に備える/,
      }),
    ).toHaveCount(0)
    await expect(page.getByRole('navigation').locator('[aria-current="page"]')).toHaveCount(1)
  }
  await page.goto('/#/results')
  await page.getByRole('button', { name: '回答ごとの解説を見る' }).click()
  await expect(page.getByRole('dialog').locator('article')).toHaveCount(3)
  await page.getByRole('button', { name: '振り返りに戻る' }).click()
  await page.getByRole('button', { name: 'ドライブ先を探す', exact: true }).click()
  await expect(page).toHaveURL(/#\/discover$/)
  await page.goto('/#/reflection')
  await page.getByRole('button', { name: /自分用メモを開く/ }).click()
  await expect(page).toHaveURL(/#\/profile\/notes$/)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(stored.learned).toEqual(initial.learned)
  expect(stored.learningDates).toEqual(initial.learningDates)
  expect(stored.quiz).toEqual(initial.quiz)
})

test('a bookmarked note keeps its content and returns to My Page on a fresh visit', async ({
  page,
}) => {
  const initial = createInitialState()
  initial.memo.questions = '前から残していたメモ'
  await page.addInitScript((state) => {
    if (!localStorage.getItem('driveplus.mock.v1'))
      localStorage.setItem('driveplus.mock.v1', JSON.stringify(state))
  }, initial)
  await page.goto('/#/learn/notes')
  await expect(page).toHaveURL(/#\/profile\/notes$/)
  const note = page.getByRole('textbox', { name: '自分用メモ', exact: true })
  await expect(note).toHaveValue('前から残していたメモ')
  await note.fill('前から残していたメモ\nカフェに寄りたい')
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!).memo.questions),
    )
    .toContain('カフェに寄りたい')
  await page.reload()
  await expect(note).toHaveValue('前から残していたメモ\nカフェに寄りたい')
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page).toHaveURL(/#\/profile$/)
  await page.getByRole('button', { name: '自分用メモ', exact: true }).click()
  await expect(note).toHaveValue('前から残していたメモ\nカフェに寄りたい')
})
