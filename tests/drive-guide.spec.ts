import { test, expect } from '@playwright/test'
import { createInitialState } from '../src/state/model'

test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('漫画ガイドの操作後', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
})

test('first run reads all six scenes before hobbies without locating, searching or completing setup', async ({
  page,
}) => {
  const searches: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/compare') && r.method() === 'POST') searches.push(r.url())
  })
  await page.addInitScript(() => {
    Object.assign(window, { guideLocationRequests: 0 })
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition() {
          ;(window as unknown as { guideLocationRequests: number }).guideLocationRequests++
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'はじめる', exact: true }).click()
  await expect(page).toHaveURL(/#\/onboarding\/guide$/)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '前のページ', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('heading', { name: /目的地はない。\s*でも、走りたい。/ }),
  ).toBeVisible()
  for (let index = 1; index < 6; index++) {
    await page.getByRole('button', { name: '次へ', exact: true }).click()
    await expect(page.locator('.guide-counter b')).toHaveText(String(index + 1).padStart(2, '0'))
    await expect
      .poll(() =>
        page
          .locator('.guide-carousel')
          .evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)),
      )
      .toBe(index)
  }
  await page.getByRole('button', { name: '前のページ', exact: true }).click()
  await expect(page.locator('.guide-counter b')).toHaveText('05')
  await page.getByRole('button', { name: '4ページ目：その日の「気分」に気づく' }).click()
  await expect(page.getByText('最初に選んだ趣味とは別に、その日の気分で探せます。')).toBeVisible()
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(before.onboarded).toBe(false)
  expect(before.profile.interests).toEqual([])
  expect(searches).toEqual([])
  expect(
    await page.evaluate(
      () => (window as unknown as { guideLocationRequests: number }).guideLocationRequests,
    ),
  ).toBe(0)
  await page.locator('.guide-carousel').focus()
  await page.keyboard.press('End')
  await page.getByRole('button', { name: 'さっそく、趣味を選ぶ', exact: true }).click()
  await expect(page).toHaveURL(/#\/onboarding\/1$/)
  await page.getByRole('button', { name: '自然', exact: true }).click()
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page.locator('.guide-counter b')).toHaveText('06')
  await page.getByRole('button', { name: 'さっそく、趣味を選ぶ', exact: true }).click()
  await expect(page.getByRole('button', { name: '自然', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(searches).toEqual([])
})

test('existing users keep their data and home position while reopening the same guide', async ({
  page,
}) => {
  const initial = createInitialState()
  initial.onboarded = true
  initial.profile.interests = ['自然', '温泉']
  initial.savedEvents = ['fuji']
  initial.discover.search = '海の見えるカフェ'
  await page.addInitScript(
    (state) => localStorage.setItem('driveplus.mock.v1', JSON.stringify(state)),
    initial,
  )
  await page.goto('/')
  await expect(page).toHaveURL(/#\/discover$/)
  const trigger = page.getByRole('button', { name: 'このアプリの使い方', exact: true })
  await trigger.scrollIntoViewIfNeeded()
  const scroll = await page.locator('#app-scroll').evaluate((el) => el.scrollTop)
  await trigger.click()
  await expect(page.locator('.guide-counter b')).toHaveText('01')
  await page.locator('.guide-carousel').focus()
  await page.keyboard.press('End')
  await page.getByRole('button', { name: 'ホームへ戻る', exact: true }).click()
  await expect(trigger).toBeFocused()
  expect(
    Math.abs((await page.locator('#app-scroll').evaluate((el) => el.scrollTop)) - scroll),
  ).toBeLessThanOrEqual(1)
  await trigger.click()
  await expect(page.locator('.guide-counter b')).toHaveText('01')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(stored.profile.interests).toEqual(initial.profile.interests)
  expect(stored.savedEvents).toEqual(initial.savedEvents)
  expect(stored.discover.search).toBe(initial.discover.search)
  expect(stored.onboarded).toBe(true)
})

test('small screens, large text, reduced motion and a missing picture preserve readable navigation', async ({
  page,
}) => {
  const initial = createInitialState()
  initial.settings.largeText = true
  initial.settings.reducedMotion = true
  await page.addInitScript(
    (state) => localStorage.setItem('driveplus.mock.v1', JSON.stringify(state)),
    initial,
  )
  await page.route('**/images/guide/story-comic.png', (route) => route.abort())
  await page.setViewportSize({ width: 320, height: 568 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/onboarding/guide')
  await page.locator('.guide-carousel').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.guide-counter b')).toHaveText('02')
  await page.setViewportSize({ width: 430, height: 932 })
  await expect
    .poll(() =>
      page.locator('.guide-carousel').evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)),
    )
    .toBe(1)
  await page.setViewportSize({ width: 320, height: 568 })
  await page.getByRole('button', { name: '5ページ目：思いついた言葉でも探せる' }).click()
  await expect(
    page.getByRole('heading', { name: /ふと浮かんだひと言を、\s*そのまま検索。/ }),
  ).toBeVisible()
  await page
    .getByText('気分から選んでも、言葉で伝えても。探し方は自由です。')
    .scrollIntoViewIfNeeded()
  const bounds = await page.evaluate(() => {
    const screen = document.querySelector('.phone-screen')!
    const footer = document.querySelector('.guide-footer')!.getBoundingClientRect()
    const main = document.querySelector('#app-scroll')!.getBoundingClientRect()
    return {
      noOverflow: screen.scrollWidth <= screen.clientWidth,
      controlsVisible: footer.bottom <= main.bottom + 1,
    }
  })
  expect(bounds).toEqual({ noOverflow: true, controlsVisible: true })
  await page.getByRole('button', { name: '次へ', exact: true }).click()
  await page.getByRole('button', { name: 'さっそく、趣味を選ぶ', exact: true }).click()
  await expect(page.getByRole('group', { name: '趣味を選ぶ' })).toBeVisible()
})
