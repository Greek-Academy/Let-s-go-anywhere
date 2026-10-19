import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Cross-area lifecycle/save tests start with the explicitly labelled usage samples.
// Live search needs an explicit departure location or station.
export async function showUnscopedSamples(page: Page) {
  await expect(
    page.getByRole('button', { name: /^操作用サンプル(を見る|を閉じる)$/ }),
  ).toBeVisible()
  const open = page.getByRole('button', { name: '操作用サンプルを見る', exact: true })
  if (await open.isVisible()) await open.click()
  await expect(
    page.getByText('操作確認用の既存サンプルです。現在地からの検索結果ではありません。'),
  ).toBeVisible()
}
export async function chooseStation(page: Page, label: string, query: string, name: string) {
  await page.getByRole('combobox', { name: label, exact: true }).fill(query)
  await page.getByRole('option').filter({ hasText: name }).first().click()
}
