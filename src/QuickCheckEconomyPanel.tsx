import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Landmark, Loader2, ShieldCheck, WalletCards } from 'lucide-react';
import {
  adsenseClient,
  adsenseDashboardSlot,
  EconomyError,
  economyInvoke,
  peso,
} from './economy';

type Product = {
  code: string;
  kind: 'CREDIT_PACK' | 'SUBSCRIPTION';
  name: string;
  price_minor: number;
  wallet_credit_minor: number;
  duration_days?: number | null;
  ad_free: boolean;
};

type Dashboard = {
  currency: string;
  mode: 'METER_ONLY' | 'LIVE' | 'PAUSED';
  targetMarginBps: number;
  freeDailyAllowanceMinor: number;
  freeRemainingMinor: number;
  adsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  wallet: {
    paidMinor: number;
    promoMinor: number;
    totalMinor: number;
    subscriptionCode?: string | null;
    subscriptionExpiresAt?: string | null;
  };
  products: Product[];
};

type FinanceSnapshot = {
  currency: string;
  cashCollectedMinor: number;
  adRevenueMinor: number;
  aiCostMinor: number;
  walletLiabilityMinor: number;
  reserveMinor: number;
  payoutsPaidMinor: number;
  withdrawableMinor: number;
  enforcementMode: string;
  targetMarginBps: number;
};

