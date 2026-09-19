const ORIGIN = 'https://buklod-quickcheck-web.vercel.app';
const required = ['Report Inspector', 'REVIEW FLAGS ONLY', 'START CONTINUOUS SCAN', 'Open exact Paper Review', 'reprocess_batch', 'buklod_quickcheck_session_v1', 'Connected securely from BUKLOD'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function check() {
  const htmlRes = await fetch(ORIGIN + '/?qa=' + Date.now(), { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  if (!htmlRes.ok) return { ok: false, why: 'HTML ' + htmlRes.status };
  const html = await htmlRes.text();
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => new URL(m[1], ORIGIN).href);
  if (!scripts.length) return { ok: false, why: 'No JS bundle found' };
  let combined = '';
  for (const url of scripts) {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'qa=' + Date.now(), { headers: { 'cache-control': 'no-cache' } });
    if (r.ok) combined += '\n' + await r.text();
  }
  const missing = required.filter(token => !combined.includes(token));
  return { ok: missing.length === 0, why: missing.length ? 'Missing: ' + missing.join(', ') : 'all markers present' };
}

for (let attempt = 1; attempt <= 32; attempt++) {
  try {
    const result = await check();
    console.log('Production smoke attempt', attempt, result.why);
    if (result.ok) {
      console.log('QUICKCHECK_PRODUCTION_PARITY_PASS');
      process.exit(0);
    }
  } catch (error) {
    console.log('Production smoke attempt', attempt, 'error:', error?.message || String(error));
  }
  await sleep(15000);
}
throw new Error('Vercel production did not expose the verified QuickCheck parity bundle within the polling window.');
