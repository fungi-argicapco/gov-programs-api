import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4010',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'bun run dev -- --host 127.0.0.1 --port 4010',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    url: 'http://127.0.0.1:4010',
    env: {
      VITE_E2E_MOCK_PROGRAMS: '1'
    }
  }
})
