import { expect, test } from '@playwright/test';

const handoff = {
  classroom: { name: 'BUKLOD Profile' },
  facultyUserId: '00000000-0000-4000-8000-000000000001',
  syncedAt: new Date().toISOString(),
  students: [],
  quickcheckSession: 'ECONOMY-E2E-SESSION',
  quickcheckSessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
  backend: 'supabase-v2',
  launchContext: 'profile-accessory',
};

async function installEconomyMocks(page: any, admin = false) {
  await page.addInitScript(() => {
    (window as any).__qcOpened = '';
    window.open = ((url?: string | URL) => {
      (window as any).__qcOpened = String(url || '');
      return null;
    }) as typeof window.open;
  });
  await page.route('**/functions/v1/quickcheck-handoff-redeem-v2', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(handoff) }),
  );
  await page.route('**/functions/v1/quickcheck-records-v1', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.action === 'list_batches' ? { batches: [] } : { ok: true }) });
  });
  await page.route('**/functions/v1/quickcheck-economy-v1', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'health') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mode: 'METER_ONLY', products: 6 }) });
    if (body.action === 'admin_summary') {
      if (!admin) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Finance admin required' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, snapshot: { currency: 'PHP', cashCollectedMinor: 100000, adRevenueMinor: 5000, aiCostMinor: 12000, walletLiabilityMinor: 20000, reserveMinor: 31500, payoutsPaidMinor: 0, withdrawableMinor: 41500, enforcementMode: 'METER_ONLY', targetMarginBps: 7000 }, payments: [], payouts: [], usage: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, currency: 'PHP', mode: 'METER_ONLY', targetMarginBps: 7000, freeDailyAllowanceMinor: 500, freeRemainingMinor: 500, adsEnabled: false, rewardedAdsEnabled: false, wallet: { paidMinor: 1200, promoMinor: 300, totalMinor: 1500, subscriptionCode: null, subscriptionExpiresAt: null }, products: [ { code: 'CREDIT_49', kind: 'CREDIT_PACK', name: 'AI Credit Pack 49', price_minor: 4900, wallet_credit_minor: 3500, duration_days: null, ad_free: false }, { code: 'PRO_199', kind: 'SUBSCRIPTION', name: 'QuickCheck Pro', price_minor: 19900, wallet_credit_minor: 17000, duration_days: 30, ad_free: true } ] }) });
  });
  await page.route('**/functions/v1/quickcheck-checkout-v1', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'health') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, providerConfigured: true }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, paymentId: 'pay-e2e', checkoutUrl: 'https://payments.example/quickcheck' }) });
  });
  await page.route('**/functions/v1/quickcheck-payment-status-v1', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'PAID', paymentId: 'pay-e2e' }) }));
  await page.route('**/functions/v1/quickcheck-payout-v1', async route => {
    const body = route.request().postDataJSON();
    if (body.action === 'request') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, payout: { id: 'payout-e2e', status: 'REQUESTED' } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, autoPayoutEnabled: false }) });
  });
}

test('economy delta: wallet, plans and GCash checkout hook', async ({ page }) => {
  await installEconomyMocks(page);
  await page.goto('/?handoff=ECONOMY-CODE');
  const economy = page.getByRole('region', { name: 'QuickCheck Economy' });
  await expect(economy).toBeVisible();
  await expect(economy.getByText('₱15.00')).toBeVisible();
  await expect(economy.getByText('₱5.00')).toBeVisible();
  await expect(economy.getByText('AI Credit Pack 49')).toBeVisible();
  await expect(economy.getByText('QuickCheck Pro')).toBeVisible();
  await economy.getByRole('button', { name: 'PAY WITH GCASH' }).first().click();
  await expect(economy.getByText(/GCash checkout opened/i)).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__qcOpened)).toBe('https://payments.example/quickcheck');
});

test('economy delta: payment return refreshes wallet messaging', async ({ page }) => {
  await installEconomyMocks(page);
  await page.goto('/?handoff=ECONOMY-CODE&payment=success&payment_id=pay-e2e');
  const economy = page.getByRole('region', { name: 'QuickCheck Economy' });
  await expect(economy).toBeVisible();
  await expect(economy.getByText(/Payment verified/i)).toBeVisible();
  await expect(page).not.toHaveURL(/payment_id=/);
});

test('economy delta: owner finance and payout request are admin-only', async ({ page }) => {
  await installEconomyMocks(page, true);
  await page.goto('/?handoff=ECONOMY-CODE');
  const finance = page.getByRole('region', { name: 'Owner Finance' });
  await expect(finance).toBeVisible();
  await expect(finance.getByText('₱415.00')).toBeVisible();
  await finance.getByPlaceholder('Payout PHP').fill('100');
  await finance.getByPlaceholder(/Masked destination/i).fill('GCash •••• 1234');
  await finance.getByRole('button', { name: 'REQUEST OWNER PAYOUT' }).click();
  await expect(page.getByText(/Owner payout request created: REQUESTED/i)).toBeVisible();
});
