import { test, expect } from './support/mapFixture'
import type { Page } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import type { AppState } from '../src/state/model'
import data from '../src/ramen/questions.json' with { type: 'json' }
import profile from '../src/ramen/profile.json' with { type: 'json' }
import scoring from '../src/ramen/vendor/scoring.js'

const stateKey = 'driveplus.mock.v1'
async function seed(page: Page, state = createInitialState(), native = false) {
  await page.addInitScript(
    ({ key, state, native }) => {
      const storageKey = native ? 'ramen.native.preferences' : key
      if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(state))
      Object.assign(window, { ramenCopied: '' })
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            Object.assign(window, { ramenCopied: text })
          },
        },
      })
      if (native)
        Object.assign(window, {
          webkit: { messageHandlers: { bridge: {} } },
          Capacitor: {
            PluginHeaders: [
              {
                name: 'Preferences',
                methods: ['get', 'set', 'remove'].map((name) => ({ name, rtype: 'promise' })),
              },
              { name: 'Share', methods: [{ name: 'share', rtype: 'promise' }] },
              {
                name: 'App',
                methods: [
                  { name: 'addListener', rtype: 'callback' },
                  { name: 'removeListener', rtype: 'promise' },
                ],
              },
              {
                name: 'Keyboard',
                methods: [
                  { name: 'setAccessoryBarVisible', rtype: 'promise' },
                  { name: 'addListener', rtype: 'callback' },
                ],
              },
            ],
            nativeCallback: () => 'test-listener',
            nativePromise: async (
              plugin: string,
              method: string,
              options: { value?: string; text?: string },
            ) => {
              if (plugin === 'Preferences') {
                if (method === 'get') return { value: localStorage.getItem(storageKey) }
                if (method === 'set') localStorage.setItem(storageKey, options.value!)
                if (method === 'remove') localStorage.removeItem(storageKey)
              }
              if (plugin === 'Share') Object.assign(window, { ramenShared: options.text })
              return {}
            },
          },
        })
    },
    { key: stateKey, state, native },
  )
}
const read = (page: Page, native = false) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}'),
    native ? 'ramen.native.preferences' : stateKey,
  ) as Promise<AppState>
