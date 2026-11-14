'use strict';

/**
 * パスワードエントロピー・強度計算モジュール
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.estimatePasswordEntropy = factory().estimatePasswordEntropy;
    root.CMEntropy = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function estimatePasswordEntropy(pw) {
    const chars = Array.from(String(pw ?? ''));
    if (!chars.length) return { bits: 0, pool: 0, unique: 0, length: 0 };
    let pool = 0;
    if (chars.some(c => /[0-9]/.test(c))) pool += 10;
    if (chars.some(c => /[a-z]/.test(c))) pool += 26;
    if (chars.some(c => /[A-Z]/.test(c))) pool += 26;
    if (chars.some(c => /[^A-Za-z0-9\s]/.test(c))) pool += 32;
    if (chars.some(c => /\s/.test(c))) pool += 1;
    if (!pool) pool = 32;
    const unique = new Set(chars).size;
    const bits = Math.round(chars.length * Math.log2(pool) * 10) / 10;
    return { bits, pool, unique, length: chars.length };
  }

  return { estimatePasswordEntropy };
});
