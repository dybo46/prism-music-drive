import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: process.env.CI ? 180000 : 45000,
  expect: { timeout: process.env.CI ? 60000 : 5000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: process.env.CI ? undefined : 'chrome',
    headless: true,
    // Hosted CI has software WebGL: preserve CSS layout, reduce render pixels only.
    deviceScaleFactor: process.env.CI ? 0.125 : 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1920, height: 1080 },
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
