'use strict';

/*
 * 盤面生成 第3世代 (Board V3) — HMAC-SHA-256カウンター方式の決定論的乱数エンジン。
 *
 * 仕様 (docs/board-rng-v3.md に全文書。ここは要約):
 * - 対象: すべてのシード（英大小数字・数字のみ・記号入り）。v1/v2の区別はない。
 * - 鍵: シード文字列（trim済み、NFC正規化）のUTF-8バイト列。空文字は "0" とする。
 * - メッセージ: ASCII("CM-BOARD-V3") || 0x00 || カウンター(4バイト・ビッグエンディアン)。
 *   カウンターは 0 から始まり、ブロックごとに +1 する。0xFFFFFFFF を超えたら例外で停止する。
 * - ブロック: HMAC-SHA-256(鍵, メッセージ) の32バイト出力。ブロック同士は独立
 *   （ハッシュ連鎖ではない）。乱数は32bitワード（ビッグエンディアン）を順に消費する。
 * - 範囲変換: 棄却サンプリング（limit = 2^32 - (2^32 % n)）。剰余バイアスを排除する。
 * - シャッフル: 後方 Fisher-Yates（入力配列のコピーに対して行う）。
 * - HMAC/SHA-256が利用できない、または処理に失敗した場合は例外で停止する。
 *   弱い乱数方式（FNV-1a/Mulberry32/LCG/Math.random 等）へのフォールバックはしない。
 * - シードは文字列のまま扱う。数値化や先頭ゼロの削除は一切行わない。
 *   "007" と "7" は別のシードになる。
 * - HMACは vendor/js-sha256.js（emn178 / MIT / v0.11.1）の同期実装を使う。
 *   ブラウザでは window.sha256、Node.jsでは require で読み込む。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CMBoardRng = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DOMAIN = 'CM-BOARD-V3';
  const MAX_COUNTER = 0xFFFFFFFF;

  // HMAC-SHA-256ライブラリを呼び出し時に解決する（読み込み順に依存しないため）。
  // 戻り値は sha256 関数（.hmac.array(key, message) を持つこと）。
  function resolveHmacLib() {
    if (typeof window !== 'undefined' && window.sha256) return window.sha256;
    if (typeof globalThis !== 'undefined' && globalThis.sha256) return globalThis.sha256;
    if (typeof require === 'function') {
      try {
        const vendor = require('../vendor/js-sha256.js');
        if (vendor && vendor.sha256) return vendor.sha256;
        if (vendor && typeof vendor.hmac === 'function') return vendor;
      } catch (e) {
        // 下の例外に集約する（弱い方式へはフォールバックしない）。
      }
    }
    throw new Error('CMBoardRng: HMAC-SHA-256 library is not loaded');
  }

  // 32バイトのHMACブロックを1つ生成する。libの異常はそのまま例外として伝える。
  function hmacBlock(lib, keyBytes, domainBytes, counter) {
    if (!lib || typeof lib.hmac !== 'function' || typeof lib.hmac.array !== 'function') {
      throw new Error('CMBoardRng: HMAC-SHA-256 library is not loaded');
    }
    const msg = new Uint8Array(domainBytes.length + 1 + 4);
    msg.set(domainBytes, 0);
    msg[domainBytes.length] = 0;
    msg[domainBytes.length + 1] = (counter >>> 24) & 0xff;
    msg[domainBytes.length + 2] = (counter >>> 16) & 0xff;
    msg[domainBytes.length + 3] = (counter >>> 8) & 0xff;
    msg[domainBytes.length + 4] = counter & 0xff;
    const out = lib.hmac.array(keyBytes, msg);
    if (!out || out.length !== 32) {
      throw new Error('CMBoardRng: HMAC-SHA-256 failed');
    }
    return new Uint8Array(out);
  }

  // seedText は trim 済みのシード文字列を渡すこと（空文字は "0" にする）。
  // opts: { domain, counterStart, hmacLib }
  //   domain: 用途別ドメイン（既定値 DOMAIN。盤面生成は既定値を使う）。
  //   counterStart: 開始カウンター（既定値 0。診断・テスト用）。
  //   hmacLib: HMACライブラリの差し替え（既定値は自動解決。診断・テスト用）。
  function createRandom(seedText, opts) {
    const options = opts || {};
    const domain = options.domain || DOMAIN;
    const lib = options.hmacLib || null;
    let counter = (options.counterStart === undefined || options.counterStart === null)
      ? 0 : options.counterStart;
    if (!Number.isInteger(counter) || counter < 0 || counter > MAX_COUNTER) {
      throw new Error('CMBoardRng: invalid counterStart');
    }

    const enc = new TextEncoder();
    const domainBytes = enc.encode(domain);
    const seedBytes = enc.encode(String(seedText).normalize('NFC'));

    let hmacLib = lib;
    let block = null;
    let pos = 0;

    function nextBlock() {
      if (counter > MAX_COUNTER) {
        throw new Error('CMBoardRng: counter overflow');
      }
      if (!hmacLib) hmacLib = resolveHmacLib();
      block = hmacBlock(hmacLib, seedBytes, domainBytes, counter);
      counter += 1;
      pos = 0;
    }

    function nextByte() {
      if (block === null || pos >= block.length) nextBlock();
      return block[pos++];
    }

    function nextUint32() {
      return ((nextByte() << 24) | (nextByte() << 16) | (nextByte() << 8) | nextByte()) >>> 0;
    }

    // [0, n) の一様乱数（棄却サンプリングで剰余バイアスを排除）。
    // 32bitワードを使うため n は 2^32 まで。n > 2^32 では limit が 0 になり
    // すべてのワードが棄却され続けるため、即座に例外にする。
    function nextInt(n) {
      if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) throw new Error('CMBoardRng: invalid range');
      const limit = 4294967296 - (4294967296 % n);
      let w = nextUint32();
      while (w >= limit) w = nextUint32();
      return w % n;
    }

    // 後方 Fisher-Yates のコピーシャッフル
    function shuffle(array) {
      const res = array.slice();
      for (let i = res.length - 1; i > 0; i--) {
        const j = nextInt(i + 1);
        const tmp = res[i];
        res[i] = res[j];
        res[j] = tmp;
      }
      return res;
    }

    return { nextUint32, nextInt, shuffle };
  }

  return { createRandom, DOMAIN, MAX_COUNTER };
});
