import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.QC_E2E_PORT || 0);
if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
  throw new Error('QC_E2E_PORT must be supplied by the E2E runner.');
}

const origin = `http://127.0.0.1:${port}`;
console.log(`[QuickCheck E2E] isolated preview origin: ${origin}`);

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 12_000 },
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: origin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: origin,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
      },
    },
  }],
});
