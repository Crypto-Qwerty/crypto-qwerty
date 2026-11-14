'use strict';

/**
 * 4Q-1 盤面決定論性＆データ構造テスト (tests/4q1/board-determinism.test.js)
 */
const assert = require('assert');
const CM4Q1Board = require('../../profiles/4q1/board.js');

describe('4Q-1 Board Determinism & Structure Tests', () => {

  it('36個のキーが正確に QWERTY 順で定義されている', () => {
    assert.strictEqual(CM4Q1Board.KEY_COUNT, 36);
    assert.strictEqual(CM4Q1Board.ROWS.length, 4);
    assert.strictEqual(CM4Q1Board.ROWS[0].length, 10); // 1..0
    assert.strictEqual(CM4Q1Board.ROWS[1].length, 10); // Q..P
    assert.strictEqual(CM4Q1Board.ROWS[2].length, 9);  // A..L
    assert.strictEqual(CM4Q1Board.ROWS[3].length, 7);  // Z..M
    assert.strictEqual(CM4Q1Board.KEYS[0], '1');
    assert.strictEqual(CM4Q1Board.KEYS[10], 'Q');
    assert.strictEqual(CM4Q1Board.KEYS[20], 'A');
    assert.strictEqual(CM4Q1Board.KEYS[29], 'Z');
  });

  it('同一シードで完全に同一の盤面が再現される', () => {
    const b1 = CM4Q1Board.generate('84920173');
    const b2 = CM4Q1Board.generate('84920173');
    assert.strictEqual(b1.length, 36);
    assert.strictEqual(b2.length, 36);

    for (let i = 0; i < 36; i++) {
      assert.strictEqual(b1[i].key, b2[i].key);
      assert.strictEqual(b1[i].full1, b2[i].full1);
      assert.strictEqual(b1[i].full2, b2[i].full2);
      assert.strictEqual(b1[i].alnum, b2[i].alnum);
      assert.strictEqual(b1[i].pin, b2[i].pin);
    }
  });

  it('異なるシードでは盤面が異なる', () => {
    const b1 = CM4Q1Board.generate('84920173');
    const b2 = CM4Q1Board.generate('99999999');
    let diff = false;
    for (let i = 0; i < 36; i++) {
      if (b1[i].full1 !== b2[i].full1 || b1[i].pin !== b2[i].pin) {
        diff = true;
        break;
      }
    }
    assert.ok(diff, '異なるシードで盤面が変化していません');
  });

});

if (require.main === module) {
  console.log('Running tests/4q1/board-determinism.test.js ...');
  const b1 = CM4Q1Board.generate('84920173');
  const b2 = CM4Q1Board.generate('84920173');
  assert.strictEqual(b1.length, 36);
  for (let i = 0; i < 36; i++) {
    if (b1[i].full1 !== b2[i].full1) throw new Error('Determinism failed');
  }
  console.log('PASS: board-determinism.test.js all tests passed!');
}
