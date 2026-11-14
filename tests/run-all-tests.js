'use strict';

/**
 * 全テスト一括実行スクリプト (Node.js 用)
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testFiles = [
  'shared/random.test.js',
  'shared/seed-key.test.js',
  'shared/board-rng.test.js',
  'shared/entropy.test.js',
  'qwerty/board-determinism.test.js',
  'qwerty/safe-symbols.test.js',
  'qwerty/recipe-generation.test.js'
];

console.log('==================================================');
console.log(' CryptoPassKey QWERTY Test Runner (Node.js)       ');
console.log('==================================================\n');

let passCount = 0;
let failCount = 0;

for (const tf of testFiles) {
  const fullPath = path.join(__dirname, tf);
  console.log(`▶ Running ${tf} ...`);
  try {
    execSync(`node "${fullPath}"`, { stdio: 'inherit' });
    passCount++;
    console.log(`✔ [OK] ${tf}\n`);
  } catch (err) {
    failCount++;
    console.error(`✖ [FAIL] ${tf}\n`);
  }
}

console.log('--------------------------------------------------');
console.log(`Results: ${passCount} passed, ${failCount} failed, total ${testFiles.length}`);
console.log('--------------------------------------------------');

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 All test suites passed successfully!');
}
