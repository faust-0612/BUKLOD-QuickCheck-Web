import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const arg = process.argv.find(x => x.startsWith('--base='));
const base = arg ? arg.slice('--base='.length) : 'HEAD^';
const run = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const files = run('diff', '--name-only', base, 'HEAD').split(/\r?\n/).filter(Boolean);
const exact = new Set([
  '.env.example', '.github/workflows/quickcheck-e2e.yml', 'src/App.tsx', 'src/QuickCheckEconomyPanel.tsx', 'src/economy.ts', 'tests/quickcheck-economy.spec.ts', 'scripts/quickcheck-economy-contract.mjs', 'scripts/quickcheck-economy-change-gate.mjs', 'scripts/quickcheck-economy-backend-smoke.mjs', 'scripts/quickcheck-economy-production-smoke.mjs'
]);
let economyOnly = files.length > 0 && files.every(file => exact.has(file) || file.startsWith('supabase/migrations/20260924_quickcheck_economy_'));
if (economyOnly && files.includes('src/App.tsx')) {
  const patch = run('diff', '--unified=0', base, 'HEAD', '--', 'src/App.tsx');
  const changed = patch.split(/\r?\n/).filter(line => /^[+-](?![+-])/.test(line));
  economyOnly = changed.every(line => line.includes('QuickCheckEconomyPanel') || line.trim() === '+' || line.trim() === '-');
}
console.log('Changed files:', files.join(', '));
console.log('ECONOMY_ONLY=' + economyOnly);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `economy_only=${economyOnly ? 'true' : 'false'}\n`);
if (process.argv.includes('--assert') && !economyOnly) throw new Error('Economy delta escaped the targeted-change allowlist.');