function AdBanner({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !adsenseClient || !adsenseDashboardSlot) return;
    const id = 'quickcheck-adsense-script';
    if (!document.getElementById(id)) {
      const script = document.createElement('script');
      script.id = id;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsenseClient)}`;
      document.head.appendChild(script);
    }
    const timer = window.setTimeout(() => {
      try {
        const w = window as any;
        w.adsbygoogle = w.adsbygoogle || [];
        w.adsbygoogle.push({});
      } catch {
        // Ad blockers/provider availability must never break QuickCheck.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (!enabled || !adsenseClient || !adsenseDashboardSlot) return null;
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70 p-2" aria-label="QuickCheck sponsor">
      <div className="mb-1 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Sponsored</div>
      <ins
        className="adsbygoogle block min-h-[90px]"
        data-ad-client={adsenseClient}
        data-ad-slot={adsenseDashboardSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default function QuickCheckEconomyPanel({ connected }: { connected: boolean }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [finance, setFinance] = useState<FinanceSnapshot | null>(null);
  const [payoutMinor, setPayoutMinor] = useState('');
  const [destinationMask, setDestinationMask] = useState('');

  const activeAdFree = useMemo(() => {
    if (!dashboard?.wallet.subscriptionCode || !dashboard.wallet.subscriptionExpiresAt) return false;
    return new Date(dashboard.wallet.subscriptionExpiresAt).getTime() > Date.now();
  }, [dashboard]);

  const refresh = async () => {
    if (!connected) {
      setDashboard(null);
      setFinance(null);
      return;
    }
    const [dash, checkout] = await Promise.all([
      economyInvoke('quickcheck-economy-v1', { action: 'dashboard' }),
      economyInvoke('quickcheck-checkout-v1', { action: 'health' }),
    ]);
    setDashboard(dash);
    setCheckoutReady(!!checkout.providerConfigured);
    try {
      const admin = await economyInvoke('quickcheck-economy-v1', { action: 'admin_summary' });
      setFinance(admin.snapshot || null);
    } catch (error) {
      if (!(error instanceof EconomyError) || error.status !== 403) {
        console.warn('QuickCheck finance summary unavailable', error);
      }
      setFinance(null);
    }
  };

  useEffect(() => {
    void refresh().catch(error => setNotice(error instanceof Error ? error.message : 'Economy dashboard unavailable.'));
  }, [connected]);

  useEffect(() => {
    if (!connected) return;
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment_id');
    const paymentResult = params.get('payment');
    if (!paymentId || !paymentResult) return;

    let cancelled = false;
    setBusy('Verifying payment…');
    void economyInvoke('quickcheck-payment-status-v1', { paymentId })
      .then(async result => {
        if (cancelled) return;
        setNotice(result.status === 'PAID'
          ? 'Payment verified. Your QuickCheck AI balance has been updated.'
          : `Payment status: ${String(result.status || 'pending')}.`);
        await refresh();
      })
      .catch(error => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : 'Could not verify payment.');
      })
      .finally(() => {
        if (!cancelled) setBusy('');
      });

    params.delete('payment');
    params.delete('payment_id');
    const query = params.toString();
    window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    return () => { cancelled = true; };
  }, [connected]);

  const openCheckout = async (product: Product) => {
    setBusy(product.code);
    setNotice('');
    try {
      const result = await economyInvoke('quickcheck-checkout-v1', { productCode: product.code });
      setNotice(`GCash checkout opened for ${product.name}. Return here after payment to verify automatically.`);
      window.open(String(result.checkoutUrl), '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open GCash checkout.');
    } finally {
      setBusy('');
    }
  };

  const requestPayout = async () => {
    const amountMinor = Math.round(Number(payoutMinor) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setNotice('Enter a valid payout amount.');
      return;
    }
    setBusy('payout');
    try {
      const result = await economyInvoke('quickcheck-payout-v1', {
        action: 'request',
        amountMinor,
        method: 'GCASH',
        destinationMasked: destinationMask.trim(),
      });
      setNotice(`Owner payout request created: ${result.payout?.status || 'REQUESTED'}.`);
      setPayoutMinor('');
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create payout request.');
    } finally {
      setBusy('');
    }
  };

  if (!connected) return null;
  if (!dashboard) {
    return (
      <section className="mb-6 rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
          <Loader2 size={16} className="animate-spin" /> Loading QuickCheck economy…
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mb-6 rounded-3xl border border-emerald-400/25 bg-slate-900 p-5 sm:p-6" aria-label="QuickCheck Economy">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Standalone economy</div>
            <h2 className="mt-1 text-xl font-black">QuickCheck Economy</h2>
            <p className="mt-1 max-w-3xl text-xs text-slate-400">Standalone QuickCheck economy: its revenue, AI cost, wallet, subscriptions, ads, and payouts are not included in BUKLOD user-share computation.</p>
          </div>
          <div className={`rounded-full border px-3 py-1.5 text-xs font-black ${dashboard.mode === 'LIVE' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}>
            {dashboard.mode === 'LIVE' ? 'ECONOMY LIVE' : dashboard.mode === 'METER_ONLY' ? 'CALIBRATION / METER ONLY' : 'ECONOMY PAUSED'}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500"><WalletCards size={14} /> AI balance</div><div className="mt-1 text-2xl font-black">{peso(dashboard.wallet.totalMinor)}</div><div className="mt-1 text-xs text-slate-500">Paid {peso(dashboard.wallet.paidMinor)} · Promo {peso(dashboard.wallet.promoMinor)}</div></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"><div className="text-xs font-bold uppercase text-slate-500">Free daily AI value</div><div className="mt-1 text-2xl font-black">{peso(dashboard.freeRemainingMinor)}</div><div className="mt-1 text-xs text-slate-500">Resets daily; heavy AI use moves to wallet balance.</div></div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"><div className="text-xs font-bold uppercase text-slate-500">Current plan</div><div className="mt-1 text-2xl font-black">{dashboard.wallet.subscriptionCode || 'FREE'}</div><div className="mt-1 text-xs text-slate-500">{activeAdFree ? 'Ad-free while subscription is active.' : 'Free plan may show non-blocking sponsor banners.'}</div></div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.products.map(product => (
            <div key={product.code} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-start justify-between gap-3"><div><div className="font-black">{product.name}</div><div className="mt-1 text-xs text-slate-500">{product.kind === 'SUBSCRIPTION' ? `${product.duration_days || 30} days · ` : ''}{peso(product.wallet_credit_minor)} AI balance{product.ad_free ? ' · ad-free' : ''}</div></div><div className="text-lg font-black text-emerald-300">{peso(product.price_minor)}</div></div>
              <button disabled={!checkoutReady || !!busy} onClick={() => void openCheckout(product)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{busy === product.code ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}{checkoutReady ? 'PAY WITH GCASH' : 'GCASH SETUP PENDING'}</button>
            </div>
          ))}
        </div>

        {notice && <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs font-bold text-cyan-200">{notice}</div>}
        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-300" />AI calls are metered server-side. Failed AI calls refund reserved wallet/free allowance. Payments and ad rewards are accepted only from verified server-side provider results.</div>
      </section>

      <AdBanner enabled={dashboard.adsEnabled && !activeAdFree} />

      {finance && (
        <section className="mb-6 rounded-3xl border border-violet-400/25 bg-slate-900 p-5 sm:p-6" aria-label="Owner Finance">
          <div className="flex items-center gap-2"><Landmark size={18} className="text-violet-300" /><h2 className="text-xl font-black">Owner Finance</h2></div>
          <p className="mt-1 text-xs text-slate-400">Founder/System Finance only. FCC will consume summarized outbox events later; QuickCheck remains its own P&amp;L.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ['Cash collected', finance.cashCollectedMinor], ['Ad revenue', finance.adRevenueMinor], ['AI cost', finance.aiCostMinor], ['Wallet liability', finance.walletLiabilityMinor], ['Safety reserve', finance.reserveMinor], ['Paid out', finance.payoutsPaidMinor], ['Withdrawable now', finance.withdrawableMinor],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><div className="text-[10px] font-bold uppercase text-slate-500">{label}</div><div className="mt-1 font-black">{peso(Number(value))}</div></div>)}
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[160px_1fr_auto]">
            <input value={payoutMinor} onChange={e => setPayoutMinor(e.target.value)} inputMode="decimal" placeholder="Payout PHP" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
            <input value={destinationMask} onChange={e => setDestinationMask(e.target.value)} placeholder="Masked destination, e.g. GCash •••• 1234" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm" />
            <button disabled={busy === 'payout' || finance.withdrawableMinor <= 0} onClick={() => void requestPayout()} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-xs font-black text-violet-200 disabled:opacity-40">{busy === 'payout' ? 'REQUESTING…' : 'REQUEST OWNER PAYOUT'}</button>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">Withdrawable excludes AI cost, outstanding user wallet liability, and the safety reserve. Automatic money-out remains safety-locked until Xendit MONEY-OUT is enabled.</div>
        </section>
      )}
    </>
  );
}
