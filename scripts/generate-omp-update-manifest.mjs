#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

function usage() {
  console.error('Usage: generate-omp-update-manifest.mjs --artifacts <dir> --tag <vX.Y.Z> --android-version <ver> [--android-version-code <code>] [--base-url <url>] [--out <file>]');
  process.exit(1);
}

const args = process.argv.slice(2);
function get(flag, def = '') {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] ?? def) : def;
}
const artifactsDir = get('--artifacts');
const tag = get('--tag');
const androidVersion = get('--android-version');
const androidVersionCode = parseInt(get('--android-version-code', '0'), 10) || 0;
const baseUrl = (get('--base-url', 'https://omp.nimay.net')).replace(/\/$/, '');
const outFile = get('--out');
if (!artifactsDir || !tag || !androidVersion) usage();
const bridgeVersion = tag.replace(/^v/, '');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(artifactsDir);
function findOne(pred) { return files.find(pred); }

const shaPath = findOne(p => path.basename(p) === 'SHA256SUMS');
const shaMap = new Map();
if (shaPath) {
  const txt = fs.readFileSync(shaPath, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (m) shaMap.set(path.basename(m[2].trim()), m[1].toLowerCase());
  }
}

function shaFor(name) {
  if (shaMap.has(name)) return shaMap.get(name);
  const side = findOne(p => path.basename(p) === name + '.sha256');
  if (side) {
    const m = fs.readFileSync(side, 'utf8').match(/^([a-f0-9]{64})/i);
    if (m) return m[1].toLowerCase();
  }
  return '';
}

const apkName = `nimay-omp-chat-android-${androidVersion}.apk`;
const apkPath = findOne(p => path.basename(p) === apkName);
const winName = `Nimay-OMP-Chat-Bridge-Setup-${bridgeVersion}.exe`;
const debName = `nimay-omp-chat-bridge_${bridgeVersion}_amd64.deb`;
const rpmName = `nimay-omp-chat-bridge-${bridgeVersion}-1.x86_64.rpm`;
const flatpakName = `com.nimay.OMPChat-${bridgeVersion}.flatpak`;
const tarName = 'nimay-omp-chat-bridge-linux-x86_64.tar.gz';

function dl(fileName) { return `${baseUrl}/downloads/${tag}/${fileName}`; }

const manifest = {
  schemaVersion: 1,
  product: 'Nimay OMP Chat',
  releaseTag: tag,
  publishedAt: new Date().toISOString(),
  releaseUrl: `https://github.com/megaxenon83-server/ompbridge/releases/tag/${tag}`,
  notesUrl: `https://github.com/megaxenon83-server/ompbridge/releases/tag/${tag}`,
  app: {
    name: 'Nimay OMP Chat (Android)',
    versionName: androidVersion,
    versionCode: androidVersionCode,
    fileName: apkName,
    url: dl(apkName),
    sha256: shaFor(apkName),
    changelog: `Android release ${androidVersion} for bridge ${tag}.`
  },
  bridge: {
    name: 'Nimay OMP Chat Bridge',
    version: bridgeVersion,
    changelog: `Bridge release ${tag}.`,
    downloads: {
      windows: { label: 'Windows Installer (.exe)', fileName: winName, url: dl(winName), sha256: shaFor(winName) },
      deb: { label: 'Debian/Ubuntu (.deb)', fileName: debName, url: dl(debName), sha256: shaFor(debName) },
      rpm: { label: 'Fedora/RHEL (.rpm)', fileName: rpmName, url: dl(rpmName), sha256: shaFor(rpmName) },
      flatpak: { label: 'Flatpak (.flatpak)', fileName: flatpakName, url: dl(flatpakName), sha256: shaFor(flatpakName) },
      linux: { label: 'Linux tarball (.tar.gz)', fileName: tarName, url: dl(tarName), sha256: shaFor(tarName) }
    },
    checksumsUrl: dl('SHA256SUMS')
  }
};

if (!apkPath) console.error('Warning: APK not found in artifacts:', apkName);
const missingSha = [apkName, winName, debName, rpmName, flatpakName, tarName].filter(n => !shaFor(n));
if (missingSha.length) console.error('Warning: missing SHA256 for', missingSha.join(', '));

const json = JSON.stringify(manifest, null, 2) + '\n';
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, json, 'utf8');
} else {
  process.stdout.write(json);
}
