import { defineConfig, devices } from '@playwright/test'
const port = Number(process.env.PLAYWRIGHT_REVIEW_PORT ?? 5180)
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PLAYWRIGHT_REVIEW_PORT must be a valid port')
export default defineConfig({
  testDir: './tools/content-review/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  outputDir: 'review-test-results',
  reporter: [['list'], ['html', { outputFolder: 'review-playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'review-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 1000 } },
    },
    { name: 'review-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: `npm run preview:review -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
})
