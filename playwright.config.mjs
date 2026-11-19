// BOARD_URL set: smoke run against a live board (only /ack is answered locally).
// Otherwise: serve BOARD_DIR (default app/) locally with the whole API mocked.
// EXPECT_SHA: the build the page must name (set by the deploy gate and the live smoke run).
import { defineConfig, devices } from 'playwright/test';

const live = process.env.BOARD_URL;
const port = Number(process.env.PORT || 4173);

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: live || `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 5_000,
    locale: 'en-NZ',
    timezoneId: 'Pacific/Auckland',
  },
  webServer: live
    ? undefined
    : {
        command: 'node tests/serve.mjs',
        url: `http://127.0.0.1:${port}/`,
        reuseExistingServer: false,
        env: { BOARD_DIR: process.env.BOARD_DIR || 'app', PORT: String(port) },
      },
});
