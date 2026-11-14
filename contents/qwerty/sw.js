// Crypto Matrix — オフライン用 Service Worker（ビルド不要の手書き版）

// 版を上げると古いキャッシュは自動で削除される。ファイルを差し替えたら VERSION を変えること。
const VERSION = 'cm-qwerty-v1.2.0-offline-ci';
const MANUAL_UPDATE_MARKER = 'cm-manual-update-enabled';
const FILES = [
  "./",
  "./app.css",
  "./app.js",
  "./apple-touch-icon.png",
  "./camera-icon.png",
  "./copy-icon.png",
  "./csp-icon.png",
  "./destruct-icon.png",
  "./dice-icon.png",
  "./dt-camera.css",
  "./duress-icon.png",
  "./emblem.png",
  "./favicon.png",
  "./feature-backup.webp",
  "./feature-bip39.webp",
  "./feature-erase.webp",
  "./feature-keepass.webp",
  "./feature-keyfile.webp",
  "./feature-passkey.webp",
  "./feature-password-gen.webp",
  "./feature-shamir.webp",
  "./feature-timesecret.webp",
  "./feature-vault.webp",
  "./file-icon.png",
  "./fonts/FiraCode-Bold.woff2",
  "./fonts/FiraCode-Regular.woff2",
  "./heartbeat-icon.png",
  "./image-icon.png",
  "./index.html",
  "./index.js",
  "./keepass-icon.png",
  "./keeweb/404.html",
  "./keeweb/browserconfig.xml",
  "./keeweb/build.txt",
  "./keeweb/config.json",
  "./keeweb/icons/android-chrome-192x192.png",
  "./keeweb/icons/android-chrome-512x512.png",
  "./keeweb/icons/apple-touch-icon.png",
  "./keeweb/icons/favicon-16x16.png",
  "./keeweb/icons/favicon-32x32.png",
  "./keeweb/icons/mstile-150x150.png",
  "./keeweb/icons/mstile-310x150.png",
  "./keeweb/icons/mstile-310x310.png",
  "./keeweb/icons/mstile-70x70.png",
  "./keeweb/icons/safari-pinned-tab.svg",
  "./keeweb/icons/splash-1125x2436.png",
  "./keeweb/icons/splash-1242x2148.png",
  "./keeweb/icons/splash-1536x2048.png",
  "./keeweb/icons/splash-1668x2224.png",
  "./keeweb/icons/splash-2048x2732.png",
  "./keeweb/icons/splash-640x1136.png",
  "./keeweb/icons/splash-750x1294.png",
  "./keeweb/index.html",
  "./keeweb/manifest.json",
  "./keeweb/oauth-result/dropbox.html",
  "./keeweb/oauth-result/gdrive.html",
  "./keeweb/oauth-result/onedrive.html",
  "./keeweb/oauth-result/teams.html",
  "./keeweb/plugins/translations/ja/ja.json",
  "./keeweb/plugins/translations/ja/manifest.json",
  "./keeweb/service-worker.js",
  "./keeweb/update.json",
  "./keyfile-icon.png",
  "./legacy.css",
  "./lock-icon.png",
  "./manifest.json",
  "./off-icon.png",
  "./on-icon.png",
  "./passkey-icon.png",
  "./pattern-icon.png",
  "./pause-icon.png",
  "./pin-icon.png",
  "./play-icon.png",
  "./print-icon.png",
  "./pwa-192.png",
  "./pwa-512.png",
  "./qr-frame-icon.png",
  "./qr-icon.png",
  "./qwerty-board.css",
  "./refresh-icon.png",
  "./rewind-icon.png",
  "./save-icon.png",
  "./seal-icon.png",
  "./shamir-icon.png",
  "./stop-icon.png",
  "./sw.js",
  "./tab-backup.png",
  "./tab-capsule.png",
  "./tab-quick.png",
  "./tab-recipe.png",
  "./tab-timesecret.png",
  "./tab-transfer.png",
  "./tab-vault.png",
  "./test-icon.png",
  "./theme-cyber.css",
  "./timelock-recover-theme-init.js",
  "./timelock-recover-theme-toggle.js",
  "./timelock-recover.css",
  "./timelock-recover.html",
  "./timelock-recover.js",
  "./trash-icon.png",
  "./unlock-icon.png",
  "../../profiles/qwerty/board.js",
  "../../profiles/qwerty/profile.js",
  "../../profiles/qwerty/recipes.js",
  "../../shared/backup/backup-qr.js",
  "../../shared/backup/data-transfer-protocol.js",
  "../../shared/backup/data-transfer-worker.js",
  "../../shared/backup/data-transfer-zxing-loader.js",
  "../../shared/backup/data-transfer.js",
  "../../shared/backup/qr-encoder.js",
  "../../shared/backup/recipe-v6.js",
  "../../shared/backup/timelock.js",
  "../../shared/backup/timesecret.js",
  "../../shared/common-ui/field-hint.js",
  "../../shared/common-ui/layout.js",
  "../../shared/common-ui/restore-steps.js",
  "../../shared/common-ui/theme-init.js",
  "../../shared/fonts/FiraCode-Bold.woff2",
  "../../shared/fonts/FiraCode-Regular.woff2",
  "../../shared/generator/engine.js",
  "../../shared/generator/entropy.js",
  "../../shared/random/board-rng.js",
  "../../shared/random/lcg.js",
  "../../shared/random/prng-4q1.js",
  "../../shared/storage/passkey-store.js",
  "../../shared/storage/seed-vault.js",
  "../../shared/validation/seed-key.js",
  "../../shared/vendor/argon2.umd.min.js",
  "../../shared/vendor/js-sha256.LICENSE.txt",
  "../../shared/vendor/js-sha256.js",
  "../../shared/vendor/jsQR.js",
  "../../shared/vendor/tlock.bundle.js",
  "../../shared/vendor/zxing-reader.js",
  "../../shared/vendor/zxing_reader.wasm",
];


// Files fetched with HTTP-cache revalidation during precache. addAll() may be
// served a stale copy from the browser HTTP cache right after a deploy, which
// would pin the old file into the new worker's cache.
const REVALIDATE_FILES = ['./theme-cyber.css', './lock-icon.png', './unlock-icon.png'];

self.addEventListener('install', (e) => {
  // Precache the complete new app. The first rollout upgrades older workers once,
  // because those old app pages do not yet contain the manual-update controls.
  // After this release is active, later updates wait for an explicit user request.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.filter((f) => !REVALIDATE_FILES.includes(f)))
        .then(() => Promise.all(REVALIDATE_FILES.map((f) => fetch(f, { cache: 'reload' })
          .then((r) => { if (!r.ok) throw new Error('precache failed: ' + f); return c.put(f, r); })))))
      .then(() => caches.open(MANUAL_UPDATE_MARKER))
      .then((marker) => marker.match('./enabled'))
      .then((enabled) => enabled ? undefined : self.skipWaiting())
  );
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'CM_SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('cm-') && k !== VERSION && k !== MANUAL_UPDATE_MARKER) || k.startsWith('data-transfer-zxing-wasm-')).map((k) => caches.delete(k))))
      .then(() => caches.open(MANUAL_UPDATE_MARKER))
      .then((marker) => marker.put('./enabled', new Response('1')))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'CM_OPEN_TIMESECRET' });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('./#timesecret');
      }
      return undefined;
    })
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const requestUrl = new URL(req.url);
  if (req.method !== 'GET' || requestUrl.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    // ページ本体もキャッシュ優先（アセットと同一方針）。新版の適用は手動更新フローで行う
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    })).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
