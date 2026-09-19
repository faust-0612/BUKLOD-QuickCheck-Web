import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const root = lock?.packages?.[''];

if (!root) throw new Error('package-lock root metadata missing.');
if (root.name !== pkg.name) throw new Error(`lock root name mismatch: ${root.name} != ${pkg.name}`);
if (root.version !== pkg.version) throw new Error(`lock root version mismatch: ${root.version} != ${pkg.version}`);

function assertExactMap(label, actual = {}, expected = {}) {
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();

  if (actualKeys.length !== expectedKeys.length) {
    throw new Error(`${label} key count mismatch: lock=${actualKeys.length}, package=${expectedKeys.length}`);
  }

  for (let i = 0; i < expectedKeys.length; i++) {
    if (actualKeys[i] !== expectedKeys[i]) {
      throw new Error(`${label} keys mismatch: lock=[${actualKeys.join(', ')}], package=[${expectedKeys.join(', ')}]`);
    }
    const key = expectedKeys[i];
    if (actual[key] !== expected[key]) {
      throw new Error(`${label} version mismatch for ${key}: lock=${actual[key]}, package=${expected[key]}`);
    }
  }
}

assertExactMap('dependencies', root.dependencies, pkg.dependencies);
assertExactMap('devDependencies', root.devDependencies, pkg.devDependencies);

console.log(JSON.stringify({
  name: pkg.name,
  version: pkg.version,
  lockfileVersion: lock.lockfileVersion,
  productionDependencies: Object.keys(pkg.dependencies || {}).length,
  devDependencies: Object.keys(pkg.devDependencies || {}).length,
}, null, 2));
console.log('QUICKCHECK_PACKAGE_LOCK_PARITY_PASS');
