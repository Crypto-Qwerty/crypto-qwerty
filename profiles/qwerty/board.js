'use strict';

/**
 * 4Q-1 Profile - 盤面定義 (Board)
 * QWERTY 36キー（4段: 10+10+9+7）・中央黒キートップ・4隅モード仕様
 *
 * スロット構成:
 *   tl (左上): FULL-1  (英大小＋数字＋Safe Symbols !#$%&@)
 *   tr (右上): FULL-2  (英大小＋数字＋Safe Symbols !#$%&@)
 *   bl (左下): ALNUM   (英大小＋数字)
 *   br (右下): PIN     (数字のみ 0-9)
 *   center   : 基準キー (QWERTYキートップ 1..0, Q..P, A..L, Z..M)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../shared/random/board-rng.js')
    );
  } else {
    root.CM4Q1Board = factory(
      root.CMBoardRng
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CMBoardRng) {

  const ROWS = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"]
  ];

  const KEYS = ROWS.flat();
  const KEY_COUNT = KEYS.length; // 36

  // Classicと同じ全英数字 ＋ Safe Symbols (!#$%&@)
  const UPPER_POOL = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"); // 26
  const LOWER_POOL = Array.from("abcdefghijklmnopqrstuvwxyz"); // 26
  const NUM_POOL   = Array.from("0123456789");                 // 10
  const SAFE_SYMBOLS = Array.from("!#$%&@");                   // 6

  const FULL_POOL = [].concat(UPPER_POOL, LOWER_POOL, NUM_POOL, SAFE_SYMBOLS);
  const ALNUM_POOL = [].concat(UPPER_POOL, LOWER_POOL, NUM_POOL);

  // 各キーの (row, col) 座標テーブル
  const KEY_COORDS = [];
  ROWS.forEach((row, r) => {
    row.forEach((_, c) => {
      KEY_COORDS.push({ r, c });
    });
  });

  function rowColToIndex(r, c) {
    const rr = ((r % ROWS.length) + ROWS.length) % ROWS.length;
    const rowLen = ROWS[rr].length;
    const cc = ((c % rowLen) + rowLen) % rowLen;
    let offset = 0;
    for (let i = 0; i < rr; i++) offset += ROWS[i].length;
    return offset + cc;
  }

  /**
   * 36スロットに全文字種（記号6種・大文字・小文字・数字）が必ず含まれるように生成
   */
  function buildGuaranteedFullSlots(shuffleFn, nextIntFn) {
    // 1. Safe Symbols 6種は必ず1つずつ入れる（どのシードでも記号不足を防ぐ）
    // 2. 英大文字10個、英小文字10個、数字10個をそれぞれシャッフルして抽出（合計36個）
    const syms = shuffleFn(SAFE_SYMBOLS);
    const ups = shuffleFn(UPPER_POOL).slice(0, 10);
    const lows = shuffleFn(LOWER_POOL).slice(0, 10);
    const nums = shuffleFn(NUM_POOL).slice(0, 10);
    return shuffleFn([].concat(syms, ups, lows, nums));
  }

  function buildGuaranteedAlnumSlots(shuffleFn) {
    // 英大文字13個、英小文字13個、数字10個（合計36個）
    const ups = shuffleFn(UPPER_POOL).slice(0, 13);
    const lows = shuffleFn(LOWER_POOL).slice(0, 13);
    const nums = shuffleFn(NUM_POOL).slice(0, 10);
    return shuffleFn([].concat(ups, lows, nums));
  }

  function buildGuaranteedPinSlots(shuffleFn) {
    // 0-9 を3周(30個) + 6個ランダムシャッフル（合計36個）
    const base = [].concat(NUM_POOL, NUM_POOL, NUM_POOL, shuffleFn(NUM_POOL).slice(0, 6));
    return shuffleFn(base);
  }

  /**
   * シードから盤面データ (36キー分) を生成する
   * すべてのシードで CMBoardRng (HMAC-SHA-256カウンター方式) を使用する。
   * v1/v2の区別はしない。シードは文字列のまま扱い、数値化や先頭ゼロの
   * 削除は一切行わない（"007" と "7" は別のシードになる）。
   * 数値型で渡された場合のみ String(Math.trunc()) で文字列化するが、
   * UIは常に文字列を渡す。数値型に先頭ゼロは存在しないため、この分岐で
   * 先頭ゼロが失われることはない。
   */
  function generate(seedValue) {
    const seedText = (typeof seedValue === 'string') ? seedValue.trim()
      : (typeof seedValue === 'number' && Number.isFinite(seedValue)) ? String(Math.trunc(seedValue)) : '';
    const effectiveSeed = seedText || '0';

    const rngMod = (typeof window !== 'undefined' && window.CMBoardRng) ? window.CMBoardRng : CMBoardRng;
    const rng = rngMod.createRandom(effectiveSeed);
    const shuffleFn = arr => rng.shuffle(arr);

    const full1Chars = buildGuaranteedFullSlots(shuffleFn);
    const full2Chars = buildGuaranteedFullSlots(shuffleFn);
    const alnumChars = buildGuaranteedAlnumSlots(shuffleFn);
    const pinChars   = buildGuaranteedPinSlots(shuffleFn);

    const matrixData = [];
    for (let i = 0; i < KEY_COUNT; i++) {
      matrixData.push({
        index: i,
        key: KEYS[i],
        center: KEYS[i],
        tl: full1Chars[i],
        tr: full2Chars[i],
        bl: alnumChars[i],
        br: pinChars[i],
        full1: full1Chars[i],
        full2: full2Chars[i],
        alnum: alnumChars[i],
        pin: pinChars[i]
      });
    }

    return matrixData;
  }

  function findKeyIndex(ch) {
    if (!ch) return 0;
    const upper = String(ch).toUpperCase();
    const idx = KEYS.indexOf(upper);
    return idx !== -1 ? idx : (String(ch).charCodeAt(0) % KEY_COUNT);
  }

  /**
   * QWERTY 4段盤面上の位置シフト計算（40固定を排除した36キー対応）
   */
  function shiftKeyIndex(baseIdx, dirMode, nVal, mVal, stepIdx) {
    const safeIdx = ((Number(baseIdx) || 0) % KEY_COUNT + KEY_COUNT) % KEY_COUNT;
    const coord = KEY_COORDS[safeIdx] || { r: 0, c: 0 };
    let r = coord.r;
    let c = coord.c;
    const n = Math.max(0, Number(nVal) || 0);
    const m = Math.max(0, Number(mVal) || 0);
    const mode = Number(dirMode) || 0;

    if (mode === 0) return safeIdx;
    // 左右順送り・逆送り（36キー全体の順読みと一致）
    if (mode === 1) return (safeIdx + n) % KEY_COUNT;
    if (mode === 2) return ((safeIdx - n) % KEY_COUNT + KEY_COUNT) % KEY_COUNT;

    const moveRC = (dr, dc) => {
      r = ((r + dr) % ROWS.length + ROWS.length) % ROWS.length;
      const rowLen = ROWS[r].length;
      c = ((c + dc) % rowLen + rowLen) % rowLen;
    };

    switch (mode) {
      case 3: moveRC(n, 0); break;
      case 4: moveRC(-n, 0); break;
      case 5: moveRC(n, n); break;
      case 6: moveRC(n, -n); break;
      case 7: moveRC(-n, n); break;
      case 8: moveRC(-n, -n); break;
      case 9: moveRC(m, n); break;
      case 10: (stepIdx % 2 === 0) ? moveRC(0, n) : moveRC(m, 0); break;
      case 11: (stepIdx % 2 === 0) ? moveRC(0, -n) : moveRC(-m, 0); break;
      case 12: {
        const dirs = [[-n, 0], [0, n], [n, 0], [0, -n]];
        const [dr, dc] = dirs[stepIdx % 4];
        moveRC(dr, dc);
        break;
      }
      case 13: {
        const dirs = [[-n, n], [n, n], [n, -n], [-n, -n]];
        const [dr, dc] = dirs[stepIdx % 4];
        moveRC(dr, dc);
        break;
      }
    }
    return rowColToIndex(r, c);
  }

  return {
    ROWS,
    KEYS,
    KEY_COUNT,
    KEY_COORDS,
    SAFE_SYMBOLS,
    UPPER_POOL,
    LOWER_POOL,
    NUM_POOL,
    FULL_POOL,
    ALNUM_POOL,
    generate,
    findKeyIndex,
    shiftKeyIndex
  };
});
