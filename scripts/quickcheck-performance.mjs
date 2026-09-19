import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const dist = path.resolve('dist');
const htmlPath = path.join(dist, 'index.html');
if (!fs.existsSync(htmlPath)) throw new Error('dist/index.html missing. Run production build first.');

const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script[^>]+src=["']([^"']+\.js)["']/i);
if (!scriptMatch) throw new Error('Production entry JS was not found in dist/index.html.');

const entryPath = path.join(dist, scriptMatch[1].replace(/^\//, ''));
const raw = fs.readFileSync(entryPath);
const gzip = zlib.gzipSync(raw);

const rawKb = raw.length / 1024;
const gzipKb = gzip.length / 1024;
console.log(`QuickCheck initial JS: ${rawKb.toFixed(1)} KB raw / ${gzipKb.toFixed(1)} KB gzip`);

if (raw.length > 800 * 1024) {
  throw new Error(`Initial JS exceeds 800 KB performance budget: ${rawKb.toFixed(1)} KB`);
}
if (gzip.length > 250 * 1024) {
  throw new Error(`Initial JS gzip exceeds 250 KB performance budget: ${gzipKb.toFixed(1)} KB`);
}

const assetsDir = path.join(dist, 'assets');
const assets = fs.readdirSync(assetsDir).map(name => {
  const p = path.join(assetsDir, name);
  return { name, size: fs.statSync(p).size };
}).sort((a,b)=>b.size-a.size);

const unexpectedHuge = assets.filter(a => a.size > 2 * 1024 * 1024);
if (unexpectedHuge.length) {
  throw new Error('Unexpected asset over 2 MB: ' + unexpectedHuge.map(a => a.name).join(', '));
}

const localImportSource = fs.readFileSync(path.resolve('src/localImport.ts'), 'utf8');
if (/^import\s+.*(?:mammoth|pdfjs-dist)/m.test(localImportSource)) {
  throw new Error('Heavy PDF/DOCX parsers must remain lazy-loaded.');
}

console.log('QUICKCHECK_PERFORMANCE_BUDGET_PASS');
