import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Cross-area lifecycle/save tests start with the explicitly labelled usage samples.
// This is not an all-regions search option; live search always needs a selected station.
export async function showUnscopedSamples(page: Page) {
  await expect(page.locator('.discovery-region-button')).toContainText('駅を選択')
}
export async function chooseStation(page: Page, label: string, query: string, name: string) {
  await page.getByRole('combobox', { name: label, exact: true }).fill(query)
  await page.getByRole('option').filter({ hasText: name }).first().click()
}
