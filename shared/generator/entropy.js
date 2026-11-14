'use strict';

/**
 * パスワードエントロピー・強度計算モジュール
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.estimatePasswordEntropy = factory().estimatePasswordEntropy;
    root.estimateSeedEntropy = factory().estimateSeedEntropy;
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

  /**
   * シードのエントロピー上限を推定する。
   *
   * 盤面はシードの決定論的な関数であるため、生成パスワードの実効的な
   * 強さはシードのエントロピーを超えない。ここで返すビット数は上限値で
   * あり、シードが文字種から一様ランダムに選ばれた場合の最大値である。
   * 実際にはユーザーが選んだシード（誕生日や連番など）のエントロピーは
   * これより小さい。
   *
   * kind: 'numeric'（数字のみ）/ 'alphanumeric'（英大小数字）/ 'other'（記号入り等）
   * 標準シード（12文字・62種）は約71.45bit、数字シード（12桁）は約39.86bit。
   */
  function estimateSeedEntropy(seedText) {
    const chars = Array.from(String(seedText ?? '').trim());
    if (!chars.length) return { bits: 0, pool: 0, length: 0, kind: 'other' };
    let pool = 0;
    let kind = 'other';
    const hasDigit = chars.some(c => /[0-9]/.test(c));
    const hasLower = chars.some(c => /[a-z]/.test(c));
    const hasUpper = chars.some(c => /[A-Z]/.test(c));
    const hasSymbol = chars.some(c => /[^A-Za-z0-9\s]/.test(c));
    if (hasDigit) pool += 10;
    if (hasLower) pool += 26;
    if (hasUpper) pool += 26;
    if (hasSymbol) pool += 32;
    if (!pool) pool = 32;
    if (hasDigit && !hasLower && !hasUpper && !hasSymbol) kind = 'numeric';
    else if (!hasSymbol) kind = 'alphanumeric';
    const bits = Math.round(chars.length * Math.log2(pool) * 10) / 10;
    return { bits, pool, length: chars.length, kind };
  }

  return { estimatePasswordEntropy, estimateSeedEntropy };
});
