'use strict';

// Run the complete Node.js test suite with Node's built-in test runner.
// The test files use describe()/it()/test(); executing them as plain scripts
// does not register or execute those suites.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const testFiles = [
  'shared/random.test.js',
  'shared/seed-key.test.js',
  'shared/board-rng.test.js',
  'shared/entropy.test.js',
  'qwerty/board-determinism.test.js',
  'qwerty/safe-symbols.test.js',
  'qwerty/recipe-generation.test.js',
  'qwerty/service-worker-assets.test.js',
  'qwerty/service-worker-redirect.test.js'
].map((file) => path.join(__dirname, file));

console.log('CryptoPassKey QWERTY — Node.js test suite');
const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: __dirname,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
