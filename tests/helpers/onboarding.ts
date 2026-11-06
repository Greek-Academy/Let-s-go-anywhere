import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../../src/state/model'

// Non-onboarding tests use an existing configured profile. The actual welcome ->
// comic guide -> hobbies -> search journey is covered by the onboarding and journey flows.
export async function openHomeForTest(page: Page) {
  await expect(page.getByRole('button', { name: 'はじめる', exact: true })).toBeVisible()
  await page.evaluate((initial) => {
    const raw = localStorage.getItem('driveplus.mock.v1')
    const state = raw ? JSON.parse(raw) : initial
    localStorage.setItem('driveplus.mock.v1', JSON.stringify({ ...state, onboarded: true }))
  }, createInitialState())
  const home = new URL(page.url())
  home.hash = '/discover'
  await page.goto(home.href)
  // A hash-only navigation keeps React state; reload to read the seeded record.
  await page.reload()
}

export async function finishGuideForTest(page: Page) {
  await expect(page).toHaveURL(/#\/onboarding\/guide$/)
  await page
    .getByRole('button', { name: '6ページ目：「ここへ行こう」が見つかる', exact: true })
    .click()
  await page.getByRole('button', { name: 'さっそく、趣味を選ぶ', exact: true }).click()
  await expect(page).toHaveURL(/#\/onboarding\/1$/)
}
