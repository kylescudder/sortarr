import { defineConfig } from '@playwright/test'
// Run through `bun run test:e2e`, which provisions a throwaway database and a
// signed-in member before Playwright starts.
export default defineConfig({
  globalSetup: './e2e/setup.ts',
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'state/e2e/playwright-report', open: 'never' }]
  ],
  outputDir: 'state/e2e/test-results',
  use: {
    baseURL: 'http://127.0.0.1:43210',
    storageState: 'state/e2e/auth.json',
    screenshot: 'on',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } }
    },
    {
      name: 'mobile',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } }
    }
  ],
  webServer: {
    command: 'bun e2e/serve.ts',
    url: 'http://127.0.0.1:43210/api/health',
    reuseExistingServer: false
  }
})
