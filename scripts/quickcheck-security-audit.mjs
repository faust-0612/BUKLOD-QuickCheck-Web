import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';

const lockPath = new URL('../package-lock.json', import.meta.url);
if (!fs.existsSync(lockPath)) {
  throw new Error('package-lock.json is missing. Regenerate the exact lock before security audit.');
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
if (Number(lock.lockfileVersion) < 3 || !lock.packages || typeof lock.packages !== 'object') {
  throw new Error('Expected npm package-lock v3 with a packages map.');
}

const root = lock.packages[''];
if (!root || typeof root !== 'object') {
  throw new Error('package-lock root package metadata is missing.');
}

const rootProd = root.dependencies && typeof root.dependencies === 'object' ? root.dependencies : {};
const packageEntries = Object.entries(lock.packages);

function packageNameFromPath(pkgPath, meta) {
  if (meta && typeof meta.name === 'string' && meta.name) return meta.name;
  const marker = 'node_modules/';
  const i = pkgPath.lastIndexOf(marker);
  if (i < 0) return '';
  return pkgPath.slice(i + marker.length);
}

const versions = new Map();
for (const [pkgPath, meta] of packageEntries) {
  if (!pkgPath || !meta || typeof meta !== 'object') continue;

  // npm lockfile v3 marks packages that are exclusively development-only with dev:true.
  // Everything else is part of, or can be required by, the production install closure.
  if (meta.dev === true) continue;

  const name = packageNameFromPath(pkgPath, meta);
  const version = typeof meta.version === 'string' ? meta.version : '';
  if (!name || !version) continue;

  if (!versions.has(name)) versions.set(name, new Set());
  versions.get(name).add(version);
}

for (const name of Object.keys(rootProd)) {
  const rootPath = 'node_modules/' + name;
  const meta = lock.packages[rootPath];
  if (!meta || typeof meta.version !== 'string') {
    throw new Error('Production root dependency is missing from package-lock: ' + name);
  }
  if (meta.dev === true) {
    throw new Error('Production root dependency is incorrectly marked dev-only in package-lock: ' + name);
  }
}

const payload = Object.fromEntries(
  [...versions.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, set]) => [name, [...set].sort()])
);

if (!Object.keys(payload).length) {
  throw new Error('Production dependency closure from package-lock was unexpectedly empty.');
}

async function fetchBulk() {
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'accept-encoding': 'identity',
      'user-agent': 'buklod-quickcheck-security-audit/2.0',
    },
    body: JSON.stringify(payload),
  });

  const bytes = Buffer.from(await response.arrayBuffer());
  let decoded = bytes;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    decoded = gunzipSync(bytes);
  }
  const text = decoded.toString('utf8');

  if (!response.ok) {
    throw new Error('Bulk advisory endpoint HTTP ' + response.status + ': ' + text.slice(0, 1000));
  }

  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new Error('Bulk advisory endpoint returned invalid JSON: ' + text.slice(0, 1000));
  }
}

let report;
let lastError;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    report = await fetchBulk();
    break;
  } catch (error) {
    lastError = error;
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 1000));
  }
}
if (!report) throw lastError || new Error('Bulk advisory lookup failed.');

const advisories = [];
for (const [pkg, items] of Object.entries(report)) {
  if (!Array.isArray(items)) continue;
  for (const item of items) advisories.push({ package: pkg, ...item });
}

const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const blocking = advisories.filter(
  a => (severityRank[String(a.severity || '').toLowerCase()] ?? 0) >= 3
);

console.log(JSON.stringify({
  lockfile_version: lock.lockfileVersion,
  production_root_dependencies: Object.keys(rootProd).length,
  audited_package_names: Object.keys(payload).length,
  advisory_count: advisories.length,
  blocking_high_or_critical: blocking.length,
}, null, 2));

for (const a of advisories) {
  console.log(
    `${String(a.severity || 'unknown').toUpperCase()} ${a.package}: ${a.title || 'advisory'} ${a.url || ''}`
  );
}

if (blocking.length) {
  throw new Error('Production security audit blocked by high/critical advisories.');
}

console.log('QUICKCHECK_PRODUCTION_SECURITY_AUDIT_PASS');
