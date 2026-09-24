import fs from 'node:fs';
const app = fs.readFileSync('src/App.tsx', 'utf8');
const panel = fs.readFileSync('src/QuickCheckEconomyPanel.tsx', 'utf8');
const economy = fs.readFileSync('src/economy.ts', 'utf8');
const required = [
  [app, "import QuickCheckEconomyPanel from './QuickCheckEconomyPanel';", 'App imports economy panel'],
  [app, '<QuickCheckEconomyPanel connected={!!buklodToken || buklodHandoffConnected} />', 'App mounts economy panel'],
  [panel, 'Standalone QuickCheck economy', 'standalone economy marker'],
  [panel, 'PAY WITH GCASH', 'GCash checkout UI'],
  [panel, 'Owner Finance', 'owner finance UI'],
  [panel, 'REQUEST OWNER PAYOUT', 'owner payout UI'],
  [economy, 'buklod_quickcheck_session_v1', 'existing QuickCheck session reused'],
  [economy, 'x-quickcheck-session', 'opaque session header reused'],
];
for (const [source, needle, label] of required) {
  if (!source.includes(needle)) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}
console.log('QUICKCHECK_ECONOMY_CONTRACT_PASS');
