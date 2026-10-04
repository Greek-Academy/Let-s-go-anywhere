import { expect, test } from '@playwright/test'
import { resolveFirebasePilot } from '../build/firebasePilot'

test('only explicit pilot modes can enable Firebase and approve a fixed project', () => {
  const input = {
    DRIVEPLUS_FIREBASE_PROJECT_ID: 'driveplus-fbc33',
    DRIVEPLUS_FIREBASE_API_KEY: `AIza${'x'.repeat(35)}`,
    DRIVEPLUS_FIREBASE_APP_ID: '1:664306107477:web:abcdef',
  }
  expect(resolveFirebasePilot('production', input)).toBeNull()
  expect(resolveFirebasePilot('development', input)).toBeNull()
  expect(resolveFirebasePilot('firebase', input)?.projectId).toBe('driveplus-fbc33')
  expect(resolveFirebasePilot('emulator', input)?.projectId).toBe('demo-driveplus')
  expect(() => resolveFirebasePilot('firebase', {})).toThrow()
  expect(() =>
    resolveFirebasePilot('firebase', {
      ...input,
      DRIVEPLUS_FIREBASE_PROJECT_ID: 'unexpected-production',
    }),
  ).toThrow()
})

test('ordinary preview redirects cloud routes and never calls Firebase', async ({ page }) => {
  const outbound: string[] = []
  page.on('request', (r) => {
    if (/firebase|googleapis\.com/.test(r.url()) && !r.url().includes('/src/'))
      outbound.push(r.url())
  })
  await page.goto('/#/saved/cloud')
  await expect(page).toHaveURL(/saved\/lists/)
  await expect(page.getByRole('button', { name: 'ログインして共有の準備' })).toHaveCount(0)
  await expect(page.getByText('この端末だけの共有体験デモ')).toBeVisible()
  expect(outbound).toHaveLength(0)
})
