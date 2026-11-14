'use strict';

/**
 * 4Q-1 Safe Symbols & 文字種検証テスト (tests/4q1/safe-symbols.test.js)
 */
const assert = require('assert');
const CM4Q1Board = require('../../profiles/4q1/board.js');

describe('4Q-1 Safe Symbols & Character Set Tests', () => {

  const EXPECTED_SAFE_SYMBOLS = ['!', '#', '$', '%', '&', '@'];

  it('Safe Symbols が厳密に ! # $ % & @ の6種のみである', () => {
    assert.deepStrictEqual(CM4Q1Board.SAFE_SYMBOLS, EXPECTED_SAFE_SYMBOLS);
  });

  it('右下 (PIN) スロットは 0-9 の数字のみで構成される', () => {
    // 複数のシードで検証
    const testSeeds = ['84920173', '12345678', 'SEED-TEST-01', 'ALICE', 'BOB'];
    for (const seed of testSeeds) {
      const board = CM4Q1Board.generate(seed);
      for (const item of board) {
        assert.ok(
          /^[0-9]$/.test(item.pin),
          `PINスロットに数字以外の文字が含まれています: "${item.pin}" (seed: ${seed})`
        );
      }
    }
  });

  it('左下 (ALNUM) スロットは英大小数字のみで記号を含まない', () => {
    const testSeeds = ['84920173', '12345678', 'SEED-TEST-01', 'ALICE', 'BOB'];
    for (const seed of testSeeds) {
      const board = CM4Q1Board.generate(seed);
      for (const item of board) {
        assert.ok(
          /^[A-Za-z0-9]$/.test(item.alnum),
          `ALNUMスロットに英数字以外の文字が含まれています: "${item.alnum}" (seed: ${seed})`
        );
      }
    }
  });

  it('左上 (FULL-1) と右上 (FULL-2) の記号は Safe Symbols のみである', () => {
    const testSeeds = ['84920173', '12345678', 'SEED-TEST-01', 'ALICE', 'BOB', '99999999'];
    for (const seed of testSeeds) {
      const board = CM4Q1Board.generate(seed);
      for (const item of board) {
        for (const slot of [item.full1, item.full2]) {
          if (!/^[A-Za-z0-9]$/.test(slot)) {
            // 記号の場合、Safe Symbols のいずれかであること
            assert.ok(
              EXPECTED_SAFE_SYMBOLS.includes(slot),
              `許可されていない記号が含まれています: "${slot}" (seed: ${seed})`
            );
          }
        }
      }
    }
  });

});

if (require.main === module) {
  console.log('Running tests/4q1/safe-symbols.test.js ...');
  const testSeeds = ['84920173', '12345678', 'SEED-TEST-01'];
  for (const seed of testSeeds) {
    const board = CM4Q1Board.generate(seed);
    for (const item of board) {
      if (!/^[0-9]$/.test(item.pin)) throw new Error('PIN invalid: ' + item.pin);
      if (!/^[A-Za-z0-9]$/.test(item.alnum)) throw new Error('ALNUM invalid: ' + item.alnum);
      for (const slot of [item.full1, item.full2]) {
        if (!/^[A-Za-z0-9]$/.test(slot) && !['!', '#', '$', '%', '&', '@'].includes(slot)) {
          throw new Error('Symbol invalid: ' + slot);
        }
      }
    }
  }
  console.log('PASS: safe-symbols.test.js all tests passed!');
}
