import { defineConfig, devices } from '@playwright/test'

// End-to-end tests on a phone-sized screen against the local Supabase stack
// (`pnpm db:start` at the repo root first). Set E2E_BASE_URL to test a running
// build instead, e.g. the production container: E2E_BASE_URL=http://localhost:8080
const externalUrl = process.env.E2E_BASE_URL
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  timeout: 60_000,
  use: {
    ...devices['Pixel 5'],
    baseURL: externalUrl ?? 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : {
        command: 'pnpm dev --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
})
