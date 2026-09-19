import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/apiCompat.ts', import.meta.url), 'utf8');

const required = [
  ['continuous camera', 'captureFrame'],
  ['folder import', 'SELECT FOLDER'],
  ['teacher rubric', 'Teacher Rubric'],
  ['end-to-end report', 'END-TO-END BATCH REPORT'],
  ['report inspector', 'Report Inspector'],
  ['scan quality', 'Scan & Quality'],
  ['sorting identity', 'Sorting & Identity'],
  ['grade record', 'Grade & Record'],
  ['end-to-end status', 'End-to-End Status'],
  ['review flags only', 'REVIEW FLAGS ONLY'],
  ['view paper', 'VIEW PAPER'],
  ['edit grade', 'EDIT GRADE'],
  ['approve all correct', 'APPROVE ALL CORRECT'],
  ['release all grades', 'RELEASE ALL GRADES'],
  ['profile accessory entry', 'Profile &gt; Accessory Apps'],
  ['exact paper-review status action', 'Open exact Paper Review'],
  ['session restore', 'hasQuickCheckSession'],
  ['retry failed button', 'RETRY FAILED'],
  ['rubric file button', 'SELECT RUBRIC FILE'],
  ['open record button', 'OPEN RECORD'],
  ['reprocess button', 'REPROCESS'],
  ['sync package button', 'PREPARE BUKLOD SYNC PACKAGE'],
  ['all-failed report visibility', 'failedFrames.length > 0'],
  ['persistent failed-page blocker', 'No blocked page was silently included'],
  ['AI failure reason retention', 'failureReason: \`AI error:'],
];

for (const [label, token] of required) {
  if (!app.includes(token)) throw new Error('Missing contract: ' + label);
}
if (app.includes('replaceAll(')) throw new Error('ES2020 blocker: replaceAll remains.');
for (const token of ['Ã', 'Â', 'â€', 'Î“']) {
  if (app.includes(token)) throw new Error('Mojibake detected: ' + token);
}
if (!app.includes("page.resolvedStudentId?.trim() || page.studentId?.trim() || page.resolvedStudentName?.trim() || page.studentName.trim() || page.rosterUserId?.trim()")) {
  throw new Error('Student grouping precedence is not explicit-identity-first.');
}
if (!api.includes('quickcheck-process-v1') || !api.includes('quickcheck-records-v1')) {
  throw new Error('Supabase adapters missing.');
}
if (!api.includes("action: 'reprocess_batch'") || !api.includes('reprocessPersisted')) {
  throw new Error('Persisted saved-batch reprocess adapter missing.');
}
if (app.includes('Faculty-side Classroom door')) {
  throw new Error('Obsolete Faculty-door QuickCheck copy remains.');
}
console.log('QUICKCHECK_CONTRACT_PASS');
