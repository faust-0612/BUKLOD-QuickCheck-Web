const URL = 'https://yhanxndaqbmuzbdqlblu.supabase.co';
const KEY = 'sb_publishable_RWvrYHzgLMvBousgwn4dTg_QawYzwRS';

async function hit(slug) {
  const started = performance.now();
  const response = await fetch(URL + '/functions/v1/' + slug, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'health' }),
  });
  const elapsed = performance.now() - started;
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(slug + ' failed: ' + response.status + ' ' + JSON.stringify(body));
  }
  return elapsed;
}

function percentile(values, p) {
  const sorted = [...values].sort((a,b)=>a-b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

const tasks = [];
for (let i = 0; i < 16; i++) {
  tasks.push(hit('quickcheck-process-v1'));
  tasks.push(hit('quickcheck-records-v1'));
}

const started = performance.now();
const latencies = await Promise.all(tasks);
const total = performance.now() - started;
const p95 = percentile(latencies, 0.95);
const max = Math.max(...latencies);

console.log(JSON.stringify({
  requests: latencies.length,
  total_ms: Math.round(total),
  p95_ms: Math.round(p95),
  max_ms: Math.round(max),
}));

if (p95 > 8000) throw new Error('QuickCheck backend health p95 exceeded 8s.');
if (max > 15000) throw new Error('QuickCheck backend health max latency exceeded 15s.');
console.log('QUICKCHECK_BACKEND_CONCURRENCY_PASS');
