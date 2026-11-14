'use strict';

// iOS board legibility regression test (iPhone Safari / PWA emulation).
//
// Regression guard for the iOS board fix (fix/ios-board-legibility):
// on iPhone viewports the 36-key QWERTY board must render with no text
// overlap between the centre character and the four corner characters,
// with the cm-ios scoping class present and the generation results
// (golden vectors) unchanged. An Android control context must NOT get
// the cm-ios class and must keep the pre-change corner offsets, so a
// future edit cannot silently leak iOS rules onto Android/PC.
//
// Run via `npm run test:browser` (this file is chained after
// run-browser-tests.js in package.json). Standalone:
//   node browser/ios-board-render.test.js
//
// Uses the same local-HTTP + Playwright pattern as run-browser-tests.js.
// Does not modify run-browser-tests.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '../..');
const MIME = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8'
};

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';
const GOLDEN = { normal: '%2y5R0#3%29yPa0$', alnum: '6U4r63m84I1l2Ly0', pin: '341137' };

function createServer() {
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch (_) { res.writeHead(400).end('Bad request'); return; }
    let file = path.resolve(repoRoot, '.' + pathname);
    if (file !== repoRoot && !file.startsWith(repoRoot + path.sep)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const body = fs.readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(body);
    } catch (_) {
      res.writeHead(404).end('Not found');
    }
  });
}

// Measure the board in the page: key count/rows, per-key text boxes and
// pairwise overlaps (centre vs each corner, corner vs corner, text vs key
// border), fonts, html classes, and whether the board overflows the
// viewport horizontally. Tolerance 0.5px for sub-pixel rounding.
async function measureBoard(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
    };
    const tol = 0.5;
    const overlap = (a, b) => {
      const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      return ox > tol && oy > tol ? { ox: +ox.toFixed(2), oy: +oy.toFixed(2) } : null;
    };
    const squares = [...document.querySelectorAll('#div-encrypto-matrix-main .square')];
    const rows = [...document.querySelectorAll('#div-encrypto-matrix-main .qwerty-row')]
      .map((r) => r.querySelectorAll('.square').length);
    const overlaps = [];
    const centerFonts = new Set();
    const cornerFonts = new Set();
    squares.forEach((sq, i) => {
      const key = rect(sq);
      const parts = { center: sq.querySelector('.center-text') };
      for (const spot of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
        parts[spot] = sq.querySelector('.corner-text.' + spot);
      }
      const boxes = {};
      for (const [name, el] of Object.entries(parts)) {
        if (!el) { overlaps.push({ key: i, pair: 'missing:' + name }); continue; }
        boxes[name] = rect(el);
      }
      if (boxes.center) centerFonts.add(getComputedStyle(parts.center).fontSize);
      for (const spot of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
        if (boxes[spot]) cornerFonts.add(getComputedStyle(parts[spot]).fontSize);
      }
      const names = Object.keys(boxes);
      for (let a = 0; a < names.length; a++) {
        for (let b = a + 1; b < names.length; b++) {
          const o = overlap(boxes[names[a]], boxes[names[b]]);
          if (o) overlaps.push({ key: i, pair: names[a] + '/' + names[b], ...o });
        }
      }
      // Text must stay inside its key (border contact is a defect).
      for (const [name, box] of Object.entries(boxes)) {
        if (box.x < key.x - tol || box.y < key.y - tol ||
            box.right > key.right + tol || box.bottom > key.bottom + tol) {
          overlaps.push({ key: i, pair: name + '/key-border' });
        }
      }
    });
    const board = document.getElementById('div-encrypto-matrix-main').getBoundingClientRect();
    return {
      htmlClasses: document.documentElement.className,
      keyCount: squares.length,
      rows,
      overlaps,
      centerFonts: [...centerFonts],
      cornerFonts: [...cornerFonts],
      boardOverflowX: board.right > window.innerWidth + tol || board.left < -tol
    };
  });
}

