import type { Page } from '@playwright/test'

// Existing cross-region scenarios explicitly opt in to all areas.
export async function showAllRegions(page: Page) {
  await page.getByRole('button', { name: '探す地域を変更', exact: true }).click()
  await page.getByRole('button', { name: /^すべての地域 地域で絞り込まず/ }).click()
  await page.getByRole('button', { name: 'この地域で探す', exact: true }).click()
}
