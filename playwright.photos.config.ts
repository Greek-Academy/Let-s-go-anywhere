import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tools/place-photos/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: 2,
  outputDir: 'photo-test-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5287',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'photo-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'photo-webkit', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
  webServer: {
    command: 'npm run photos:dev -- --port 5287',
    url: 'http://127.0.0.1:5287',
    reuseExistingServer: false,
  },
})
