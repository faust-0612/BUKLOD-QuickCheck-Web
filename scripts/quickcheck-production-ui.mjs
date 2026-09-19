import { chromium } from '@playwright/test';

const url = 'https://buklod-quickcheck-web.vercel.app/?production-smoke=' + Date.now();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  if (!response || !response.ok()) throw new Error('Production page HTTP failed: ' + (response?.status() ?? 'no response'));

  const bodyText = (await page.locator('body').innerText()).trim();
  if (bodyText.length < 200) throw new Error('Production page appears blank or incomplete.');

  const required = [
    'QuickCheck',
    'Batch Records / History',
    'SELECT FILES',
    'SELECT FOLDER',
    'START CONTINUOUS SCAN',
    'Teacher Rubric',
  ];
  for (const token of required) {
    if (!bodyText.includes(token)) throw new Error('Production UI missing: ' + token);
  }

  await page.getByRole('button', { name: 'Load Demo Data' }).click();
  await page.getByText('END-TO-END BATCH REPORT').waitFor({ state: 'visible' });
  const report = page.locator('section').filter({ hasText: 'END-TO-END BATCH REPORT' }).first();
  const captured = report.getByRole('button').filter({ hasText: /Captured/i }).first();
  await captured.click();
  await page.getByText('Report Inspector').waitFor({ state: 'visible' });
  await page.getByRole('dialog').filter({ hasText: 'Report Inspector' }).getByRole('button', { name: /CLOSE/i }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByText(/Batch cleared/i).waitFor({ state: 'visible' });

  if (pageErrors.length) throw new Error('Production page error: ' + pageErrors.join(' | '));

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    return {
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : 0,
      loadEventEnd: nav ? nav.loadEventEnd : 0,
      jsTransfer: resources.filter(r => r.name.includes('/assets/') && r.name.endsWith('.js')).reduce((n, r) => n + (r.transferSize || 0), 0),
    };
  });
  if (perf.domContentLoaded > 8000) throw new Error('Production DOMContentLoaded exceeded 8s: ' + perf.domContentLoaded);
  if (perf.loadEventEnd > 12000) throw new Error('Production load exceeded 12s: ' + perf.loadEventEnd);
  console.log('Production performance:', JSON.stringify(perf));
  console.log('QUICKCHECK_PRODUCTION_UI_PASS');
} finally {
  await browser.close();
}
