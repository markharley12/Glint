import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests against a production build served by `vite preview`.
 * They need orbit data in public/data (run `npm run data` first; CI fetches
 * it, or copies the test fixture snapshot — see e2e/README in CLAUDE.md).
 *
 * Chrome is the system install (`channel: 'chrome'`), so no browser
 * download is needed locally; GitHub's Ubuntu runners have Chrome too.
 */
const PORT = 4318

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
