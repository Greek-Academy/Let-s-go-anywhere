import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tools/spot-research/tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  outputDir: 'research-test-results',
  reporter: [['list'], ['html', { outputFolder: 'research-playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4182',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'research-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1000 } },
    },
    { name: 'research-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'research-webkit', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
  webServer: {
    command: 'npm run research:demo -- --port 4182',
    url: 'http://127.0.0.1:4182',
    reuseExistingServer: false,
  },
})
