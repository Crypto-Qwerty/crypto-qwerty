'use strict';

// Service Worker redirect handling (Cloudflare Pages Clean URLs).
//
// Cloudflare Pages 308-redirects every .html URL to its clean form
// (index.html -> ./, keeweb/index.html -> keeweb/, timelock-recover.html
// -> timelock-recover). A response stored after following such a redirect
// carries redirected=true, and Chrome refuses to use it for a navigation
// ("a redirected response was used for a request whose redirect mode is
// not 'follow'"). These tests load the real contents/qwerty/sw.js in a vm
// with a mocked Cache Storage / fetch pair that reproduces the Cloudflare
// redirect behaviour, and assert the worker stores and serves clean copies.
//
// The crypto / generation modules are untouched by this change; this file
// only exercises the Service Worker install and fetch handlers.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../..');
const swPath = path.join(repoRoot, 'contents/qwerty/sw.js');
const ORIGIN = 'https://example.test';
const SCOPE = ORIGIN + '/contents/qwerty/';

function filesFromSource(source) {
  const start = source.indexOf('const FILES = [');
  const end = source.indexOf('\n];', start);
  const block = source.slice(start, end);
  return [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(m[0]));
}

// Minimal Response-like object. Node's real Response cannot carry
// redirected=true, which is exactly the state under test.
function mockResponse({ ok = true, status = 200, redirected = false, url = '', type = 'basic', headers = {}, body = 'x'.repeat(16) } = {}) {
  const bytes = Buffer.from(typeof body === 'string' ? body : '');
  const res = {
    ok, status, statusText: status === 200 ? 'OK' : 'Error', redirected, url, type,
    headers: new Headers(headers),
    clone() { return mockResponse({ ok, status, redirected, url, type, headers, body }); },
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
    async text() { return typeof body === 'string' ? body : ''; },
  };
  return res;
}

class MockCache {
  constructor() { this.store = new Map(); }
  _key(request) {
    const href = typeof request === 'string' ? request : request.url;
    return new URL(href, SCOPE).href;
  }
  async match(request, options = {}) {
    const want = new URL(this._key(request));
    for (const [key, res] of this.store) {
      const have = new URL(key);
      if (options.ignoreSearch) {
        if (have.origin + have.pathname === want.origin + want.pathname) return res;
      } else if (key === want.href) {
        return res;
      }
    }
    return undefined;
  }
  async put(request, response) { this.store.set(this._key(request), response); }
  async keys() { return [...this.store.keys()].map((href) => ({ url: href })); }
}

