#!/usr/bin/env node
// Assemble a GitHub release directory from already-built artifacts.
//
// Every release ships all four apps — even the ones that did not change in this
// phase — plus checksums and release notes. GitHub adds the "Source code
// (zip/tar.gz)" archives automatically for a tag, so the source is included by
// pushing a version tag.
//
// Usage:
//   node scripts/assemble-release.mjs --version v2.9.63 --dist <artifacts-dir>
//   node scripts/assemble-release.mjs --version v2.9.63 --dist dist --out release
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function get(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const version = (get('--version') || '').replace(/^v/, '');
const dist = get('--dist');
const out = get('--out') || path.join('release', 'v' + version);
if (!version || !dist) {
  console.error('Usage: node scripts/assemble-release.mjs --version <vX.Y.Z> --dist <dir> [--out <dir>]');
  process.exit(1);
}

const patterns = [
  { name: 'Bridge installer (Windows)', regex: /^OMP-Bridge-Setup-.*\.exe$/i },
  { name: 'OMP Desktop installer (Windows)', regex: /^OMP-Desktop-Setup-.*-win-x64\.exe$/i },
  { name: 'OMP Desktop (Windows zip)', regex: /^OMP-Desktop-.*-win-x64\.zip$/i },
  { name: 'Chat OMP OMP (Android APK)', regex: /^Chat-OMP-OMP-Android-.*\.apk$/i },
];

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const found = new Map();
const all = walk(path.resolve(dist));
for (const file of all) {
  const base = path.basename(file);
  for (const pattern of patterns) {
    if (!found.has(pattern.name) && pattern.regex.test(base)) found.set(pattern.name, file);
  }
}

fs.mkdirSync(out, { recursive: true });
const copied = [];
const missing = [];
for (const pattern of patterns) {
  const file = found.get(pattern.name);
  if (!file) { missing.push(pattern.name); continue; }
  const target = path.join(out, path.basename(file));
  fs.copyFileSync(file, target);
  copied.push(target);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
const sums = copied
  .map(file => `${sha256(file)}  ${path.basename(file)}`)
  .sort()
  .join('\n') + '\n';
fs.writeFileSync(path.join(out, 'SHA256SUMS'), sums);

const notes = [
  '# OMP Suite release v' + version,
  '',
  '## Downloads',
  '',
  ...copied.map(file => `- \`${path.basename(file)}\``),
  '',
  '## Source',
  '',
  'The full source code is attached to this release automatically by GitHub (Source code zip/tar.gz).',
  '',
  '## Verify',
  '',
  '```bash',
  'sha256sum -c SHA256SUMS',
  '```',
  '',
].join('\n');
fs.writeFileSync(path.join(out, 'RELEASE-NOTES.md'), notes);

console.log('Release directory: ' + path.resolve(out));
for (const file of copied) console.log('  + ' + path.basename(file));
if (missing.length) {
  console.warn('\nMissing artifacts (build them before releasing):');
  for (const name of missing) console.warn('  - ' + name);
  process.exitCode = 1;
} else {
  console.log('\nAll four artifacts present. Attach the files in ' + path.resolve(out) + ' to the GitHub release.');
}
