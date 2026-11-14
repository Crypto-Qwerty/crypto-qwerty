'use strict';

/**
 * 4Q-1 Profile - 統合定義 (Profile)
 * QWERTY 36キー・中央黒キートップ・4隅モード
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./board.js'),
      require('./recipes.js')
    );
  } else {
    const profile = factory(
      root.CM4Q1Board,
      root.CM4Q1Recipes
    );
    root.CM4Q1Profile = profile;
    if (root.CryptoMatrixEngine) {
      root.CryptoMatrixEngine.registerProfile(profile);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CM4Q1Board, CM4Q1Recipes) {

  // Canvas描画パラメータ (85.6mm × 54.0mm カード仕様)
  const CARD_WIDTH = 2696;
  const CARD_HEIGHT = 1701;
  const MM = CARD_WIDTH / 85.6;

  function renderCardToCanvas(canvas, matrixData, seedText = '') {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const W = CARD_WIDTH;
    const H = CARD_HEIGHT;

    // 背景（白）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // ヘッダー帯（黒）
    ctx.fillStyle = '#000000';
    ctx.fillRect(3 * MM, 2 * MM, 79.6 * MM, 3.3 * MM);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${1.46 * MM}px "JetBrains Mono", "Fira Code", monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('4Q-1 // 4-CORNER QUAD-MODE', 4.2 * MM, 3.7 * MM);
    ctx.textAlign = 'right';
    ctx.fillText(`SEED:[${seedText || '84920173'}]`, 81.4 * MM, 3.7 * MM);

    // フッター帯（黒・角丸）
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(3 * MM, 45.6 * MM, 79.6 * MM, 5.4 * MM, 0.8 * MM);
    } else {
      ctx.rect(3 * MM, 45.6 * MM, 79.6 * MM, 5.4 * MM);
    }
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${1.35 * MM}px "Fira Code", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('UL:FULL-1  UR:FULL-2  BL:ALNUM  BR:PIN', 42.8 * MM, 48.4 * MM);

    // キー描画
    const kw = 7.55 * MM;
    const kh = 9.2 * MM;
    const g = 0.45 * MM;
    let n = 0;

    CM4Q1Board.ROWS.forEach((row, ri) => {
      const rw = row.length * kw + (row.length - 1) * g;
      const sx = (W - rw) / 2;
      const y = (6 + ri * 9.8) * MM;

      row.forEach((ch, ci) => {
        const d = matrixData[n++];
        if (!d) return;
        const xx = sx + ci * (kw + g);

        // 外枠
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.22 * MM;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(xx, y, kw, kh, 0.65 * MM);
        } else {
          ctx.rect(xx, y, kw, kh);
        }
        ctx.stroke();

        // 中央黒キートップ
        const cw = 2.65 * MM;
        const chh = 3.15 * MM;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(xx + (kw - cw) / 2, y + (kh - chh) / 2, cw, chh, 0.42 * MM);
        } else {
          ctx.rect(xx + (kw - cw) / 2, y + (kh - chh) / 2, cw, chh);
        }
        ctx.fill();

        // 中央基準キー文字（白）
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${2 * MM}px "JetBrains Mono", "Fira Code", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, xx + kw / 2, y + kh * 0.52);

        // 4隅の文字（黒）
        ctx.fillStyle = '#000000';
        ctx.font = `700 ${1.55 * MM}px "Fira Code", monospace`;

        // 左上: FULL-1
        ctx.textAlign = 'left';
        ctx.fillText(d.full1, xx + 0.52 * MM, y + 1.45 * MM);

        // 右上: FULL-2
        ctx.textAlign = 'right';
        ctx.fillText(d.full2, xx + kw - 0.52 * MM, y + 1.45 * MM);

        // 左下: ALNUM
        ctx.textAlign = 'left';
        ctx.fillText(d.alnum, xx + 0.52 * MM, y + kh - 1.35 * MM);

        // 右下: PIN
        ctx.textAlign = 'right';
        ctx.fillText(d.pin, xx + kw - 0.52 * MM, y + kh - 1.35 * MM);
      });
    });
  }

  const profile = {
    id: '4q1',
    name: 'CryptoMatrix 4Q-1 (QWERTY 4-Corner Quad-Mode)',
    description: 'QWERTY 36キー・中央黒キートップ・4隅モード (FULL-1 / FULL-2 / ALNUM / PIN) 物理カード盤面',
    board: {
      type: '4q1',
      keyCount: CM4Q1Board.KEY_COUNT,
      rows: CM4Q1Board.ROWS,
      keys: CM4Q1Board.KEYS,
      safeSymbols: CM4Q1Board.SAFE_SYMBOLS,
      generate: CM4Q1Board.generate,
      findKeyIndex: CM4Q1Board.findKeyIndex,
      shiftKeyIndex: CM4Q1Board.shiftKeyIndex,
      renderCardToCanvas
    },
    recipe: {
      defaultConfig: CM4Q1Recipes.defaultConfig,
      evaluate: CM4Q1Recipes.evaluate,
      getCornersSequence: CM4Q1Recipes.getCornersSequence,
      getSaltCorners: CM4Q1Recipes.getSaltCorners,
      isSymbolAllowed: CM4Q1Recipes.isSymbolAllowed
    },
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      mmRatio: MM,
      render: renderCardToCanvas
    }
  };

  return profile;
});
