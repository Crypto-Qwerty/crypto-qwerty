'use strict';

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

function createServer(options = {}) {
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch (_) { res.writeHead(400).end('Bad request'); return; }
    if (options.cleanUrls) {
      // Cloudflare Pages Clean URLs emulation: .html URLs 308-redirect to
      // their clean form, bare directories 308-redirect to the slashed
      // form, and extensionless paths serve the matching .html file.
      if (pathname.endsWith('/index.html')) {
        res.writeHead(308, { Location: pathname.slice(0, -'index.html'.length) }).end();
        return;
      }
      if (pathname.endsWith('.html')) {
        res.writeHead(308, { Location: pathname.slice(0, -'.html'.length) }).end();
        return;
      }
    }
    let file = path.resolve(repoRoot, '.' + pathname);
    if (file !== repoRoot && !file.startsWith(repoRoot + path.sep)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    try {
      let stat = null;
      try { stat = fs.statSync(file); } catch (_) { stat = null; }
      if (stat && stat.isDirectory()) {
        if (options.cleanUrls && !pathname.endsWith('/')) {
          res.writeHead(308, { Location: pathname + '/' }).end();
          return;
        }
        file = path.join(file, 'index.html');
      } else if (!stat && options.cleanUrls && fs.existsSync(file + '.html')) {
        file = file + '.html';
      }
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

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = 'http://127.0.0.1:' + address.port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ serviceWorkers: 'allow' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(origin + '/contents/qwerty/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.CM4Q1Board && window.CM4Q1Recipes);

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
    assert.deepEqual(vectors, {
      normal: '%2y5R0#3%29yPa0$',
      alnum: '6U4r63m84I1l2Ly0',
      pin: '341137'
    });

    const backupRoundTrips = await page.evaluate(async () => {
      const input = document.getElementById('input-seed-number');
      const restore = document.getElementById('input-restore-seed');
      const status = document.getElementById('restore-status');
      const results = [];
      for (const seed of ['84920173', '007', '7', '123456789012']) {
        input.value = seed;
        await generateAndRenderSeedPhrase();
        const words = currentMnemonicWords.slice();
        restore.value = words.join(' ');
        await restoreRecipeFromSeedInput();
        results.push({
          seed,
          wordCount: words.length,
          restoredSeed: input.value,
          status: status.textContent
        });
      }
      return results;
    });
    assert.deepEqual(backupRoundTrips.map((x) => [x.seed, x.wordCount, x.restoredSeed]), [
      ['84920173', 24, '84920173'],
      ['007', 48, '007'],
      ['7', 24, '7'],
      ['123456789012', 48, '123456789012']
    ]);
    assert.ok(backupRoundTrips.every((x) => x.status.includes('復元しました')),
      JSON.stringify(backupRoundTrips));
    assert.match(backupRoundTrips[0].status, /24単語/);
    assert.match(backupRoundTrips[1].status, /48単語/);
    assert.match(backupRoundTrips[2].status, /24単語/);
    assert.match(backupRoundTrips[3].status, /48単語/);

    // Exercise the real Service Worker install/precache path, including files
    // located in ../.. shared/profile directories.
    const sw = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register(
        '/contents/qwerty/sw.js', { scope: '/contents/qwerty/' }
      );
      await navigator.serviceWorker.ready;
      const sharedUrl = new URL('../../shared/random/board-rng.js', location.href).href;
      const cachedShared = await caches.match(sharedUrl);
      return { active: Boolean(registration.active), cachedShared: Boolean(cachedShared) };
    });
    assert.equal(sw.active, true);
    assert.equal(sw.cachedShared, true, 'shared HMAC RNG was not precached');
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await context.setOffline(true);
    const offline = await page.evaluate(async () => {
      const response = await fetch('../../shared/random/board-rng.js');
      return { ok: response.ok, text: await response.text() };
    });
    assert.equal(offline.ok, true);
    assert.match(offline.text, /CM-BOARD-V3/);
    await context.setOffline(false);

    // Cloudflare Pages Clean URLs: the host 308-redirects every .html URL
    // to its clean form. The Service Worker must still install, serve
    // precached pages for navigations, and work offline under those
    // redirects (see tests/qwerty/service-worker-redirect.test.js).
    const cfServer = createServer({ cleanUrls: true });
    await new Promise((resolve) => cfServer.listen(0, '127.0.0.1', resolve));
    const cfOrigin = 'http://127.0.0.1:' + cfServer.address().port;
    const cfContext = await browser.newContext({ serviceWorkers: 'allow' });
    const cfPage = await cfContext.newPage();
    const cfErrors = [];
    cfPage.on('pageerror', (error) => cfErrors.push(error.message));
    try {
      await cfPage.goto(cfOrigin + '/contents/qwerty/', { waitUntil: 'load' });
      const cfSw = await cfPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.register(
          '/contents/qwerty/sw.js', { scope: '/contents/qwerty/' }
        );
        await navigator.serviceWorker.ready;
        return { active: Boolean(registration.active) };
      });
      assert.equal(cfSw.active, true, 'SW did not activate under Clean URLs');
      await cfPage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      // No precached response may carry redirected=true: Chrome rejects
      // such a response when it answers a navigation.
      const cfCache = await cfPage.evaluate(async () => {
        const names = await caches.keys();
        const version = names.find((n) => n.startsWith('cm-qwerty-'));
        const cache = await caches.open(version);
        const out = [];
        for (const req of await cache.keys()) {
          const res = await cache.match(req);
          out.push({ url: new URL(req.url).pathname, redirected: res.redirected, status: res.status });
        }
        return out;
      });
      assert.ok(cfCache.length >= 135, 'precache looks incomplete: ' + cfCache.length);
      assert.deepEqual(cfCache.filter((e) => e.redirected).map((e) => e.url), [],
        'precached entries must not be redirected');
      // Navigation to the .html URL (served from the precache).
      await cfPage.goto(cfOrigin + '/contents/qwerty/index.html', { waitUntil: 'load' });
      assert.match(await cfPage.title(), /CryptoPassKey/);
      // Extensionless directory navigation (host 308, browser follows).
      await cfPage.goto(cfOrigin + '/contents/qwerty/keeweb', { waitUntil: 'load' });
      assert.equal(cfPage.url(), cfOrigin + '/contents/qwerty/keeweb/');
      assert.match(await cfPage.title(), /KeeWeb/);
      // Let the KeeWeb worker register and activate, then reload twice:
      // the first reload hands control to it, the second is served by it.
      // (Playwright's waitForFunction does not await an async predicate,
      // so poll for the registration from the page and wait on a flag.)
      await cfPage.evaluate(() => {
        window.__kwReady = false;
        const check = async () => {
          const regs = await navigator.serviceWorker.getRegistrations();
          const kw = regs.find((r) => r.scope.endsWith('/contents/qwerty/keeweb/'));
          if (kw && kw.active) { window.__kwReady = true; return; }
          setTimeout(check, 200);
        };
        check();
      });
      await cfPage.waitForFunction(() => window.__kwReady, { timeout: 30000 });
      await cfPage.reload({ waitUntil: 'load' });
      const cfController = await cfPage.evaluate(() => navigator.serviceWorker.controller
        ? navigator.serviceWorker.controller.scriptURL : '');
      assert.ok(cfController.includes('keeweb/service-worker.js'),
        'KeeWeb worker should control the KeeWeb page: ' + cfController);
      await cfPage.reload({ waitUntil: 'load' });
      assert.match(await cfPage.title(), /KeeWeb/);
      // Offline reload of the app shell.
      await cfPage.goto(cfOrigin + '/contents/qwerty/', { waitUntil: 'load' });
      await cfContext.setOffline(true);
      await cfPage.reload({ waitUntil: 'load' });
      await cfPage.waitForFunction(() => window.CM4Q1Board);
      await cfContext.setOffline(false);
      assert.deepEqual(cfErrors, [], 'Cloudflare-mode page errors: ' + cfErrors.join('; '));
    } finally {
      await cfContext.close();
      await new Promise((resolve) => cfServer.close(resolve));
    }

    assert.deepEqual(pageErrors, [], 'browser page errors: ' + pageErrors.join('; '));
    console.log('PASS: browser golden vectors');
    console.log('PASS: BIP39 24-word and leading-zero 48-word round trips');
    console.log('PASS: Service Worker install, shared-file precache, and offline fetch');
    console.log('PASS: Cloudflare Pages Clean URLs (SW install, precache, navigation, KeeWeb reload, offline)');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
