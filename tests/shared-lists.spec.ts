import { expect, test } from './support/mapFixture'
import type { Page } from '@playwright/test'
import { createInitialState } from '../src/state/model'
import { SHARING_KEY } from '../src/sharing/model'
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const saved = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), SHARING_KEY)
async function enter(page: Page) {
  await page.clock.install({ time: new Date('2026-09-16T03:00:00Z') })
  await page.goto('/#/welcome')
  const personal = {
    ...createInitialState(),
    onboarded: true,
    savedEvents: ['fuji'],
    goals: { fuji: { companion: '秘密の相手', when: '秘密の日時', note: '秘密の個人メモ' } },
  }
  await page.evaluate((s) => localStorage.setItem('driveplus.mock.v1', JSON.stringify(s)), personal)
  await page.goto('/#/saved')
  await page.reload()
  await btn(page, 'リストを切り替える').click()
}
async function create(page: Page) {
  await btn(page, '新しいリストを作る').click()
  await page.getByRole('textbox', { name: 'リストの名前' }).fill('ふたりの休日')
  await btn(page, 'リストを作成').click()
  await expect(page.locator('.sharing-selector')).toContainText('ふたりの休日')
}
async function invite(page: Page) {
  await btn(page, 'リストの設定とメンバー').click()
  await btn(page, 'デモの招待を作る').click()
  await btn(page, '招待される側を試す').click()
  await btn(page, '説明を確認して参加申請').click()
  await expect(page.getByText(/候補はまだ見られません/)).toBeVisible()
  await btn(page, '作成者として承認を試す').click()
  await btn(page, '参加を承認').click()
  await btn(page, 'リストを開く').click()
}
async function addSaved(page: Page) {
  await btn(page, '候補を追加').click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /富士山と、湖畔の小さな旅/ })
    .click()
  await expect(page.getByRole('dialog')).not.toContainText('秘密の個人メモ')
  await page.getByRole('textbox', { name: '共有メモ（任意）' }).fill('湖を眺めてのんびりしたい')
  await btn(page, 'この内容をリストに追加').click()
  await expect(page.locator('.header-title')).toHaveText('持ち寄った候補')
}
test.afterEach(async ({ page }, info) => {
  if (info.status === 'passed')
    await info.attach('操作後の画面', { body: await page.screenshot(), contentType: 'image/png' })
})

