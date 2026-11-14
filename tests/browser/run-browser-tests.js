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

    assert.deepEqual(pageErrors, [], 'browser page errors: ' + pageErrors.join('; '));
    console.log('PASS: browser golden vectors');
    console.log('PASS: BIP39 24-word and leading-zero 48-word round trips');
    console.log('PASS: Service Worker install, shared-file precache, and offline fetch');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
