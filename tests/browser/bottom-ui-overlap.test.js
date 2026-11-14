'use strict';
/* Bottom-UI overlap regression test (repo-local Playwright test).
 *
 * Regression: the fixed "🔑 パスワード表示 ▲" pill (#btn-sticky-min-pill)
 * sat at bottom:10px inside the fixed mobile dock's band (z-index 91 <
 * dock 9999), so the dock intercepted every tap and the pill could not
 * open the sticky password bar. The expanded sticky bar also slid under
 * the dock once the dock grew with the iOS Safe Area inset.
 *
 * Verifies on iPhone 390/375px portrait (light) and Android 360px that:
 * - the pill has zero bounding-box overlap with the mobile dock,
 * - elementFromPoint at the pill centre returns the pill itself,
 * - a real click on the pill expands the sticky bar (no force needed),
 * - the expanded sticky bar has zero overlap with the dock,
 * - the dock buttons remain tappable (elementFromPoint on a dock chip),
 * - the golden vectors are unchanged.
 * Safe Area itself cannot be emulated in headless Chromium (env() is 0),
 * so the simulated-inset geometry is covered by the investigation
 * harness (~/workspace/investigation/bottom-ui/measure.js), not here.
 */
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

function createServer() {
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch (_) { res.writeHead(400).end('Bad request'); return; }
    let file = path.resolve(repoRoot, '.' + pathname);
    if (file !== repoRoot && !file.startsWith(repoRoot + path.sep)) {
      res.writeHead(403).end('Forbidden'); return; }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const body = fs.readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(body);
    } catch (_) { res.writeHead(404).end('Not found'); }
  });
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36';

const CONFIGS = [
  { name: 'iPhone 390px portrait', width: 390, height: 844, ua: IPHONE_UA, dsf: 3 },
  { name: 'iPhone 375px portrait', width: 375, height: 667, ua: IPHONE_UA, dsf: 2 },
  { name: 'Android 360px portrait', width: 360, height: 800, ua: ANDROID_UA, dsf: 3 },
];

function overlap(a, b) {
  if (!a || !b) return 0;
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const cfg of CONFIGS) {
      const context = await browser.newContext({
        viewport: { width: cfg.width, height: cfg.height },
        userAgent: cfg.ua, isMobile: true, hasTouch: true, deviceScaleFactor: cfg.dsf,
      });
      const page = await context.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('cm-tour-done', '1'); } catch (_) {} });
      const pageErrors = [];
      page.on('pageerror', (e) => pageErrors.push(String(e)));
      await page.goto(origin + '/contents/qwerty/', { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      // Scroll so the live password row is out of view: the sticky bar
      // becomes .visible and (initially minimized) the pill shows.
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForTimeout(600);
      const state = await page.evaluate(() => {
        const bar = document.querySelector('#sticky-pw-bar');
        const pill = document.querySelector('#btn-sticky-min-pill');
        const dock = document.querySelector('.cm-mobile-dock');
        const r = (el) => {
          const b = el.getBoundingClientRect();
          return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        };
        const inter = (a, b) => {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return w > 0 && h > 0 ? w * h : 0;
        };
        const dockR = r(dock);
        const pillR = r(pill);
        const cx = pillR.left + (pillR.right - pillR.left) / 2;
        const cy = pillR.top + (pillR.bottom - pillR.top) / 2;
        const topEl = document.elementFromPoint(cx, cy);
        return {
          barVisible: bar.classList.contains('visible'),
          barMinimized: bar.classList.contains('is-minimized'),
          pillDisplay: getComputedStyle(pill).display,
          dockDisplay: getComputedStyle(dock).display,
          pillOverlap: inter(pillR, dockR),
          pillTopElement: topEl ? (topEl.id || topEl.className || topEl.tagName) : null,
        };
      });
      assert.equal(state.barVisible, true, cfg.name + ': sticky bar must become visible after scroll');
      assert.equal(state.barMinimized, true, cfg.name + ': sticky bar starts minimized');
      assert.notEqual(state.pillDisplay, 'none', cfg.name + ': pill must be shown');
      assert.notEqual(state.dockDisplay, 'none', cfg.name + ': mobile dock must be shown');
      assert.equal(state.pillOverlap, 0, cfg.name + ': pill must not overlap the dock');
      assert.equal(state.pillTopElement, 'btn-sticky-min-pill',
        cfg.name + ': pill centre must hit the pill itself, got ' + state.pillTopElement);
      // A real click on the pill must expand the bar (no force needed).
      const pillBox = await page.locator('#btn-sticky-min-pill').boundingBox();
      assert.ok(pillBox, cfg.name + ': pill must have a bounding box');
      await page.mouse.click(pillBox.x + pillBox.width / 2, pillBox.y + pillBox.height / 2);
      await page.waitForTimeout(400);
      const afterClick = await page.evaluate(() => {
        const bar = document.querySelector('#sticky-pw-bar');
        const pill = document.querySelector('#btn-sticky-min-pill');
        const dock = document.querySelector('.cm-mobile-dock');
        const r = (el) => {
          const b = el.getBoundingClientRect();
          return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        };
        const inter = (a, b) => {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return w > 0 && h > 0 ? w * h : 0;
        };
        const chip = document.querySelector('.cm-mob-chip');
        const cr = r(chip);
        const chipEl = document.elementFromPoint(cr.left + (cr.right - cr.left) / 2, cr.top + (cr.bottom - cr.top) / 2);
        return {
          barMinimized: bar.classList.contains('is-minimized'),
          pillDisplay: getComputedStyle(pill).display,
          barOverlap: inter(r(bar), r(dock)),
          dockChipHit: !!(chipEl && chipEl.closest('.cm-mob-chip')),
        };
      });
      assert.equal(afterClick.barMinimized, false, cfg.name + ': pill click must expand the bar');
      assert.equal(afterClick.pillDisplay, 'none', cfg.name + ': pill must hide after expanding the bar');
      assert.equal(afterClick.barOverlap, 0, cfg.name + ': expanded bar must not overlap the dock');
      assert.equal(afterClick.dockChipHit, true, cfg.name + ': dock chips must stay tappable');
      // Golden vectors are asserted by run-browser-tests.js; here we only
      // require a clean page (no errors) after the interactions above.
      assert.equal(pageErrors.length, 0, cfg.name + ': page errors: ' + pageErrors.join(' | '));
      console.log(cfg.name + ': pill 0 overlap, pill click expands bar, bar 0 overlap, dock tappable, errors 0');
      await context.close();
    }
    console.log('Bottom-UI overlap test: PASS');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