test('create, invite, approve, share a selected item, react as each actor, filter and restore on reload', async ({
  page,
}) => {
  await enter(page)
  const before = await page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))
  const external: string[] = [],
    errors: string[] = []
  const origin = new URL(page.url()).origin
  page.on('request', (r) => {
    if (!r.url().startsWith(origin)) external.push(r.url())
  })
  page.on('pageerror', (e) => errors.push(e.message))
  await create(page)
  await invite(page)
  await addSaved(page)
  await page
    .locator('.sharing-reaction-options')
    .getByRole('button', { name: '行きたい', exact: true })
    .click()
  await expect
    .poll(async () => (await saved(page)).lists[0].items[0].reactions)
    .toEqual({ self: 'want' })
  const shared = await saved(page)
  expect(JSON.stringify(shared)).not.toContain('秘密')
  expect(shared.lists[0].items[0].reactions).toEqual({ self: 'want' })
  await btn(page, '戻る').click()
  await btn(page, 'はる（デモ）として試す').click()
  await page.getByRole('button', { name: /ふたりの休日.*参加中/ }).click()
  await btn(page, '気になる').click()
  await btn(page, '二人とも興味あり').click()
  await expect(page.locator('.sharing-card')).toHaveCount(1)
  await page.getByRole('button', { name: /の共有詳細/ }).click()
  await expect(btn(page, '共有メモを編集')).toHaveCount(0)
  await btn(page, '戻る').click()
  await expect(page).toHaveURL(/filter=mutual/)
  await page.reload()
  await expect(page.locator('.sharing-card')).toHaveCount(1)
  expect((await saved(page)).lists[0].items[0].reactions).toEqual({
    self: 'want',
    haru: 'interested',
  })
  expect(await page.evaluate(() => localStorage.getItem('driveplus.mock.v1'))).toBe(before)
  expect(external).toEqual([])
  expect(errors).toEqual([])
})
test('guest cannot read before approval; revoke blocks request; owner deletion invalidates old detail', async ({
  page,
}) => {
  await enter(page)
  await create(page)
  await addSaved(page)
  const detail = page.url()
  await btn(page, '戻る').click()
  await btn(page, 'リストの設定とメンバー').click()
  await btn(page, 'デモの招待を作る').click()
  const invitation = page.url()
  await btn(page, 'この招待を取り消す').click()
  await expect(btn(page, '招待される側を試す')).toHaveCount(0)
  await btn(page, 'リストを開く').click()
  await btn(page, 'はる（デモ）として試す').click()
  await page.goto(detail)
  await expect(page.getByRole('heading', { name: 'このリストは表示できません' })).toBeVisible()
  await expect(page.getByText('湖を眺めてのんびりしたい')).toHaveCount(0)
  await page.goto(invitation)
  await expect(btn(page, '説明を確認して参加申請')).toHaveCount(0)
  await btn(page, 'リスト一覧へ').click()
  await btn(page, 'あなたとして試す').click()
  await page.getByRole('button', { name: /ふたりの休日.*作成者/ }).click()
  await btn(page, 'リストの設定とメンバー').click()
  await btn(page, '共有リストを削除').click()
  await btn(page, 'キャンセル').click()
  expect((await saved(page)).lists).toHaveLength(1)
  await btn(page, '共有リストを削除').click()
  await btn(page, '確認して実行').click()
  await expect.poll(async () => (await saved(page)).lists).toHaveLength(0)
  await page.goto(detail)
  await expect(page.getByRole('heading', { name: 'このリストは表示できません' })).toBeVisible()
})
test('link preview, duplicate detection, private save separation, narrow layout and keyboard modal exit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await enter(page)
  await create(page)
  const add = async () => {
    await btn(page, '候補を追加').click()
    await page.getByRole('textbox', { name: '場所の名前' }).fill('架空のカフェ')
    await page.getByRole('textbox', { name: '公開ページのURL' }).fill('https://example.com/cafe')
    await btn(page, '共有前に確認する').click()
    await expect(page.getByRole('dialog')).toContainText('内容未確認')
    await btn(page, 'この内容をリストに追加').click()
    await expect(page.locator('.header-title')).toHaveText('持ち寄った候補')
  }
  await add()
  await btn(page, '私の行きたいにも保存').click()
  await expect(btn(page, '私の行きたいに保存済み')).toBeDisabled()
  await btn(page, '戻る').click()
  await add()
  expect((await saved(page)).lists[0].items).toHaveLength(1)
  await btn(page, 'このリストから削除').click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(
    await page.locator('.phone-screen').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
  await btn(page, 'このリストから削除').click()
  await btn(page, '候補を削除').click()
  await expect.poll(async () => (await saved(page)).lists[0].items).toHaveLength(0)
  const personal = await page.evaluate(() => JSON.parse(localStorage.getItem('driveplus.mock.v1')!))
  expect(personal.links).toHaveLength(1)
})
test('failed writes preserve form input and no list appears until persistence succeeds', async ({
  page,
}) => {
  await enter(page)
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (k, value) {
      if (k === key) throw new Error('検証用の容量不足')
      original.call(this, k, value)
    }
  }, SHARING_KEY)
  await btn(page, '新しいリストを作る').click()
  await page.getByRole('textbox', { name: 'リストの名前' }).fill('失敗しても残す名前')
  await btn(page, 'リストを作成').click()
  await expect(page.getByRole('alert')).toContainText('容量不足')
  await expect(page.getByRole('textbox', { name: 'リストの名前' })).toHaveValue(
    '失敗しても残す名前',
  )
  expect(await saved(page)).toBeNull()
})
test('corrupt shared data is preserved, private list works, and explicit reset clears both stores', async ({
  page,
}) => {
  await enter(page)
  const raw = '{"schemaVersion":999,"revision":0,"lists":[]}'
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: SHARING_KEY, raw })
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('対応していません')
  await expect(btn(page, '新しいリストを作る')).toBeDisabled()
  expect(await page.evaluate((key) => localStorage.getItem(key), SHARING_KEY)).toBe(raw)
  await page.getByRole('navigation').getByRole('button', { name: '行きたい', exact: true }).click()
  await expect(page.locator('.saved-outing')).toContainText('富士山と、湖畔の小さな旅')
  await page.goto('/#/settings')
  await btn(page, 'モックの保存データを削除').click()
  await expect(page.getByRole('dialog')).toContainText('共有リストの端末内デモ')
  await btn(page, '削除して最初から始める').click()
  await expect(page).toHaveURL(/welcome$/)
  expect(await saved(page)).toBeNull()
})

test('an externally refreshed edit preserves input and rejects a stale form instead of overwriting', async ({
  page,
}) => {
  await enter(page)
  await create(page)
  await btn(page, 'リストの設定とメンバー').click()
  await page.getByRole('textbox', { name: 'リスト名', exact: true }).fill('自分が入力中の名前')
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key)!)
    state.revision++
    state.lists[0].name = '別の画面で変更した名前'
    state.lists[0].updatedAt = new Date(Date.now() + 1000).toISOString()
    localStorage.setItem(key, JSON.stringify(state))
    window.dispatchEvent(new StorageEvent('storage', { key }))
  }, SHARING_KEY)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('別の画面で変更した名前')
  await expect(page.getByRole('textbox', { name: 'リスト名', exact: true })).toHaveValue(
    '自分が入力中の名前',
  )
  await btn(page, '変更を保存').click()
  await expect(page.getByRole('alert')).toContainText('別の画面で変更')
  expect((await saved(page)).lists[0].name).toBe('別の画面で変更した名前')
})
