const ORIGIN = 'https://buklod-quickcheck-web.vercel.app';
const ECONOMY = 'https://yhanxndaqbmuzbdqlblu.supabase.co/functions/v1/quickcheck-economy-v1';
const PROCESS = 'https://yhanxndaqbmuzbdqlblu.supabase.co/functions/v1/quickcheck-process-v1';
const required = ['QuickCheck Economy','Standalone QuickCheck economy','PAY WITH GCASH','Owner Finance','REQUEST OWNER PAYOUT','quickcheck-checkout-v1'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bundle() {
  const h = await fetch(ORIGIN + '/?economyqa=' + Date.now(), { headers: { 'cache-control': 'no-cache' } });
  if (!h.ok) return { ok:false, why:`HTML ${h.status}` };
  const html = await h.text();
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => new URL(m[1], ORIGIN).href);
  let all=''; for (const u of scripts) { const r=await fetch(u+(u.includes('?')?'&':'?')+'economyqa='+Date.now(),{headers:{'cache-control':'no-cache'}}); if(r.ok) all+='\n'+await r.text(); }
  const missing=required.filter(x=>!all.includes(x)); return {ok:missing.length===0,why:missing.length?'Missing: '+missing.join(', '):'economy markers present'};
}
for(let i=1;i<=32;i++){
  const x=await bundle().catch(e=>({ok:false,why:e.message})); console.log('Economy production smoke',i,x.why);
  if(x.ok){
    const [e,p]=await Promise.all([
      fetch(ECONOMY,{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"health"}'}).then(r=>r.json()),
      fetch(PROCESS,{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"health"}'}).then(r=>r.json())
    ]);
    if(!['METER_ONLY','LIVE'].includes(e.mode)) throw new Error('Bad economy mode');
    if(!p.economy_metering) throw new Error('AI metering missing');
    console.log('QUICKCHECK_ECONOMY_PRODUCTION_PASS'); process.exit(0);
  }
  await sleep(15000);
}
throw new Error('QuickCheck economy production bundle did not become ready in time.');