function createHarness(options = {}) {
  const storage = new Map();
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new MockCache());
      return storage.get(name);
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
    async match(request, options) {
      for (const cache of storage.values()) {
        const hit = await cache.match(request, options);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const listeners = {};
  let skipWaitingCalled = false;
  const self = {
    registration: { scope: SCOPE },
    skipWaiting() { skipWaitingCalled = true; },
    clients: { claim: async () => {} },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  };
  // fetch() that behaves like Cloudflare Pages: .html URLs 308-redirect to
  // their clean form, and bare directory URLs 308-redirect to the slashed
  // form. A plain fetch follows the redirect and reports redirected=true.
  // Navigation requests (mode 'navigate') return an opaqueredirect
  // response instead, as the browser does.
  const DIRS = new Set(['/contents/qwerty/', '/contents/qwerty/keeweb/', '/contents/qwerty/keeweb/oauth-result/']);
  const fetchMock = async (input, _init) => {
    const isNav = input && typeof input === 'object' && input.mode === 'navigate';
    const url = new URL(typeof input === 'string' ? input : input.url, SCOPE);
    const pathname = url.pathname;
    let target = null;
    if (pathname.endsWith('/index.html')) target = pathname.slice(0, -'index.html'.length);
    else if (pathname.endsWith('.html')) target = pathname.slice(0, -'.html'.length);
    else if (DIRS.has(pathname + '/')) target = pathname + '/';
    if (target) {
      if (isNav) {
        return mockResponse({ ok: false, status: 0, redirected: false, url: '', type: 'opaqueredirect', body: '' });
      }
      const res = mockResponse({
        ok: true, status: 200, redirected: true, url: ORIGIN + target,
        headers: { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'br', 'content-length': '999' },
        body: '<html>page ' + pathname + '</html>',
      });
      // Simulate a rebuild failure for one file (e.g. the Response
      // constructor rejecting the status): storeClean must fall back to
      // caching the original response instead of failing the install.
      if (options.rebuildFailsFor && options.rebuildFailsFor.has(pathname)) {
        res.arrayBuffer = async () => { throw new Error('rebuild failed (test)'); };
      }
      return res;
    }
    if (pathname.endsWith('/')) {
      return mockResponse({
        ok: true, status: 200, redirected: false, url: url.href,
        headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<html>page ' + pathname + '</html>',
      });
    }
    return mockResponse({
      ok: true, status: 200, redirected: false, url: url.href,
      headers: { 'content-type': 'application/octet-stream' }, body: 'data ' + pathname,
    });
  };
  const sandbox = {
    self, caches, fetch: fetchMock, Response, Headers, URL,
    location: { origin: ORIGIN }, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(swPath, 'utf8'), sandbox, { filename: 'sw.js' });
  return {
    listeners, caches, storage, sandbox,
    wasSkipWaitingCalled: () => skipWaitingCalled,
    dispatchInstall() {
      let captured;
      listeners.install[0]({ waitUntil(p) { captured = p; } });
      return captured;
    },
    dispatchFetch(request) {
      let captured;
      listeners.fetch[0]({ request, respondWith(p) { captured = p; } });
      return captured;
    },
    async versionCache() {
      const names = [...storage.keys()].filter((n) => n.startsWith('cm-qwerty-'));
      assert.equal(names.length, 1, 'expected exactly one version cache: ' + names.join(', '));
      return storage.get(names[0]);
    },
  };
}

function navRequest(pathname) {
  return { method: 'GET', mode: 'navigate', url: ORIGIN + pathname };
}

test('Service Worker precache stores clean copies under Cloudflare redirects', async () => {
  const h = createHarness();
  await h.dispatchInstall();
  assert.equal(h.wasSkipWaitingCalled(), true, 'first rollout should activate immediately');
  const cache = await h.versionCache();
  const files = filesFromSource(fs.readFileSync(swPath, 'utf8'));
  assert.equal(cache.store.size, files.length, 'precache must contain every FILES entry');
  for (const [key, res] of cache.store) {
    assert.equal(res.redirected, false, 'precached entry must not be redirected: ' + key);
    assert.equal(res.ok, true, 'precached entry must be OK: ' + key);
    assert.equal(res.status, 200, 'precached entry must be 200: ' + key);
  }
  // The redirected .html pages keep their content and content-type, but the
  // transfer headers describing the encoded body must be stripped.
  const index = cache.store.get(ORIGIN + '/contents/qwerty/index.html');
  assert.ok(index, 'index.html must be precached');
  assert.equal(await index.text(), '<html>page /contents/qwerty/index.html</html>');
  assert.equal(index.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(index.headers.get('content-encoding'), null);
  assert.equal(index.headers.get('content-length'), null);
  const keeweb = cache.store.get(ORIGIN + '/contents/qwerty/keeweb/index.html');
  assert.ok(keeweb, 'keeweb/index.html must be precached');
  assert.equal(keeweb.redirected, false);
});

test('Service Worker serves a clean cached page for a navigation', async () => {
  const h = createHarness();
  await h.dispatchInstall();
  const res = await h.dispatchFetch(navRequest('/contents/qwerty/index.html'));
  assert.equal(res.status, 200);
  assert.equal(res.redirected, false);
  assert.equal(await res.text(), '<html>page /contents/qwerty/index.html</html>');
});

test('Service Worker treats a redirected cache hit as a miss', async () => {
  const h = createHarness();
  await h.dispatchInstall();
  const cache = await h.versionCache();
  // Simulate a poisoned entry left by the pre-fix worker (redirected=true).
  const poisoned = mockResponse({
    ok: true, status: 200, redirected: true, url: ORIGIN + '/contents/qwerty/',
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: '<html>poisoned</html>',
  });
  await cache.put(ORIGIN + '/contents/qwerty/index.html', poisoned);
  const res = await h.dispatchFetch(navRequest('/contents/qwerty/index.html'));
  // The worker must not answer the navigation with the poisoned response:
  // the network fetch returns opaqueredirect, which the browser follows.
  assert.equal(res.type, 'opaqueredirect');
  // The poisoned entry is left untouched (never served, never overwritten
  // with an opaqueredirect); the next activation drops the old cache.
  assert.equal(cache.store.get(ORIGIN + '/contents/qwerty/index.html'), poisoned);
});

test('Service Worker caches only plain OK responses for navigations', async () => {
  const h = createHarness();
  await h.dispatchInstall();
  const cache = await h.versionCache();
  // Directory navigation (no redirect): fetched 200 is cached clean.
  const dir = await h.dispatchFetch(navRequest('/contents/qwerty/keeweb/'));
  assert.equal(dir.status, 200);
  assert.equal(dir.redirected, false);
  const dirEntry = cache.store.get(ORIGIN + '/contents/qwerty/keeweb/');
  assert.ok(dirEntry, 'directory navigation should be cached');
  assert.equal(dirEntry.redirected, false);
  // Extensionless directory navigation (redirect): answered with the
  // opaqueredirect for the browser to follow, and nothing is cached for it.
  const before = cache.store.size;
  const bare = await h.dispatchFetch(navRequest('/contents/qwerty/keeweb'));
  assert.equal(bare.type, 'opaqueredirect');
  assert.equal(cache.store.size, before, 'opaqueredirect must not be cached');
  assert.equal(cache.store.has(ORIGIN + '/contents/qwerty/keeweb'), false);
});

test('Service Worker falls back to the app shell when offline', async () => {
  const h = createHarness();
  await h.dispatchInstall();
  // Simulate offline: every network fetch rejects from here on.
  h.sandbox.fetch = async () => { throw new Error('network offline'); };
  // A navigation to a URL that is not precached must fall back to the
  // cached app shell instead of failing.
  const res = await h.dispatchFetch(navRequest('/contents/qwerty/keeweb/'));
  assert.ok(res, 'expected the app shell as the offline fallback');
  assert.equal(res.redirected, false);
  assert.equal(await res.text(), '<html>page /contents/qwerty/</html>');
});

test('Service Worker precache falls back to the original response when the rebuild fails', async () => {
  const failing = '/contents/qwerty/timelock-recover.html';
  const h = createHarness({ rebuildFailsFor: new Set([failing]) });
  // Install must still succeed: only this one entry stays redirected.
  await h.dispatchInstall();
  assert.equal(h.wasSkipWaitingCalled(), true, 'install must succeed despite the rebuild failure');
  const cache = await h.versionCache();
  const files = filesFromSource(fs.readFileSync(swPath, 'utf8'));
  assert.equal(cache.store.size, files.length, 'precache must contain every FILES entry');
  const failed = cache.store.get(ORIGIN + failing);
  assert.ok(failed, 'the failed entry must still be cached');
  assert.equal(failed.redirected, true, 'the fallback entry keeps the original redirected response');
  for (const [key, res] of cache.store) {
    if (key === ORIGIN + failing) continue;
    assert.equal(res.redirected, false, 'other precached entries must not be redirected: ' + key);
  }
  // The fallback entry is never served for a navigation: the handler treats
  // a redirected hit as a miss and the network returns opaqueredirect.
  const res = await h.dispatchFetch(navRequest(failing));
  assert.equal(res.type, 'opaqueredirect');
});
