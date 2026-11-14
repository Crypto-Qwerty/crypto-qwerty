'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '../..');

test('Service Worker precache list matches every tracked runtime file', () => {
  const generator = path.join(repoRoot, 'scripts/generate-precache.js');
  const result = spawnSync(process.execPath, [generator, '--check'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  assert.match(result.stdout, /PASS: Service Worker precache list matches runtime files/);
});
