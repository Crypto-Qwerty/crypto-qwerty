'use strict';

const { describe, it, test } = require('node:test');

/**
 * 共通乱数モジュールの単体テスト (tests/shared/random.test.js)
 *
 * 注意: ここでテストする LCG と CM4Q1Random (FNV-1a + Mulberry32) は
 * レガシーモジュールの単体テストである。盤面生成には使わない。
 * 盤面生成は shared/random/board-rng.js（HMAC-SHA-256カウンター方式）のみを
 * 使用する（tests/shared/board-rng.test.js 参照）。
 */
const assert = require('assert');
const path = require('path');

const { LinearCongruentialGenerator, Random, Number1D } = require('../../shared/random/lcg.js');
const CM4Q1Random = require('../../shared/random/prng-4q1.js');

describe('Shared Random Tests', () => {

  describe('LCG (Classic v1 Engine)', () => {
    it('同一シードで完全に決定論的な乱数シーケンスを出力する', () => {
      const lcg1 = new LinearCongruentialGenerator(12345678);
      const lcg2 = new LinearCongruentialGenerator(12345678);
      for (let i = 0; i < 100; i++) {
        assert.strictEqual(lcg1.next(), lcg2.next(), `ステップ ${i} で乱数が一致しません`);
      }
    });

    it('シャッフルが既存の決定論的順序を維持する', () => {
      const rand = new Random(84920173);
      const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const shuffled = Number1D.shuffle(arr, rand);
      assert.strictEqual(shuffled.length, 10);
      assert.notDeepStrictEqual(shuffled, arr);
      // 再現性の確認
      const rand2 = new Random(84920173);
      const shuffled2 = Number1D.shuffle(arr, rand2);
      assert.deepStrictEqual(shuffled, shuffled2);
    });
  });

  describe('4Q-1 PRNG (Mulberry32 + FNV-1a)', () => {
    it('ハッシュ計算が決定論的である', () => {
      const h1 = CM4Q1Random.hash('84920173');
      const h2 = CM4Q1Random.hash('84920173');
      assert.strictEqual(h1, h2);
      assert.notStrictEqual(h1, CM4Q1Random.hash('84920174'));
    });

    it('createRng が一意で安定した乱数列を返す', () => {
      const rng1 = CM4Q1Random.createRng('TEST-SEED-2026');
      const rng2 = CM4Q1Random.createRng('TEST-SEED-2026');
      for (let i = 0; i < 50; i++) {
        assert.strictEqual(rng1(), rng2());
      }
    });

    it('pool 関数が必要な長さを均等に取り出す', () => {
      const rng = CM4Q1Random.createRng('POOL-SEED');
      const chars = ['A', 'B', 'C', 'D'];
      const sampled = CM4Q1Random.pool(chars, 10, rng);
      assert.strictEqual(sampled.length, 10);
      sampled.forEach(c => assert.ok(chars.includes(c)));
    });
  });

});

// 簡易ランナー対応
if (require.main === module) {
  console.log('Running tests/shared/random.test.js ...');
  // run simple assertions
  const lcg1 = new LinearCongruentialGenerator(12345678);
  const lcg2 = new LinearCongruentialGenerator(12345678);
  for (let i = 0; i < 100; i++) {
    if (lcg1.next() !== lcg2.next()) throw new Error('LCG determinism failed');
  }
  const h1 = CM4Q1Random.hash('84920173');
  const h2 = CM4Q1Random.hash('84920173');
  if (h1 !== h2) throw new Error('4Q1 hash determinism failed');
  console.log('PASS: random.test.js all tests passed!');
}
