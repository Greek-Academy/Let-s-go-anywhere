import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tools/public-search/browser',
  outputDir: 'dogfood-test-results',
  workers: 1,
  timeout: 50_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'dogfood-playwright-report' }]],
  use: { baseURL: 'http://127.0.0.1:5190', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 1000 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command:
      'DRIVEPLUS_SEARCH_ORIGIN=http://127.0.0.1:8787 vite build --mode emulator && vite preview --mode emulator --host 127.0.0.1 --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: false,
  },
})
