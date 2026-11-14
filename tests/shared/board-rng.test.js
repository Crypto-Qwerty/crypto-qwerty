'use strict';

const { describe, it, test } = require('node:test');

/**
 * Board V3 乱数エンジン（HMAC-SHA-256カウンター方式）テスト
 * (tests/shared/board-rng.test.js)
 *
 * 仕様: docs/board-rng-v3.md
 * - 鍵: シード文字列（trim済み、NFC）のUTF-8バイト列
 * - メッセージ: ASCII("CM-BOARD-V3") || 0x00 || カウンター(4バイト・ビッグエンディアン)
 * - ブロック: HMAC-SHA-256(鍵, メッセージ) の32バイト出力
 * - 範囲変換: 棄却サンプリング、シャッフル: 後方 Fisher-Yates
 * - HMAC失敗時は例外で停止し、弱い乱数方式へフォールバックしない
 * - シードは文字列のまま扱い、先頭ゼロを保持する（"007" と "7" は別シード）
 *
 * 注意: 統計検定のPASSは暗号学的安全性の証明ではない。決定論性・仕様適合・
 * 偏り対策の検証として実施する。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const CMBoardRng = require('../../shared/random/board-rng.js');
const CM4Q1Board = require('../../profiles/qwerty/board.js');
const CMSeedKey = require('../../shared/validation/seed-key.js');

// 新ゴールデンベクター（V3。変更前の値は docs/board-rng-v3.md に記録）。
const GOLDEN_SEED = '84920173';
const GOLDEN_BOARD_0 = { key: '1', tl: 'D', tr: 'Q', bl: 'I', br: '8' };
const GOLDEN_BOARD_1 = { key: '2', tl: 's', tr: '9', bl: '1', br: '9' };
// 変更前の盤面（v1経路。混在防止テスト用）: board[0] は tl 'l', tr '7', bl 'p', br '8'。
const OLD_BOARD_0 = { key: '1', tl: 'l', tr: '7', bl: 'p', br: '8' };

function chiSquare(observed, expected) {
  let chi = 0;
  for (let i = 0; i < observed.length; i++) {
    const d = observed[i] - expected;
    chi += (d * d) / expected;
  }
  return chi;
}

describe('Board V3 RNG (HMAC-SHA-256 counter mode)', () => {

  it('同じシードから常に同じ乱数列が生成される', () => {
    const a = CMBoardRng.createRandom('84920173');
    const b = CMBoardRng.createRandom('84920173');
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(a.nextUint32(), b.nextUint32());
      assert.strictEqual(a.nextInt(36), b.nextInt(36));
    }
  });

  it('同じシードから常に同じ盤面が生成される', () => {
    const b1 = CM4Q1Board.generate(GOLDEN_SEED);
    const b2 = CM4Q1Board.generate(GOLDEN_SEED);
    assert.strictEqual(b1.length, 36);
    for (let i = 0; i < 36; i++) {
      assert.strictEqual(b1[i].full1, b2[i].full1);
      assert.strictEqual(b1[i].full2, b2[i].full2);
      assert.strictEqual(b1[i].alnum, b2[i].alnum);
      assert.strictEqual(b1[i].pin, b2[i].pin);
    }
  });

  it('数字シードと英大小数字シードの両方が正常に動作する', () => {
    for (const seed of ['84920173', '007', 'Ab3dEf7hJk2m', 'k7R2mQ9xW4pL', 'MySeed2026']) {
      const board = CM4Q1Board.generate(seed);
      assert.strictEqual(board.length, 36);
      for (const item of board) {
        assert.ok(/^[A-Za-z0-9!#$%&@]$/.test(item.full1), `FULL-1不正: ${item.full1}`);
        assert.ok(/^[A-Za-z0-9!#$%&@]$/.test(item.full2), `FULL-2不正: ${item.full2}`);
        assert.ok(/^[A-Za-z0-9]$/.test(item.alnum), `ALNUM不正: ${item.alnum}`);
        assert.ok(/^[0-9]$/.test(item.pin), `PIN不正: ${item.pin}`);
      }
    }
  });

  it('007 と 7 が異なる盤面になる', () => {
    const b007 = CM4Q1Board.generate('007');
    const b7 = CM4Q1Board.generate('7');
    let diff = false;
    for (let i = 0; i < 36; i++) {
      if (b007[i].full1 !== b7[i].full1 || b007[i].pin !== b7[i].pin) { diff = true; break; }
    }
    assert.ok(diff, '007 と 7 の盤面が同一です');
    assert.strictEqual(b007[0].tl, '3');
    assert.strictEqual(b7[0].tl, '9');
  });

  it('先頭ゼロが trim・生成・盤面生成を通じて維持される', () => {
    // trimSeed は先頭ゼロを削らない
    assert.strictEqual(CMSeedKey.trimSeed('007'), '007');
    assert.strictEqual(CMSeedKey.trimSeed('  007  '), '007');
    // 数字シード自動生成は先頭ゼロを文字として出しうる（CSPRNGを固定して検証）
    const origGetRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    try {
      globalThis.crypto.getRandomValues = (buf) => { buf.fill(0); return buf; };
      const seed = CMSeedKey.generateNumericSeed();
      assert.strictEqual(seed, '000000000000');
      assert.strictEqual(CMSeedKey.classify(seed), 'v1');
      // 先頭ゼロ付きシードは復元後も同じ盤面になる（保存・復元 = 文字列の往復）
      const before = CM4Q1Board.generate(seed);
      const restored = CM4Q1Board.generate(CMSeedKey.trimSeed(seed));
      assert.deepStrictEqual(restored, before);
    } finally {
      globalThis.crypto.getRandomValues = origGetRandomValues;
    }
    // 盤面生成は canonicalSeedKey（数値解釈）を使わない。数値化パスを
    // 潰しても盤面は変わらない。
    const b1 = CM4Q1Board.generate('007');
    assert.strictEqual(b1[0].tl, '3');
  });

  it('HMAC処理失敗時に例外で停止し、弱い乱数へフォールバックしない', () => {
    // HMACライブラリが存在しない
    assert.throws(
      () => CMBoardRng.createRandom('x', { hmacLib: {} }).nextInt(10),
      /HMAC-SHA-256 library is not loaded/
    );
    // HMAC自体が例外を送出する
    // （本物の js-sha256 と同じ形: hmac は関数で .array を持つ）
    const throwingHmac = () => { throw new Error('HMAC unavailable'); };
    throwingHmac.array = () => { throw new Error('HMAC unavailable'); };
    const throwingLib = { hmac: throwingHmac };
    assert.throws(
      () => CMBoardRng.createRandom('x', { hmacLib: throwingLib }).nextInt(10),
      /HMAC unavailable/
    );
    // 出力が32バイトでない
    const shortHmac = () => [0, 1, 2];
    shortHmac.array = () => [0, 1, 2];
    const shortLib = { hmac: shortHmac };
    assert.throws(
      () => CMBoardRng.createRandom('x', { hmacLib: shortLib }).nextInt(10),
      /HMAC-SHA-256 failed/
    );
    // 失敗時に盤面が静かに生成されることはない
    assert.throws(() => {
      const rng = CMBoardRng.createRandom('x', { hmacLib: throwingLib });
      rng.shuffle(['a', 'b', 'c']);
    });
  });

  it('棄却サンプリングが境界値を正しく捨てる', () => {
    // nextInt(10) の limit は 4294967290。0xFFFFFFFF は棄却され、
    // 次のワード 0 が採用されること。
    const blocks = [
      new Array(32).fill(0xff), // ワードはすべて 0xFFFFFFFF（棄却）
      new Array(32).fill(0x00)  // ワードはすべて 0（採用）
    ];
    let callCount = 0;
    const stubHmac = () => blocks[Math.min(callCount, blocks.length - 1)].slice();
    stubHmac.array = () => {
      const block = blocks[Math.min(callCount, blocks.length - 1)];
      callCount += 1;
      return block.slice();
    };
    const stubLib = { hmac: stubHmac };
    const rng = CMBoardRng.createRandom('x', { hmacLib: stubLib });
    assert.strictEqual(rng.nextInt(10), 0);
    assert.strictEqual(callCount, 2, '棄却されたブロックと採用されたブロックの2回分が必要');
  });

  it('nextInt(n) は 2^32 までを許可し、それを超える値は即座に例外になる', () => {
    // 32bitワードを使うため n > 2^32 では limit が 0 になり、すべての
    // ワードが棄却され続ける。範囲チェックを呼び出しの先頭で行い、
    // HMACを呼ぶ前に例外にすることで無限ループを防ぐ。
    const rng = CMBoardRng.createRandom('boundary');
    // n = 2^32 は許可され、[0, 2^32) の32bit値を返す。
    const v = rng.nextInt(0x100000000);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 0x100000000, `v=${v}`);
    // n > 2^32 は即座に例外になる。HMACが呼ばれていないことも確認する。
    const throwingHmac = () => { throw new Error('HMAC must not be called'); };
    throwingHmac.array = () => { throw new Error('HMAC must not be called'); };
    const stubRng = CMBoardRng.createRandom('boundary', { hmacLib: { hmac: throwingHmac } });
    assert.throws(() => stubRng.nextInt(0x100000001), /CMBoardRng: invalid range/);
    assert.throws(() => stubRng.nextInt(0x200000000), /CMBoardRng: invalid range/);
    // 従来の範囲チェックも維持される。
    assert.throws(() => rng.nextInt(0), /CMBoardRng: invalid range/);
    assert.throws(() => rng.nextInt(-1), /CMBoardRng: invalid range/);
    assert.throws(() => rng.nextInt(1.5), /CMBoardRng: invalid range/);
  });

  it('nextInt の出力が一様である（カイ二乗検定）', () => {
    // 決定論的な乱数列なので検定結果も決定論的である。
    // 自由度9、p=0.001 の臨界値は 27.877。
    const rng = CMBoardRng.createRandom('chi-square-seed');
    const counts = new Array(10).fill(0);
    const N = 100000;
    for (let i = 0; i < N; i++) counts[rng.nextInt(10)] += 1;
    const chi = chiSquare(counts, N / 10);
    assert.ok(chi < 27.877, `nextInt(10) のカイ二乗値が大きすぎます: ${chi}`);
    const rng36 = CMBoardRng.createRandom('chi-square-seed-36');
    const counts36 = new Array(36).fill(0);
    for (let i = 0; i < N; i++) counts36[rng36.nextInt(36)] += 1;
    // 自由度35、p=0.001 の臨界値は約 66.62。
    const chi36 = chiSquare(counts36, N / 36);
    assert.ok(chi36 < 66.62, `nextInt(36) のカイ二乗値が大きすぎます: ${chi36}`);
  });

  it('盤面の文字種保証と文字数が維持される', () => {
    const board = CM4Q1Board.generate(GOLDEN_SEED);
    const count = (arr, re) => arr.filter(c => re.test(c)).length;
    const full1 = board.map(item => item.full1);
    const full2 = board.map(item => item.full2);
    const alnum = board.map(item => item.alnum);
    const pin = board.map(item => item.pin);
    for (const slot of [full1, full2]) {
      assert.strictEqual(slot.length, 36);
      assert.strictEqual(count(slot, /[!#$%&@]/), 6, '記号は6種1つずつ');
      assert.strictEqual(count(slot, /[A-Z]/), 10, '大文字は10個');
      assert.strictEqual(count(slot, /[a-z]/), 10, '小文字は10個');
      assert.strictEqual(count(slot, /[0-9]/), 10, '数字は10個');
    }
    assert.strictEqual(count(alnum, /[A-Z]/), 13, 'ALNUM大文字は13個');
    assert.strictEqual(count(alnum, /[a-z]/), 13, 'ALNUM小文字は13個');
    assert.strictEqual(count(alnum, /[0-9]/), 10, 'ALNUM数字は10個');
    assert.strictEqual(pin.length, 36);
    for (let d = 0; d <= 9; d++) {
      const c = count(pin, new RegExp(`^${d}$`));
      assert.ok(c === 3 || c === 4, `PINの数字 ${d} の出現回数が ${c} 回（3回または4回のはず）`);
    }
  });

  it('カウンターが異なれば乱数列が異なる', () => {
    const a = CMBoardRng.createRandom('seed', { counterStart: 0 });
    const b = CMBoardRng.createRandom('seed', { counterStart: 1 });
    let diff = false;
    for (let i = 0; i < 8; i++) {
      if (a.nextUint32() !== b.nextUint32()) { diff = true; break; }
    }
    assert.ok(diff, 'カウンターが違っても乱数列が同一です');
    assert.throws(
      () => CMBoardRng.createRandom('seed', { counterStart: -1 }),
      /invalid counterStart/
    );
    assert.throws(
      () => CMBoardRng.createRandom('seed', { counterStart: 0x100000000 }),
      /invalid counterStart/
    );
  });

  it('カウンターのオーバーフローで例外で停止する', () => {
    const rng = CMBoardRng.createRandom('seed', { counterStart: 0xFFFFFFFF });
    // 1ブロック = 8ワード。8回までは成功し、9回目でオーバーフローする。
    for (let i = 0; i < 8; i++) rng.nextUint32();
    assert.throws(() => rng.nextUint32(), /counter overflow/);
  });

  it('メッセージの構成が仕様通りである（ドメイン・区切り・カウンターのビッグエンディアン）', () => {
    const captured = [];
    const stubHmac = () => new Array(32).fill(0);
    stubHmac.array = (key, msg) => {
      captured.push({ key: Array.from(key), msg: Array.from(msg) });
      return new Array(32).fill(0);
    };
    const stubLib = { hmac: stubHmac };
    const rng = CMBoardRng.createRandom('007', { hmacLib: stubLib });
    for (let i = 0; i < 8; i++) rng.nextUint32(); // ブロック0を使い切る
    rng.nextUint32(); // ブロック1を要求する
    assert.strictEqual(captured.length, 2);
    // 鍵 = UTF-8("007")
    assert.deepStrictEqual(captured[0].key, [0x30, 0x30, 0x37]);
    // メッセージ = ASCII("CM-BOARD-V3") || 0x00 || カウンター(4バイトBE)
    // ドメインは11文字なので、区切りは index 11、カウンターは index 12..15。
    // メッセージ全体は 11 + 1 + 4 = 16バイト。
    const domainBytes = Array.from('CM-BOARD-V3').map(c => c.charCodeAt(0));
    assert.strictEqual(domainBytes.length, 11);
    assert.deepStrictEqual(captured[0].msg.slice(0, 11), domainBytes);
    assert.strictEqual(captured[0].msg[11], 0);
    assert.deepStrictEqual(captured[0].msg.slice(12), [0, 0, 0, 0]);
    assert.deepStrictEqual(captured[1].msg.slice(12), [0, 0, 0, 1]);
    assert.strictEqual(captured[0].msg.length, 16);
  });

  it('HMAC-SHA-256が既知のテストベクターと一致する（RFC 4231）', () => {
    // 統計検定は暗号学的安全性の証明ではないため、既知のテストベクターで
    // HMACの実装そのものを照合する。参照実装には Node.js の HMAC（OpenSSL）を使う。
    const nodeCrypto = require('crypto');
    // RFC 4231 Test Case 1: key = 0x0b * 20, data = "Hi There"
    const tc1 = nodeCrypto.createHmac('sha256', Buffer.alloc(20, 0x0b)).update('Hi There').digest('hex');
    assert.strictEqual(tc1, 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    // RFC 4231 Test Case 2: key = "Jefe", data = "what do ya want for nothing?"
    const tc2 = nodeCrypto.createHmac('sha256', 'Jefe').update('what do ya want for nothing?').digest('hex');
    assert.strictEqual(tc2, '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    // vendored js-sha256 も同じ結果を出すこと
    const vendor = require('../../shared/vendor/js-sha256.js').sha256;
    assert.strictEqual(
      vendor.hmac(Buffer.alloc(20, 0x0b), 'Hi There'),
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7'
    );
    // モジュールの最初のブロックが、独立したHMAC計算と一致すること。
    // 鍵 = UTF-8("007")、メッセージ = "CM-BOARD-V3" || 0x00 || カウンター0。
    const key = Buffer.from('007', 'utf8');
    const msg = Buffer.concat([
      Buffer.from('CM-BOARD-V3', 'ascii'),
      Buffer.from([0]),
      Buffer.from([0, 0, 0, 0])
    ]);
    const expected = nodeCrypto.createHmac('sha256', key).update(msg).digest();
    const rng = CMBoardRng.createRandom('007');
    const words = [];
    for (let i = 0; i < 8; i++) words.push(rng.nextUint32());
    const actual = Buffer.alloc(32);
    words.forEach((w, i) => actual.writeUInt32BE(w, i * 4));
    assert.deepStrictEqual(actual, expected);
  });

  it('新旧の乱数エンジンが意図せず混在しない', () => {
    // board.js のソースに旧エンジンへの参照が残っていないこと
    const boardSrc = fs.readFileSync(
      path.join(__dirname, '../../profiles/qwerty/board.js'), 'utf8'
    );
    for (const token of ['CM4Q1Random', 'CMBoardV2', 'prng-4q1', 'board-v2-rng', 'canonicalSeedKey', 'isV2Seed']) {
      assert.ok(!boardSrc.includes(token), `board.js に旧エンジン参照が残っています: ${token}`);
    }
    // 新しい盤面が変更前の盤面と異なること（旧エンジンが使われていない証拠）
    const board = CM4Q1Board.generate(GOLDEN_SEED);
    assert.notStrictEqual(board[0].tl, OLD_BOARD_0.tl);
    assert.notStrictEqual(board[0].tr, OLD_BOARD_0.tr);
    assert.notStrictEqual(board[0].bl, OLD_BOARD_0.bl);
    assert.strictEqual(board[0].key, OLD_BOARD_0.key);
  });

  it('新ゴールデンベクター（シード84920173）が一致する', () => {
    const board = CM4Q1Board.generate(GOLDEN_SEED);
    assert.strictEqual(board[0].key, GOLDEN_BOARD_0.key);
    assert.strictEqual(board[0].tl, GOLDEN_BOARD_0.tl);
    assert.strictEqual(board[0].tr, GOLDEN_BOARD_0.tr);
    assert.strictEqual(board[0].bl, GOLDEN_BOARD_0.bl);
    assert.strictEqual(board[0].br, GOLDEN_BOARD_0.br);
    assert.strictEqual(board[1].key, GOLDEN_BOARD_1.key);
    assert.strictEqual(board[1].tl, GOLDEN_BOARD_1.tl);
    assert.strictEqual(board[1].tr, GOLDEN_BOARD_1.tr);
    assert.strictEqual(board[1].bl, GOLDEN_BOARD_1.bl);
    assert.strictEqual(board[1].br, GOLDEN_BOARD_1.br);
  });

});

if (require.main === module) {
  console.log('Running tests/shared/board-rng.test.js ...');
  const board = CM4Q1Board.generate(GOLDEN_SEED);
  assert.strictEqual(board[0].tl, GOLDEN_BOARD_0.tl);
  assert.strictEqual(board[0].tr, GOLDEN_BOARD_0.tr);
  assert.notStrictEqual(board[0].tl, OLD_BOARD_0.tl);
  const b007 = CM4Q1Board.generate('007');
  const b7 = CM4Q1Board.generate('7');
  assert.notDeepStrictEqual(b007, b7);
  const rng = CMBoardRng.createRandom('seed', { counterStart: 0xFFFFFFFF });
  for (let i = 0; i < 8; i++) rng.nextUint32();
  assert.throws(() => rng.nextUint32(), /counter overflow/);
  console.log('PASS: board-rng.test.js all tests passed!');
}
