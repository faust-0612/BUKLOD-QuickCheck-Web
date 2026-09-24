const base = 'https://yhanxndaqbmuzbdqlblu.supabase.co/functions/v1';
async function post(slug, body) {
  const r = await fetch(`${base}/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${slug} HTTP ${r.status}: ${JSON.stringify(data)}`);
  return data;
}
const economy = await post('quickcheck-economy-v1', { action: 'health' });
if (!economy.ok || !['METER_ONLY', 'LIVE'].includes(economy.mode) || economy.products < 6) throw new Error('Economy health failed: ' + JSON.stringify(economy));
const processHealth = await post('quickcheck-process-v1', { action: 'health' });
if (!processHealth.ok || processHealth.version < 6 || !processHealth.economy_metering) throw new Error('AI economy metering not live: ' + JSON.stringify(processHealth));
const checkout = await post('quickcheck-checkout-v1', { action: 'health' });
const paymentStatus = await post('quickcheck-payment-status-v1', { action: 'health' });
const payout = await post('quickcheck-payout-v1', { action: 'health' });
const ads = await post('quickcheck-ad-event-v1', { action: 'health' });
console.log('PASS: economy core', economy);
console.log('PASS: AI metering', processHealth);
console.log('PAYMENT_PROVIDER_CONFIGURED=' + !!checkout.providerConfigured);
console.log('PAYMENT_STATUS_PROVIDER_CONFIGURED=' + !!paymentStatus.providerConfigured);
console.log('AD_PROVIDER_CONFIGURED=' + !!ads.providerConfigured);
console.log('AUTO_PAYOUT_ENABLED=' + !!payout.autoPayoutEnabled);
console.log('QUICKCHECK_ECONOMY_BACKEND_SMOKE_PASS');
