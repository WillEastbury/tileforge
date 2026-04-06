const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:8080',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
    viewport: { width: 1024, height: 768 },
    launchOptions: {
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--js-flags=--max-old-space-size=256',
      ],
    },
  },
  webServer: {
    command: 'node server.js',
    port: 8080,
    reuseExistingServer: true,
    timeout: 10000,
  },
});
