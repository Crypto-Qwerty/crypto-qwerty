'use strict';

/**
 * 4Q-1 レシピ評価テスト (tests/4q1/recipe-generation.test.js)
 */
const assert = require('assert');
const CM4Q1Board = require('../../profiles/4q1/board.js');
const CM4Q1Recipes = require('../../profiles/4q1/recipes.js');
const CM4Q1Profile = require('../../profiles/4q1/profile.js');

describe('4Q-1 Recipe Generation Tests', () => {

  const SEED = '84920173';
  const board = CM4Q1Board.generate(SEED);

  it('かんたんモード (lenMode=5: 記号あり) で指定長のパスワードが生成される', () => {
    const res = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 5, lenVal: 16, symMode: 0 }, board);
    assert.strictEqual(res.password.length, 16);
    assert.strictEqual(res.steps.length, 16);
    assert.strictEqual(typeof res.password, 'string');
  });

  it('かんたんモード (lenMode=3: PIN) で指定された桁数の数字のみが生成される', () => {
    const res = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 3, lenVal: 6 }, board);
    assert.strictEqual(res.password.length, 6);
    assert.ok(/^[0-9]+$/.test(res.password), `PINに数字以外が含まれています: ${res.password}`);
  });

  it('かんたんモード (lenMode=4: 記号なし) で記号を含まない英数字パスワードが生成される', () => {
    const res = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 4, lenVal: 16 }, board);
    assert.strictEqual(res.password.length, 16);
    assert.ok(/^[A-Za-z0-9]+$/.test(res.password), `ALNUMに記号が含まれています: ${res.password}`);
  });

  it('マイレシピ詳細 (lenMode=0) で決定論的に生成される', () => {
    const res = CM4Q1Recipes.evaluate('1Password', 'taro', CM4Q1Recipes.defaultConfig, board);
    assert.ok(res.steps.length > 0);
    assert.strictEqual(res.password.length, res.steps.length);
  });

  it('同一設定・シードでパスワード生成結果が完全に決定論的（再現可能）である', () => {
    const r1 = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 5, lenVal: 16, symMode: 0 }, board);
    const r2 = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 5, lenVal: 16, symMode: 0 }, board);
    assert.strictEqual(r1.password, r2.password);
  });

});

if (require.main === module) {
  console.log('Running tests/4q1/recipe-generation.test.js ...');
  const SEED = '84920173';
  const board = CM4Q1Board.generate(SEED);
  const rNormal = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 5, lenVal: 16, symMode: 0 }, board);
  console.log(`  PASS normal password: "${rNormal.password}"`);
  const rPin = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 3, lenVal: 6 }, board);
  console.log(`  PASS pin: "${rPin.password}"`);
  if (!/^[0-9]+$/.test(rPin.password)) throw new Error('PIN test failed');
  const rAlnum = CM4Q1Recipes.evaluate('AMAZON', 'K7', { lenMode: 4, lenVal: 16 }, board);
  console.log(`  PASS alnum: "${rAlnum.password}"`);
  if (!/^[A-Za-z0-9]+$/.test(rAlnum.password)) throw new Error('ALNUM test failed');
  console.log('PASS: recipe-generation.test.js all tests passed!');
}
