import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  testDir: './tools/discovery-search/tests',
  outputDir: 'discovery-search-test-results',
  reporter: [['list'], ['html', { outputFolder: 'discovery-search-report', open: 'never' }]],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5178' },
  webServer: [
    {
      command: 'npm run research:demo -- --port 4183',
      url: 'http://127.0.0.1:4183',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort',
      url: 'http://127.0.0.1:5178',
      reuseExistingServer: false,
      env: { DRIVEPLUS_SEARCH_BACKEND_PORT: '4183' },
    },
  ],
})