async function choose(page: Page, label: string) {
  const choices = page.getByRole('group', { name: '写真への好み' })
  await expect(choices.getByRole('button', { name: label, exact: true })).toBeEnabled()
  await choices.getByRole('button', { name: label, exact: true }).click()
}
function completed(value: 'maybe' | 'mixed' = 'mixed') {
  const state = createInitialState()
  state.onboarded = true
  state.savedEvents = ['fuji']
  state.ramen.cursor = 99
  state.ramen.answers = Object.fromEntries(
    data.questions.map((q, i) => [
      q.id,
      value === 'maybe' ? 'maybe' : (['yes', 'no', 'maybe'] as const)[i % 3],
    ]),
  )
  return state
}
const pageErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
})
test.afterEach(async ({ page }, info) => {
  expect(pageErrors.get(page)).toEqual([])
  if (info.status === 'passed')
    await info.attach('操作後の画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('home entry, three choices, zoom, back/edit, resume and existing navigation', async ({
  page,
}) => {
  const state = { ...createInitialState(), onboarded: true, savedEvents: ['fuji'] }
  await seed(page, state)
  const external: string[] = []
  page.on('request', (r) => {
    if (/^https?:/.test(r.url()) && !r.url().includes('127.0.0.1')) external.push(r.url())
  })
  await page.goto('/#/discover')
  await page.getByRole('button', { name: /ラーメンタイプ診断/ }).click()
  await page.getByRole('button', { name: '診断をはじめる', exact: true }).click()
  await expect(page.locator('.ramen-photo img')).toHaveAttribute('src', /p077.jpg$/)
  await expect(page.getByRole('button', { name: '次の写真へ' })).toBeDisabled()
  await choose(page, '好き')
  await page.getByRole('button', { name: '写真1を拡大', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '閉じる', exact: true }).click()
  await page.getByRole('button', { name: '次の写真へ' }).click()
  await choose(page, 'どちらともいえない')
  await page.getByRole('button', { name: '次の写真へ' }).click()
  await choose(page, '好きではない')
  await expect
    .poll(async () => (await read(page)).ramen.answers)
    .toEqual({ q001: 'yes', q002: 'maybe', q003: 'no' })
  await page.getByRole('button', { name: '前の写真', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'どちらともいえない', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await choose(page, '好き')
  await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: /ラーメンタイプ診断/ }).click()
  await page.getByRole('button', { name: '続きから回答する' }).click()
  await expect(page.locator('.ramen-eyebrow')).toHaveText('PHOTO 004 / 100')
  expect((await read(page)).ramen.answers).toEqual({ q001: 'yes', q002: 'yes', q003: 'no' })
  await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click()
  for (const tab of ['行きたい', '学ぶ', '見つける']) {
    await page.getByRole('navigation').getByRole('button', { name: tab, exact: true }).click()
    await expect(
      page.getByRole('navigation').getByRole('button', { name: tab, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  }
  expect((await read(page)).savedEvents).toEqual(['fuji'])
  expect(external).toEqual([])
  expect(
    await page.locator('.phone-screen').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true)
})

test('100 actual photo steps finish with all-neutral undecided result and persist through reload', async ({
  page,
}) => {
  test.setTimeout(150_000)
  await seed(page)
  await page.goto('/#/ramen')
  await page.getByRole('button', { name: '診断をはじめる' }).click()
  for (let i = 0; i < 100; i++) {
    await expect(page.locator('.ramen-photo img')).toHaveAttribute(
      'src',
      new RegExp(`${data.questions[i].photo_id}.jpg$`),
    )
    await choose(page, 'どちらともいえない')
    await page
      .getByRole('button', { name: i === 99 ? '結果を見る' : '次の写真へ', exact: true })
      .click()
  }
  await expect(page.getByRole('heading', { name: '今回はタイプを保留', exact: true })).toBeVisible()
  await expect(
    page.getByText('「診断が当たる確率」ではありません。', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('meter').first()).toHaveAttribute('aria-valuenow', '50')
  await expect.poll(async () => Object.keys((await read(page)).ramen.answers).length).toBe(100)
  await page.reload()
  await expect(page.getByRole('heading', { name: '今回はタイプを保留' })).toBeVisible()
})

test('loading/error blocks answers, retry works, and unreadable differs from neutral', async ({
  page,
}) => {
  await seed(page)
  let fail = true
  await page.route('**/images/ramen/p077.jpg*', async (route) => {
    if (fail) await route.abort()
    else await route.continue()
  })
  await page.goto('/#/ramen/question/1')
  await expect(page.getByText('写真を読み込めませんでした。')).toBeVisible()
  await expect(page.getByRole('button', { name: '好き', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '次の写真へ' })).toBeDisabled()
  expect((await read(page)).ramen.answers).toEqual({})
  fail = false
  await page.getByRole('button', { name: '写真を再読み込み' }).click()
  await choose(page, 'どちらともいえない')
  await page.getByRole('button', { name: '次の写真へ' }).click()
  await page.route('**/images/ramen/p053.jpg*', (route) => route.abort())
  await page.reload()
  await page.getByRole('button', { name: '読込不可として進む' }).click()
  await expect(page).toHaveURL(/question\/3$/)
  await expect
    .poll(async () => (await read(page)).ramen.answers)
    .toEqual({ q001: 'maybe', q002: 'skip' })
  await page.reload()
  expect((await read(page)).ramen.answers.q002).toBe('skip')
})

test('result has matching scores, explanations, 16 types, attribution, export and answer recalculation', async ({
  page,
}) => {
  const state = completed()
  const expected = scoring.score(
    profile,
    data.questions.map((q) => ({ photo_id: q.photo_id, value: state.ramen.answers[q.id] })),
  )
  await seed(page, state)
  await page.goto('/#/ramen/result')
  for (const axis of expected.axes)
    for (const [i, group] of [axis.minus, axis.plus].entries()) {
      await expect(
        page.getByRole('meter', {
          name: `${axis.name}・${axis.labels[i]}の好みスコア`,
          exact: true,
        }),
      ).toHaveAttribute('aria-valuenow', String(Math.round(group.rate! * 100)))
    }
  for (const p of expected.paragraphs)
    await expect(page.getByText(p, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '結果をコピー', exact: true }).click()
  expect(
    await page.evaluate(() => (window as unknown as { ramenCopied: string }).ramenCopied),
  ).toBe(scoring.toText(expected, profile))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'テキストで保存', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('ramen-preference-result.txt')
  await page.getByText('他の16タイプを見る', { exact: true }).click()
  await expect(page.locator('.ramen-type')).toHaveCount(16)
  await page.getByText('⭕️ 好き（34枚）', { exact: true }).click()
  await expect(page.locator('.ramen-sample-grid').first().locator('img')).toHaveCount(34)
  await page.getByRole('button', { name: '写真1の回答を変更', exact: true }).click()
  await choose(page, '好きではない')
  await page.getByRole('button', { name: '結果を更新して戻る' }).click()
  await expect(page.locator('.ramen-result-hero')).toContainText('⭕️ 33')
  await page.getByRole('button', { name: '診断の仕組み・写真の出典' }).click()
  await page.getByText('写真100枚の出典（来店者投稿）', { exact: true }).click()
  await expect(page.locator('.ramen-source-list li')).toHaveCount(100)
  await expect(page.locator('.ramen-source-list a').first()).toHaveAttribute(
    'href',
    /^https:\/\/tabelog.com\//,
  )
  await page.getByRole('button', { name: '戻る', exact: true }).click()
  await expect(page).toHaveURL(/ramen\/result$/)
  expect((await read(page)).savedEvents).toEqual(['fuji'])
})

test('iOS bridge saves progress in Preferences and exports result through system sharing', async ({
  page,
}) => {
  await seed(page, completed(), true)
  await page.goto('/#/ramen/question/1')
  await choose(page, '好きではない')
  await expect.poll(async () => (await read(page, true)).ramen.answers.q001).toBe('no')
  await page.reload()
  await expect(page.getByRole('button', { name: '好きではない', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '結果を更新して戻る' }).click()
  await page.getByRole('button', { name: '共有・テキスト保存', exact: true }).click()
  expect(
    await page.evaluate(() => (window as unknown as { ramenShared: string }).ramenShared),
  ).toContain('ラーメン写真の好み診断')
  expect(await page.evaluate((key) => localStorage.getItem(key), stateKey)).toBeNull()
})
