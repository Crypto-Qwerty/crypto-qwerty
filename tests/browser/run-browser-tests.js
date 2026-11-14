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

    // Seed leading-zero cross-checks (audit follow-up).
    // Encrypted backup + Shamir go through the real decrypt-page flow
    // (review -> preview -> apply); TimeLock / TimeSecret are checked at
    // the seed-bound envelope layer, because a full TimeLock capsule
    // decrypt needs a drand beacon fetched over the network, which is
    // unavailable in the test environment.
    const seedVectors = ['007', '0007', '0', '123456789012', '84920173'];
    async function restoreViaDecryptPage(words, restoreSeed, password) {
      await page.evaluate((args) => {
        document.getElementById('bq-restore-seed-number').value = args.restoreSeed;
        document.getElementById('bq-import').value = args.words;
        document.getElementById('bq-restore-password').value = args.password;
        document.getElementById('bq-review').click();
      }, { words, restoreSeed, password });
      // PBKDF2 (2,100,000 iterations) can be slow on loaded CI runners.
      await page.waitForFunction(() => !document.getElementById('bq-apply').disabled, { timeout: 60000 });
      const preview = await page.evaluate(() => {
        const text = document.getElementById('bq-preview').textContent;
        return text.split('\n').find((line) => line.includes('カード配列シード番号')) || '';
      });
      await page.evaluate(() => document.getElementById('bq-apply').click());
      await page.waitForFunction(() => document.getElementById('bq-scan-status').textContent.includes('復元完了'), { timeout: 60000 });
      const inputSeed = await page.evaluate(() => document.getElementById('input-seed-number').value);
      return { preview, inputSeed };
    }

    // (a) Encrypted backup (password-protected, extended): the Backup
    // domain derives its key from the canonical seed ("007" ≡ "7"), so
    // restoring with either "007" or "7" as the restore-seed input must
    // still leave "007" in the input field (seed text block round-trip).
    const encryptedRoundTrips = [];
    for (const seed of seedVectors) {
      const words = await page.evaluate(async (s) => {
        // Dispatch the input event as a user edit would: the board is only
        // regenerated from the new seed string on input. Setting .value
        // alone leaves the previous board when the numeric value is
        // unchanged (e.g. "007" -> "0007" both parse to 7).
        const input = document.getElementById('input-seed-number');
        input.value = s;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const res = await window.MatrixCardPreset.createEncryptedBip39Backup(
          true, 'test-password-123', 1, { usePassword: true });
        return res.groups.flat().join(' ');
      }, seed);
      const same = await restoreViaDecryptPage(words, seed, 'test-password-123');
      encryptedRoundTrips.push([seed, seed, same.inputSeed, same.preview]);
      if (seed === '007') {
        const canonical = await restoreViaDecryptPage(words, '7', 'test-password-123');
        encryptedRoundTrips.push([seed, '7', canonical.inputSeed, canonical.preview]);
      }
    }
    assert.deepEqual(encryptedRoundTrips.map((x) => [x[0], x[1], x[2]]), [
      ['007', '007', '007'],
      ['007', '7', '007'],
      ['0007', '0007', '0007'],
      ['0', '0', '0'],
      ['123456789012', '123456789012', '123456789012'],
      ['84920173', '84920173', '84920173']
    ]);
    assert.ok(encryptedRoundTrips.every((x) => x[3].includes('カード配列シード番号：' + x[0])),
      'preview must show the original seed text: ' + JSON.stringify(encryptedRoundTrips));

    // (b) Shamir 2-of-3 (no password): any 2 shares restore the seed text.
    const shamirRoundTrips = [];
    for (const seed of seedVectors) {
      const words = await page.evaluate(async (s) => {
        const input = document.getElementById('input-seed-number');
        input.value = s;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const res = await window.MatrixCardPreset.createEncryptedBip39Backup(
          true, '', 1, { shamirM: 2, shamirN: 3 });
        const shareText = (share) => share.groups.map((g) => g.join(' ')).join('\n');
        return shareText(res.shares[0]) + '\n\n' + shareText(res.shares[2]);
      }, seed);
      const restored = await restoreViaDecryptPage(words, seed, '');
      shamirRoundTrips.push([seed, restored.inputSeed, restored.preview]);
    }
    assert.deepEqual(shamirRoundTrips.map((x) => [x[0], x[1]]), seedVectors.map((s) => [s, s]));
    assert.ok(shamirRoundTrips.every((x) => x[2].includes('カード配列シード番号：' + x[0])),
      'preview must show the original seed text: ' + JSON.stringify(shamirRoundTrips));

    // (c) TimeLock seed strictness (inner committed layer): the seed is
    // used verbatim as the key, so "007" and "7" are different keys.
    const timelockChecks = await page.evaluate(async () => {
      const out = [];
      for (const seed of ['007', '0007', '0', '123456789012', '84920173']) {
        const header = new TextEncoder().encode(JSON.stringify({ v: 1, mode: 'A', test: true }));
        const payload = new TextEncoder().encode('timelock seed-zero test ' + seed);
        const packed = await window.CMTimelock.packCommittedInner(header, 'text', '', payload, 'text/plain', seed);
        const dec = await window.CMTimelock.unpackCommittedInner(packed, header, seed);
        let wrongFailed = null;
        if (seed === '007' || seed === '0007') {
          try {
            await window.CMTimelock.unpackCommittedInner(packed, header, '7');
            wrongFailed = false;
          } catch (_) { wrongFailed = true; }
        }
        out.push([seed, new TextDecoder().decode(dec.payload), wrongFailed]);
      }
      return out;
    });
    assert.deepEqual(timelockChecks.map((x) => [x[0], x[1]]), seedVectors.map((s) => [s, 'timelock seed-zero test ' + s]));
    assert.ok(timelockChecks.filter((x) => x[0] === '007' || x[0] === '0007').every((x) => x[2] === true),
      'TimeLock must reject the canonical seed: ' + JSON.stringify(timelockChecks));

    // (d) TimeSecret seed strictness (seed-bound envelope): same rule as
    // TimeLock — the raw seed string is the key.
    const timesecretChecks = await page.evaluate(async () => {
      const out = [];
      for (const seed of ['007', '0007', '0', '123456789012', '84920173']) {
        const plain = new TextEncoder().encode('timesecret seed-zero test ' + seed);
        const packed = await window.MatrixCardPreset.packAppBound('TimeSecret', plain, seed);
        const dec = await window.MatrixCardPreset.unpackAppBound('TimeSecret', packed, seed);
        let wrongFailed = null;
        if (seed === '007' || seed === '0007') {
          try {
            await window.MatrixCardPreset.unpackAppBound('TimeSecret', packed, '7');
            wrongFailed = false;
          } catch (_) { wrongFailed = true; }
        }
        out.push([seed, new TextDecoder().decode(dec), wrongFailed]);
      }
      return out;
    });
    assert.deepEqual(timesecretChecks.map((x) => [x[0], x[1]]), seedVectors.map((s) => [s, 'timesecret seed-zero test ' + s]));
    assert.ok(timesecretChecks.filter((x) => x[0] === '007' || x[0] === '0007').every((x) => x[2] === true),
      'TimeSecret must reject the canonical seed: ' + JSON.stringify(timesecretChecks));

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
    console.log('PASS: encrypted backup and Shamir leading-zero round trips');
    console.log('PASS: TimeLock and TimeSecret seed strictness');
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
