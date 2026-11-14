'use strict';

/**
 * 共通シード検証モジュールのテスト (tests/shared/seed-key.test.js)
 */
const assert = require('assert');
const CMSeedKey = require('../../shared/validation/seed-key.js');

describe('Shared SeedKey Tests', () => {
  it('数値シードを正しく v1 と判定する', () => {
    assert.strictEqual(CMSeedKey.classify('12345678'), 'v1');
    assert.strictEqual(CMSeedKey.classify('0'), 'v1');
    assert.strictEqual(CMSeedKey.classify('+999'), 'v1');
    assert.strictEqual(CMSeedKey.classify('-123'), 'v1');
    assert.strictEqual(CMSeedKey.isNumericSeed('84920173'), true);
    assert.strictEqual(CMSeedKey.isV2Seed('84920173'), false);
  });

  it('文字列・記号入りシードを正しく v2 と判定する', () => {
    assert.strictEqual(CMSeedKey.classify('alpha-beta'), 'v2');
    assert.strictEqual(CMSeedKey.classify('8492-0173'), 'v2');
    assert.strictEqual(CMSeedKey.classify('secret!@#'), 'v2');
    assert.strictEqual(CMSeedKey.isV2Seed('alpha-beta'), true);
    assert.strictEqual(CMSeedKey.isNumericSeed('alpha-beta'), false);
  });

  it('空文字を empty と判定する', () => {
    assert.strictEqual(CMSeedKey.classify(''), 'empty');
    assert.strictEqual(CMSeedKey.classify('   '), 'empty');
    assert.strictEqual(CMSeedKey.classify(null), 'empty');
  });

  it('generateSeed が 12文字の有効な v2 シードを生成する', () => {
    // Node.js WebCrypto global
    if (!globalThis.crypto) {
      globalThis.crypto = require('crypto').webcrypto;
    }
    const seed = CMSeedKey.generateSeed();
    assert.strictEqual(typeof seed, 'string');
    assert.strictEqual(seed.length, 12);
    assert.strictEqual(CMSeedKey.classify(seed), 'v2');
  });
});

if (require.main === module) {
  if (!globalThis.crypto) {
    globalThis.crypto = require('crypto').webcrypto;
  }
  console.log('Running tests/shared/seed-key.test.js ...');
  assert.strictEqual(CMSeedKey.classify('12345678'), 'v1');
  assert.strictEqual(CMSeedKey.classify('alpha-beta'), 'v2');
  assert.strictEqual(CMSeedKey.classify(''), 'empty');
  const s = CMSeedKey.generateSeed();
  assert.strictEqual(s.length, 12);
  console.log('PASS: seed-key.test.js all tests passed!');
}
