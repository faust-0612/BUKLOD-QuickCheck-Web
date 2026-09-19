const URL = 'https://yhanxndaqbmuzbdqlblu.supabase.co';
const KEY = 'sb_publishable_RWvrYHzgLMvBousgwn4dTg_QawYzwRS';

async function post(slug, body, extra = {}) {
  const response = await fetch(URL + '/functions/v1/' + slug, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

let r = await post('quickcheck-process-v1', { action: 'health' });
if (!r.response.ok || !r.data.ok || r.data.service !== 'quickcheck-process-v1' || Number(r.data.version) < 5 || r.data.assessment_identity !== 'question-set-unity' || r.data.ai_retry_fallback !== true) {
  throw new Error('quickcheck-process-v1 health/hardening failed: ' + r.response.status + ' ' + JSON.stringify(r.data));
}

r = await post('quickcheck-records-v1', { action: 'health' });
if (!r.response.ok || !r.data.ok || r.data.service !== 'quickcheck-records-v1' || Number(r.data.version) < 3 || r.data.reprocess_persisted !== true || r.data.released_batches_immutable !== true) {
  throw new Error('quickcheck-records-v1 health/hardening failed: ' + r.response.status + ' ' + JSON.stringify(r.data));
}

r = await post('quickcheck-handoff-redeem-v2', { code: 'E2E_INVALID_CODE' });
if (r.response.status >= 500 || !r.data.error) {
  throw new Error('handoff redeem safety smoke failed: ' + r.response.status + ' ' + JSON.stringify(r.data));
}

r = await post('quickcheck-handoff-mint', { source: 'profile-accessory' });
if (r.response.status < 400 || r.response.status >= 500) {
  throw new Error('handoff mint auth gate smoke failed: ' + r.response.status + ' ' + JSON.stringify(r.data));
}

console.log('QUICKCHECK_BACKEND_SMOKE_PASS');
