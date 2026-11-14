# QWERTY test suite

The project uses Node's built-in test runner; no Mocha/Jest dependency is required.

## Local verification

From the repository root:

```sh
cd tests
npm install
npm test
npm run test:precache
python3 run-python-tests.py
npm run test:browser
```

The browser suite requires Playwright Chromium. Install it with:

```sh
cd tests
npx playwright install chromium
```

## Service Worker precache

Whenever runtime files under `contents/qwerty/`, `shared/`, or `profiles/` are added, moved, or removed, regenerate the precache list:

```sh
node scripts/generate-precache.js
```

CI runs the same generator in `--check` mode and fails if `contents/qwerty/sw.js` is out of sync. The list is relative to the QWERTY Service Worker, so shared and profile files are referenced with `../../shared/` and `../../profiles/`.

## Coverage

- Node.js unit and deterministic-output tests (Node 20 and 24).
- Independent Python implementation of the CM-BOARD-V3 HMAC-SHA-256 counter RNG, including RFC 4231 vectors and leading-zero seed distinction.
- Chromium browser golden vectors.
- BIP39 backup/restore round trips for a canonical numeric seed (24 words) and a leading-zero seed such as `007` (48 words).
- Service Worker installation, shared/profile asset precaching, and offline retrieval.
