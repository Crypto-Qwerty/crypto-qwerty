'use strict';

/**
 * 4Q-1 Profile - レシピ仕様 (Recipes)
 * 36キー QWERTY 盤面専用の「かんたんモード」＆「マイレシピ詳細」評価ロジック
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./board.js'),
      require('../../shared/generator/entropy.js')
    );
  } else {
    root.CM4Q1Recipes = factory(
      root.CM4Q1Board,
      root.CMEntropy
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CM4Q1Board, CMEntropy) {

  const SPOT_NAMES = {
    tl: '左上(英大小・数字・記号)',
    tr: '右上(英大小・数字・記号)',
    bl: '左下(英大小・数字)',
    br: '右下(数字)',
    center: '中央キー'
  };

  const defaultConfig = {
    kwOrder: 1,
    kwFilter: 0,
    kwNum: 4,
    shiftDir: 0,
    shiftN: 1,
    shiftM: 1,
    baseCorner: 0,
    pickPattern: 0,
    symMode: 0,
    symList: '',
    symFbDir: 0,
    symFbDist: 1,
    symFbCorner: 0,
    preTarget: 0,
    prePattern: 0,
    preOffset: 0,
    sufTarget: 1,
    sufPattern: 0,
    sufOffset: 0,
    ancTile: 0,
    ancMode: 0,
    ancPos: 4,
    postMode: 0,
    lenMode: 0,
    lenVal: 20
  };

  const isCardMode = cfg => [3, 4, 5].includes(Number(cfg.lenMode));

  function canonicalInput(raw) {
    return String(raw ?? '')
      .toUpperCase()
      .split('')
      .filter(c => CM4Q1Board.KEYS.includes(c))
      .join('');
  }

  function isSymbol(ch) {
    return !/^[A-Za-z0-9]$/.test(ch);
  }

  function isSymbolAllowed(ch, symMode, symListStr) {
    if (/^[0-9a-zA-Z]$/.test(ch)) return true;
    const mode = Number(symMode);
    if (mode === 0) return true;
    if (mode === 3) return false;
    const inList = (symListStr || '').includes(ch);
    return mode === 1 ? !inList : inList;
  }

  /**
   * コーナー走査パターン
   * baseCornerMode: 0:左上(FULL-1), 1:右上(FULL-2), 2:左下(ALNUM), 3:右下(PIN), 4..9:回転・交互
   */
  function getCornersSequence(baseCornerMode, pickPattern, stepIdx) {
    const cw = ['tl', 'tr', 'br', 'bl'];
    const ccw = ['tl', 'bl', 'br', 'tr'];
    const mapBase = ['tl', 'tr', 'bl', 'br'];

    let base = 'tl';
    switch (Number(baseCornerMode)) {
      case 0: case 1: case 2: case 3:
        base = mapBase[baseCornerMode]; break;
      case 4: base = cw[stepIdx % 4]; break;
      case 5: base = ccw[stepIdx % 4]; break;
      case 6: base = (stepIdx % 2 === 0) ? 'tl' : 'tr'; break;
      case 7: base = (stepIdx % 2 === 0) ? 'tl' : 'bl'; break;
      case 8: base = (stepIdx % 2 === 0) ? 'bl' : 'br'; break;
      case 9: base = (stepIdx % 2 === 0) ? 'tr' : 'br'; break;
    }

    const cwIdx = cw.indexOf(base);
    const ccwIdx = ccw.indexOf(base);
    const rotCW = count => Array.from({ length: count }, (_, i) => cw[(cwIdx + i) % 4]);
    const rotCCW = count => Array.from({ length: count }, (_, i) => ccw[(ccwIdx + i) % 4]);

    switch (Number(pickPattern)) {
      case 0: return [base];
      case 1: return rotCW(2);
      case 2: return rotCCW(2);
      case 3: return [base, cw[(cwIdx + 2) % 4]];
      case 4: return (base === 'tr' || base === 'br') ? ['tr', 'br'] : ['tl', 'bl'];
      case 5: return (base === 'tr' || base === 'br') ? ['br', 'tr'] : ['bl', 'tl'];
      case 6: return (base === 'tl' || base === 'tr') ? ['tl', 'tr'] : ['bl', 'br'];
      case 7: return (base === 'tl' || base === 'tr') ? ['tr', 'tl'] : ['br', 'bl'];
      case 8: return [base, 'center'];
      case 9: return ['center', base];
      case 10: return rotCW(3);
      case 11: return rotCCW(3);
      case 12: return rotCW(4);
      case 13: return rotCCW(4);
      case 14: return ['tl', 'tr', 'bl', 'br'];
      case 15: return ['tr', 'tl', 'br', 'bl'];
      case 16: return ['bl', 'tl', 'br', 'tr'];
      case 17: return ['tl', 'br', 'tr', 'bl'];
      default: return [base];
    }
  }

  function getSaltCorners(patternId) {
    switch (Number(patternId)) {
      case 0: return ['tl', 'tr', 'br', 'bl'];
      case 1: return ['tl', 'bl', 'br', 'tr'];
      case 2: return ['bl', 'tl', 'tr', 'br'];
      case 3: return ['br', 'tr', 'tl', 'bl'];
      case 4: return ['tl', 'tr', 'bl', 'br'];
      case 5: return ['tl', 'br', 'tr', 'bl'];
      case 6: return ['tl', 'bl'];
      case 7: return ['tr', 'br'];
      case 8: return ['tl', 'tr'];
      case 9: return ['bl', 'br'];
      case 10: return ['tl', 'br'];
      case 11: return ['tr', 'bl'];
      case 12: return ['tl'];
      case 13: return ['br'];
      default: return ['tl', 'tr', 'br', 'bl'];
    }
  }

  function pickSingleCharWithFallback(tileIdx, corner, label, cfg, matrixData) {
    const safeIdx = ((Number(tileIdx) || 0) % CM4Q1Board.KEY_COUNT + CM4Q1Board.KEY_COUNT) % CM4Q1Board.KEY_COUNT;
    const baseTile = matrixData[safeIdx] || matrixData[0];
    const rawChar = baseTile[corner] !== undefined ? baseTile[corner] : baseTile.tl;

    if (isSymbolAllowed(rawChar, cfg.symMode, cfg.symList)) {
      return {
        ch: rawChar,
        tileIdx: safeIdx,
        corner,
        isFallback: false,
        log: `${label}: キー[${baseTile.center}]の${SPOT_NAMES[corner]} ➔ '${rawChar}'`
      };
    }

    const cw = ['tl', 'tr', 'br', 'bl'];
    const ccw = ['tl', 'bl', 'br', 'tr'];
    const fbDir = Number(cfg.symFbDir);
    const fbDist = Math.max(1, Number(cfg.symFbDist) || 1);
    const fbCornerMode = Number(cfg.symFbCorner);

    if (fbDir === 0 || fbDir === 1) {
      const order = fbDir === 0 ? cw : ccw;
      const start = Math.max(0, order.indexOf(corner));
      for (let s = 1; s < 4; s++) {
        const nextC = order[(start + s) % 4];
        const cand = baseTile[nextC];
        if (isSymbolAllowed(cand, cfg.symMode, cfg.symList)) {
          return {
            ch: cand,
            tileIdx: safeIdx,
            corner: nextC,
            isFallback: true,
            log: `${label}: 禁止記号 ➔ 同キー${SPOT_NAMES[nextC]}'${cand}'へ代替`
          };
        }
      }
    } else if (fbDir === 2) {
      // 同じキーの左下 (ALNUM: 英大小・数字) に置き換える
      const cand = baseTile.bl;
      return {
        ch: cand,
        tileIdx: safeIdx,
        corner: 'bl',
        isFallback: true,
        log: `${label}: 禁止記号 ➔ 同キー${SPOT_NAMES.bl}'${cand}'へ代替`
      };
    }

    const dirMap = { 0: 1, 1: 2, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8 };
    const shiftDirCode = dirMap[fbDir] || 1;

    let targetCorner = corner === 'center' ? 'tl' : corner;
    if (fbCornerMode === 1) targetCorner = cw[(cw.indexOf(targetCorner) + 1) % 4];
    else if (fbCornerMode === 2) targetCorner = 'tl';
    else if (fbCornerMode === 3) targetCorner = 'tr';
    else if (fbCornerMode === 4) targetCorner = 'bl';

    for (let hop = 1; hop <= CM4Q1Board.KEY_COUNT; hop++) {
      const dist = hop * fbDist;
      const nextIdx = CM4Q1Board.shiftKeyIndex(safeIdx, shiftDirCode, dist, dist, hop);
      const nextTile = matrixData[nextIdx];
      const cand = nextTile[targetCorner];
      if (isSymbolAllowed(cand, cfg.symMode, cfg.symList)) {
        return {
          ch: cand,
          tileIdx: nextIdx,
          corner: targetCorner,
          isFallback: true,
          log: `${label}: 禁止記号 ➔ ${dist}キー移動しキー[${nextTile.center}]${SPOT_NAMES[targetCorner]}'${cand}'へ代替`
        };
      }
    }

    return {
      ch: baseTile.bl,
      tileIdx: safeIdx,
      corner: 'bl',
      isFallback: true,
      log: `${label}: 禁止記号代替 ➔ キー[${baseTile.center}]${SPOT_NAMES.bl}'${baseTile.bl}'`
    };
  }

  /**
   * 4Q-1「かんたんモード」評価ロジック
   * - lenMode === 3: 暗証番号（右下 PIN）
   * - lenMode === 4: 記号なしパスワード（左下 ALNUM ＋ 末尾3文字保証）
   * - lenMode === 5: 記号ありパスワード（左上 FULL-1 → 右上 FULL-2 の2文字ずつ ＋ 末尾4文字保証）
   */
  function evaluateCardMode(siteRaw, secretRaw, cfg, matrixData) {
    const site = canonicalInput(siteRaw);
    const secret = canonicalInput(secretRaw);
    if (!site || !secret) {
      throw new Error('サイト名・合言葉それぞれにキーボード上（A-Z, 0-9）の文字が必要です。');
    }

    const L = Number(cfg.lenVal);
    const mode = Number(cfg.lenMode);
    const tailLen = mode === 5 ? 4 : mode === 4 ? 3 : 0;
    if (!Number.isInteger(L) || L < tailLen + 1 || L > 128) {
      throw new Error('指定した文字数では本文と末尾を作れません。');
    }

    if (mode === 5) {
      if (![0, 1, 2].includes(Number(cfg.symMode))) {
        throw new Error('記号ありでは「すべて許可」「許可リスト」「除外リスト」のいずれかを選んでください。');
      }
      if (Number(cfg.symMode) === 2 && !cfg.symList) {
        throw new Error('ホワイトリストが空です。許可する記号を入力してください。');
      }
      const usable = matrixData.some(t =>
        (isSymbol(t.tl) && isSymbolAllowed(t.tl, cfg.symMode, cfg.symList)) ||
        (isSymbol(t.tr) && isSymbolAllowed(t.tr, cfg.symMode, cfg.symList))
      );
      if (!usable) {
        throw new Error('指定ルールで使える記号がカード上にありません。許可リスト・除外リストを確認してください。');
      }
    }

    // サイト名と合言葉を1文字ずつ交互に結合（Classicかんたんモード同一）
    let combined = '';
    const maxChars = Math.max(site.length, secret.length);
    for (let i = 0; i < maxChars; i++) {
      if (i < site.length) combined += site[i];
      if (i < secret.length) combined += secret[i];
    }

    const nextIdx = idx => (idx + 1) % CM4Q1Board.KEY_COUNT;
    const makeStep = (idx, corner, label, isFallback = false) => {
      const t = matrixData[idx];
      return {
        ch: t[corner],
        tileIdx: idx,
        corner,
        isFallback,
        log: `${label}: キー[${t.center}]の${SPOT_NAMES[corner]} ➔ '${t[corner]}'`
      };
    };

    const searchNext = (startIdx, corners, testFn, label, includeStart = false) => {
      let idx = startIdx;
      for (let hop = 0; hop < CM4Q1Board.KEY_COUNT; hop++) {
        if (!includeStart || hop > 0) idx = nextIdx(idx);
        for (const c of corners) {
          if (testFn(matrixData[idx][c])) {
            return makeStep(idx, c, `${label}${hop > 0 ? `（${hop}キー先）` : ''}`, hop > 0 || !includeStart);
          }
        }
      }
      throw new Error(`${label}に使える文字が見つかりません。`);
    };

    const bodyLength = L - tailLen;
    const steps = [];
    let cursor = 0;

    if (mode === 3) {
      // 暗証番号（右下: PIN）
      for (let i = 0; i < combined.length && steps.length < bodyLength; i++) {
        const idx = CM4Q1Board.findKeyIndex(combined[i]);
        steps.push(makeStep(idx, 'br', `交互文字'${combined[i]}'`));
        cursor = idx;
      }
      while (steps.length < bodyLength) {
        cursor = nextIdx(cursor);
        steps.push(makeStep(cursor, 'br', '桁数不足の追読'));
      }
    } else if (mode === 4) {
      // 記号なし（左下: ALNUM）
      for (let i = 0; i < combined.length && steps.length < bodyLength; i++) {
        const idx = CM4Q1Board.findKeyIndex(combined[i]);
        steps.push(makeStep(idx, 'bl', `交互文字'${combined[i]}'`));
        cursor = idx;
      }
      while (steps.length < bodyLength) {
        cursor = nextIdx(cursor);
        steps.push(makeStep(cursor, 'bl', '文字数不足の追読'));
      }
    } else {
      // 記号ありパスワード（左上 FULL-1 → 右上 FULL-2 の2文字ずつ）
      const pushPair = (startKeyIdx, labelPrefix) => {
        for (const corner of ['tl', 'tr']) {
          if (steps.length >= bodyLength) break;
          const t = matrixData[startKeyIdx];
          const ch = t[corner];
          if (isSymbolAllowed(ch, cfg.symMode, cfg.symList)) {
            steps.push(makeStep(startKeyIdx, corner, labelPrefix));
            cursor = startKeyIdx;
          } else {
            // 禁止記号なら次のキーへ進み、許可文字が出るまで飛ばす
            const fb = searchNext(startKeyIdx, [corner], c => isSymbolAllowed(c, cfg.symMode, cfg.symList), `${labelPrefix}(禁止記号代替)`, false);
            steps.push(fb);
            cursor = fb.tileIdx;
          }
        }
      };

      for (let i = 0; i < combined.length && steps.length < bodyLength; i++) {
        const idx = CM4Q1Board.findKeyIndex(combined[i]);
        pushPair(idx, `交互文字'${combined[i]}'`);
      }
      while (steps.length < bodyLength) {
        cursor = nextIdx(cursor);
        pushPair(cursor, '文字数不足の追読');
      }
    }

    // 末尾保証（英大・英小・数字・[記号]）
    if (tailLen > 0) {
      const sUpper = searchNext(cursor, ['bl'], c => /[A-Z]/.test(c), '末尾の英大文字', false);
      steps.push(sUpper);
      cursor = sUpper.tileIdx;

      const sLower = searchNext(cursor, ['bl'], c => /[a-z]/.test(c), '末尾の英小文字', false);
      steps.push(sLower);
      cursor = sLower.tileIdx;

      cursor = nextIdx(cursor);
      steps.push(makeStep(cursor, 'br', '末尾の数字'));

      if (mode === 5) {
        const sSym = searchNext(cursor, ['tl', 'tr'], c => isSymbol(c) && isSymbolAllowed(c, cfg.symMode, cfg.symList), '末尾の許可記号', false);
        steps.push(sSym);
      }
    }

    const password = steps.map(s => s.ch).join('');
    const entropyFn = (typeof window !== 'undefined' && window.estimatePasswordEntropy)
      ? window.estimatePasswordEntropy : CMEntropy?.estimatePasswordEntropy;
    const entropy = entropyFn ? entropyFn(password) : null;

    return { password, steps, entropy };
  }

  /**
   * 4Q-1「マイレシピ詳細」評価ロジック (36キー・QWERTY対応)
   */
  function evaluateRecipeMode(siteRaw, secretRaw, cfg, matrixData) {
    const site = (siteRaw || '1Password').trim() || '1';
    const secret = (secretRaw || 'taro').trim() || 't';

    let combined = '';
    switch (Number(cfg.kwOrder)) {
      case 0: combined = site; break;
      case 1: combined = site + secret; break;
      case 2: combined = secret + site; break;
      case 3:
      case 4: {
        const a = Number(cfg.kwOrder) === 3 ? site : secret;
        const b = Number(cfg.kwOrder) === 3 ? secret : site;
        const max = Math.max(a.length, b.length);
        for (let i = 0; i < max; i++) {
          if (i < a.length) combined += a[i];
          if (i < b.length) combined += b[i];
        }
        break;
      }
      case 5: {
        const h = Math.ceil(site.length / 2);
        combined = site.slice(0, h) + secret + site.slice(h);
        break;
      }
      case 6: {
        const h = Math.ceil(secret.length / 2);
        combined = secret.slice(0, h) + site + secret.slice(h);
        break;
      }
      case 7: combined = site.split('').reverse().join('') + secret; break;
      case 8: combined = site + secret.split('').reverse().join(''); break;
      case 9: combined = (site + secret).split('').reverse().join(''); break;
      default: combined = site + secret;
    }

    let kwChars = combined.split('');
    const n = Math.max(1, Number(cfg.kwNum) || 1);
    switch (Number(cfg.kwFilter)) {
      case 1: kwChars = kwChars.slice(0, n); break;
      case 2: kwChars = kwChars.slice(-n); break;
      case 3: kwChars = [...kwChars.slice(0, n), ...kwChars.slice(-n)]; break;
      case 4: kwChars = kwChars.filter((_, i) => i % n === 0); break;
      case 5: kwChars = [...new Set(kwChars)]; break;
      case 6: {
        const noVowel = kwChars.filter(c => !/[aiueoAIUEO]/.test(c));
        if (noVowel.length > 0) kwChars = noVowel;
        break;
      }
    }

    let steps = [];
    const pushTileCorners = (tileIdx, corners, labelPrefix) => {
      corners.forEach((c, idx) => {
        const subLabel = corners.length > 1 ? `${labelPrefix}(${idx + 1}/${corners.length})` : labelPrefix;
        steps.push(pickSingleCharWithFallback(tileIdx, c, subLabel, cfg, matrixData));
      });
    };

    const resolveSaltTiles = (targetMode, offsetVal) => {
      const off = Number(offsetVal) || 0;
      const wrap = idx => ((idx + off) % CM4Q1Board.KEY_COUNT + CM4Q1Board.KEY_COUNT) % CM4Q1Board.KEY_COUNT;
      switch (Number(targetMode)) {
        case 1: return [wrap(CM4Q1Board.findKeyIndex(site[0]))];
        case 2: return [wrap(CM4Q1Board.findKeyIndex(site[site.length - 1]))];
        case 3: return [wrap(CM4Q1Board.findKeyIndex(secret[0]))];
        case 4: return [wrap(CM4Q1Board.findKeyIndex(secret[secret.length - 1]))];
        case 5: return [wrap((Number(targetMode) === 5 ? site.length : secret.length) % 10)];
        // 四隅の4キー: [1(0), 0(9), M(35), Z(29)]
        case 6: return [0, 9, 35, 29].map(wrap);
        case 7: return [wrap(off)];
        default: return [];
      }
    };

    if (Number(cfg.preTarget) > 0) {
      const tiles = resolveSaltTiles(cfg.preTarget, cfg.preOffset);
      const corners = getSaltCorners(cfg.prePattern);
      tiles.forEach(tIdx => pushTileCorners(tIdx, corners, '前ソルト'));
    }

    const ancTile = ((Number(cfg.ancTile) || 0) % CM4Q1Board.KEY_COUNT + CM4Q1Board.KEY_COUNT) % CM4Q1Board.KEY_COUNT;
    const ancMode = Number(cfg.ancMode) || 0;

    if (ancMode === 2) {
      pushTileCorners(ancTile, ['tl', 'bl', 'br', 'tr'], 'アンカー先頭');
    } else if (ancMode === 3) {
      pushTileCorners(ancTile, ['tl', 'tr'], 'アンカー先頭挟み');
    }

    kwChars.forEach((ch, idx) => {
      const baseIdx = CM4Q1Board.findKeyIndex(ch);
      const shiftedIdx = CM4Q1Board.shiftKeyIndex(baseIdx, cfg.shiftDir, cfg.shiftN, cfg.shiftM, idx);
      const corners = getCornersSequence(cfg.baseCorner, cfg.pickPattern, idx);
      const tag = shiftedIdx !== baseIdx ? `キーワード'${ch}'(移動先)` : `キーワード'${ch}'`;
      pushTileCorners(shiftedIdx, corners, tag);
    });

    if (Number(cfg.sufTarget) > 0) {
      const tiles = resolveSaltTiles(cfg.sufTarget, cfg.sufOffset);
      const corners = getSaltCorners(cfg.sufPattern);
      tiles.forEach(tIdx => pushTileCorners(tIdx, corners, '後ソルト'));
    }

    if (ancMode === 1) {
      pushTileCorners(ancTile, ['tl', 'tr', 'br', 'bl'], 'アンカー末尾');
    } else if (ancMode === 3) {
      pushTileCorners(ancTile, ['bl', 'br'], 'アンカー末尾挟み');
    } else if (ancMode === 4 || ancMode === 5 || ancMode === 6) {
      const ancCorners = ancMode === 6 ? ['tl', 'br'] : ['tl', 'tr', 'br', 'bl'];
      const ancSteps = ancCorners.map((c, i) =>
        pickSingleCharWithFallback(ancTile, c, `アンカー挿入(${i + 1}/${ancCorners.length})`, cfg, matrixData)
      );
      const pos = ancMode === 4 ? Math.floor(steps.length / 2) : Math.min(steps.length, Number(cfg.ancPos) || 0);
      steps.splice(pos, 0, ...ancSteps);
    }

    const postMode = Number(cfg.postMode) || 0;
    if (postMode === 1) {
      steps.reverse();
    } else if (postMode === 2 && steps.length >= 2) {
      const half = Math.floor(steps.length / 2);
      steps = [...steps.slice(half), ...steps.slice(0, half)];
    } else if (postMode === 3 && steps.length >= 2) {
      const first = steps[0];
      steps[0] = steps[steps.length - 1];
      steps[steps.length - 1] = first;
    } else if (postMode === 4 && steps.length >= 2) {
      for (let i = 0; i + 1 < steps.length; i += 2) {
        const tmp = steps[i];
        steps[i] = steps[i + 1];
        steps[i + 1] = tmp;
      }
    }

    const lenMode = Number(cfg.lenMode) || 0;
    const lenVal = Math.max(1, Number(cfg.lenVal) || 16);
    if (lenMode === 1) {
      steps = steps.slice(0, lenVal);
    } else if (lenMode === 2) {
      steps = steps.slice(-lenVal);
    }

    const password = steps.map(s => s.ch).join('');
    const entropyFn = (typeof window !== 'undefined' && window.estimatePasswordEntropy)
      ? window.estimatePasswordEntropy : CMEntropy?.estimatePasswordEntropy;
    const entropy = entropyFn ? entropyFn(password) : null;

    return { password, steps, entropy };
  }

  function evaluate(siteRaw, secretRaw, cfg, matrixData) {
    const mergedCfg = Object.assign({}, defaultConfig, cfg || {});
    if (isCardMode(mergedCfg)) {
      return evaluateCardMode(siteRaw, secretRaw, mergedCfg, matrixData);
    }
    return evaluateRecipeMode(siteRaw, secretRaw, mergedCfg, matrixData);
  }

  return {
    SPOT_NAMES,
    defaultConfig,
    isCardMode,
    canonicalInput,
    isSymbolAllowed,
    getCornersSequence,
    getSaltCorners,
    pickSingleCharWithFallback,
    evaluateCardMode,
    evaluateRecipeMode,
    evaluate
  };
});
