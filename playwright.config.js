// Playwright config — real-browser E2E + a11y for the dashboard.
// Runs on YOUR machine (npm is offline in the build sandbox):
//   npm install
//   npx playwright install chromium
//   npm run test:e2e
//
// A tiny static server hosts the folder so the classic <script src> files load
// over http (file:// is fine for the app itself, but http keeps Playwright happy
// and matches how a browser would serve it).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5599',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 5599',
    url: 'http://127.0.0.1:5599/tracker.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
