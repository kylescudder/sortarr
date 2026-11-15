import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'artifacts/results.json' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:43210',
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
    url: 'http://127.0.0.1:43210',
    reuseExistingServer: false
  },
  outputDir: 'test-results'
})
