import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createInitialState } from '../../src/state/model'

// Non-onboarding tests use an existing configured profile. The actual welcome ->
// hobbies -> search journey remains covered by the onboarding and journey flows.
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
