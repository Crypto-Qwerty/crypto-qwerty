'use strict';

// Generate the Service Worker precache list from the actual runtime tree.
// Run normally to update contents/qwerty/sw.js, or with --check in CI.
const fs = require('node:fs');
const path = require('node:path');
const repoRoot = path.resolve(__dirname, '..');
const swPath = path.join(repoRoot, 'contents/qwerty/sw.js');
const roots = ['contents/qwerty', 'shared', 'profiles'];

function walk(dir) {
  return fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.posix.join(dir, entry.name);
      return entry.isDirectory() ? walk(relative) : [relative];
    });
}

function buildFiles() {
  return ['./', ...roots.flatMap(walk).sort().map((file) => {
    const relative = path.posix.relative('contents/qwerty', file);
    return relative.startsWith('..') ? relative : './' + relative;
  })];
}

function renderBlock(files) {
  return 'const FILES = [\\n' + files.map((file) => '  ' + JSON.stringify(file) + ',').join('\\n') + '\\n];';
}

const source = fs.readFileSync(swPath, 'utf8');
const start = source.indexOf('const FILES = [');
const endMarker = source.indexOf('\\n];', start);
if (start < 0 || endMarker < 0) throw new Error('Could not locate FILES array in sw.js');
const end = endMarker + 3;
const expected = renderBlock(buildFiles());
const actual = source.slice(start, end);
if (process.argv.includes('--check')) {
  if (actual !== expected) {
    console.error('Service Worker precache list is stale. Run: node scripts/generate-precache.js');
    process.exitCode = 1;
  } else {
    console.log('PASS: Service Worker precache list matches runtime files.');
  }
} else {
  fs.writeFileSync(swPath, source.slice(0, start) + expected + source.slice(end));
  console.log('Updated contents/qwerty/sw.js with ' + buildFiles().length + ' entries.');
}
