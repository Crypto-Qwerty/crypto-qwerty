'use strict';

/**
 * エントロピー推定のテスト (tests/shared/entropy.test.js)
 *
 * estimatePasswordEntropy は生成パスワードの文字数・文字種からの理論値で、
 * 各文字が独立一様ランダムであることを仮定している。決定論的な盤面生成
 * には当てはまらないため、実効的な強さの上限として estimateSeedEntropy
 * （シードのエントロピー上限）を併せて表示する。
 * 標準シード（12文字・62種）は約71.45bit、数字シード（12桁）は約39.86bit。
 */
const assert = require('assert');
const CMEntropy = require('../../shared/generator/entropy.js');

describe('Shared Entropy Tests', () => {

  it('数字シード12桁のエントロピー上限は約39.86bitである', () => {
    const ent = CMEntropy.estimateSeedEntropy('84920173'.padStart(12, '0'));
    assert.strictEqual(ent.pool, 10);
    assert.strictEqual(ent.length, 12);
    assert.strictEqual(ent.kind, 'numeric');
    assert.ok(Math.abs(ent.bits - 39.86) < 0.1, `bits=${ent.bits}`);
  });

  it('標準シード12文字のエントロピー上限は約71.45bitである', () => {
    const ent = CMEntropy.estimateSeedEntropy('Ab3dEf7hJk2m');
    assert.strictEqual(ent.pool, 62);
    assert.strictEqual(ent.length, 12);
    assert.strictEqual(ent.kind, 'alphanumeric');
    assert.ok(Math.abs(ent.bits - 71.45) < 0.1, `bits=${ent.bits}`);
  });

  it('先頭ゼロ付き数字シードも同じエントロピー上限になる', () => {
    const a = CMEntropy.estimateSeedEntropy('007');
    const b = CMEntropy.estimateSeedEntropy('700');
    assert.strictEqual(a.bits, b.bits);
    assert.strictEqual(a.kind, 'numeric');
  });

  it('空のシードは0bitである', () => {
    const ent = CMEntropy.estimateSeedEntropy('');
    assert.strictEqual(ent.bits, 0);
    assert.strictEqual(ent.length, 0);
  });

  it('記号入りシードは other として扱う', () => {
    const ent = CMEntropy.estimateSeedEntropy('MySeed!2026');
    assert.strictEqual(ent.kind, 'other');
    assert.ok(ent.bits > 0);
  });

  it('パスワードの理論値エントロピーは従来通り計算される', () => {
    const ent = CMEntropy.estimatePasswordEntropy('B09oVPC%B0@4Un7@');
    assert.strictEqual(ent.length, 16);
    assert.ok(ent.bits > 0);
  });

});

if (require.main === module) {
  console.log('Running tests/shared/entropy.test.js ...');
  const std = CMEntropy.estimateSeedEntropy('Ab3dEf7hJk2m');
  assert.ok(Math.abs(std.bits - 71.45) < 0.1);
  const num = CMEntropy.estimateSeedEntropy('849201730000'.slice(0, 12));
  assert.ok(Math.abs(num.bits - 39.86) < 0.1);
  console.log('PASS: entropy.test.js all tests passed!');
}
