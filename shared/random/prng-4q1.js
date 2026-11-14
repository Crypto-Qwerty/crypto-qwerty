'use strict';

/**
 * 4Q-1 盤面用 決定論的PRNG＆シャッフルモジュール
 * cryptomatrix_4q1_layout_comparison.html のアルゴリズムと完全互換。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CM4Q1Random = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // FNV-1a 32bit ハッシュ
  function hash(s) {
    let h = 2166136261 >>> 0;
    const str = String(s != null ? s : '');
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // Mulberry32-variant 決定論的 PRNG ([0, 1) を返す関数)
  function createRng(seed) {
    let a = hash(seed);
    return function next() {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fisher-Yates シャッフル
  function shuffle(array, rngFn) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rngFn() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  // プールから n 個の文字を均等シャッフルで補給しながら取り出す
  function pool(sourceChars, n, rngFn) {
    const src = Array.isArray(sourceChars) ? sourceChars : Array.from(String(sourceChars));
    const result = [];
    while (result.length < n) {
      result.push(...shuffle(src, rngFn));
    }
    return result.slice(0, n);
  }

  return { hash, createRng, shuffle, pool };
});