async function loadApp(browser, origin, { width, height, userAgent }) {
  const context = await browser.newContext({
    viewport: { width, height },
    userAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Suppress the first-visit tour so the idle route preview is the only
  // overlay on the board (same as the manual verification harness).
  await page.addInitScript(() => { try { localStorage.setItem('cm-tour-done', '1'); } catch (e) {} });
  await page.goto(origin + '/contents/qwerty/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelectorAll('#div-encrypto-matrix-main .square').length > 0,
    null, { timeout: 15000 }
  );
  // Let the idle route preview paint and its CSS colour transitions settle.
  await page.waitForTimeout(2500);
  return { context, page, pageErrors };
}

async function checkGoldenVectors(page) {
  const vectors = await page.evaluate(() => {
    const board = window.CM4Q1Board.generate('84920173');
    const normal = window.CM4Q1Recipes.evaluate(
      'AMAZON', 'K7', { lenMode: 5, lenVal: 16, symMode: 0 }, board
    ).password;
    const alnum = window.CM4Q1Recipes.evaluate(
      'AMAZON', 'K7', { lenMode: 4, lenVal: 16 }, board
    ).password;
    const pin = window.CM4Q1Recipes.evaluate(
      'AMAZON', 'K7', { lenMode: 3, lenVal: 6 }, board
    ).password;
    return { normal, alnum, pin };
  });
  assert.deepEqual(vectors, GOLDEN, 'golden vectors must be unchanged');
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    // iPhone 390px portrait (iPhone 12/13/14) and 375px (iPhone SE).
    for (const width of [390, 375]) {
      const { context, page, pageErrors } = await loadApp(browser, origin, {
        width, height: 844, userAgent: IPHONE_UA
      });
      try {
        const m = await measureBoard(page);
        assert.ok(m.htmlClasses.split(/\s+/).includes('cm-ios'),
          `${width}px: html must carry cm-ios (got "${m.htmlClasses}")`);
        assert.equal(m.keyCount, 36, `${width}px: 36 keys expected`);
        assert.deepEqual(m.rows, [10, 10, 9, 7], `${width}px: rows must stay 10/10/9/7`);
        assert.equal(m.overlaps.length, 0,
          `${width}px: no text overlap allowed, got ${JSON.stringify(m.overlaps.slice(0, 5))}`);
        assert.equal(m.boardOverflowX, false, `${width}px: board must not overflow horizontally`);
        // Legibility floors (fixed rem, not vw): centre 16px, corners 12.48px.
        assert.deepEqual(m.centerFonts, ['16px'], `${width}px: centre font`);
        assert.deepEqual(m.cornerFonts, ['12.48px'], `${width}px: corner fonts must be uniform`);
        await checkGoldenVectors(page);
        // Scroll-to-end: the fixed bottom dock must not cover the last content.
        // Measure .cm-app (the app content wrapper), NOT document.body: the
        // body now carries intentional bottom padding (fix/bottom-ui-overlap)
        // that keeps content above the dock, so the body box itself extends
        // under the dock by design while the content still clears it.
        const endCheck = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          return new Promise((resolve) => setTimeout(() => {
            const dock = document.querySelector('.cm-mobile-dock');
            const dr = dock ? dock.getBoundingClientRect() : null;
            const app = document.querySelector('.cm-app');
            resolve({
              scrolledTo: window.scrollY,
              maxScroll: document.documentElement.scrollHeight - window.innerHeight,
              contentBottom: app ? app.getBoundingClientRect().bottom : null,
              dockTop: dr ? dr.top : null
            });
          }, 300));
        });
        assert.equal(endCheck.scrolledTo, endCheck.maxScroll, `${width}px: must scroll to the end`);
        assert.ok(endCheck.dockTop === null || endCheck.contentBottom < endCheck.dockTop,
          `${width}px: last content must clear the dock`);
        assert.equal(pageErrors.length, 0, `${width}px: no page errors: ${pageErrors.join('; ')}`);
        console.log(`iPhone ${width}px portrait: 36 keys, 0 overlaps, cm-ios present, golden OK`);
      } finally {
        await context.close();
      }
    }

    // Android control: no cm-ios class, and the pre-change corner offsets
    // (2px from the ≤640px block) must be intact.
    const { context, page, pageErrors } = await loadApp(browser, origin, {
      width: 360, height: 800, userAgent: ANDROID_UA
    });
    try {
      const m = await measureBoard(page);
      assert.ok(!m.htmlClasses.split(/\s+/).includes('cm-ios'),
        `Android: html must NOT carry cm-ios (got "${m.htmlClasses}")`);
      assert.equal(m.keyCount, 36, 'Android: 36 keys expected');
      // Strip the idle-preview spot classes (deterministic state) and check
      // the corner offsets are the untouched 2px from qwerty-board.css.
      const offsets = await page.evaluate(async () => {
        window.currentEvalSteps = [];
        document.querySelectorAll('.preview-char-spot, .start-char-spot, .active-char-spot')
          .forEach((el) => el.classList.remove('preview-char-spot', 'start-char-spot', 'active-char-spot'));
        document.querySelectorAll('.square.stroke-preview-tile, .square.stroke-start-tile, .square.active-tile, .square.fallback-tile')
          .forEach((el) => el.classList.remove('stroke-preview-tile', 'stroke-start-tile', 'active-tile', 'fallback-tile'));
        await new Promise((r) => setTimeout(r, 300));
        const tl = document.querySelector('#div-encrypto-matrix-main .square .corner-text.top-left');
        const cs = getComputedStyle(tl);
        return { left: cs.left, top: cs.top };
      });
      assert.deepEqual(offsets, { left: '2px', top: '2px' },
        'Android: corner offsets must stay at the pre-change 2px');
      await checkGoldenVectors(page);
      assert.equal(pageErrors.length, 0, `Android: no page errors: ${pageErrors.join('; ')}`);
      console.log('Android 360px portrait: no cm-ios, corner offsets 2px, golden OK');
    } finally {
      await context.close();
    }

    console.log('iOS board render test: PASS');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
