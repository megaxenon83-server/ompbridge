const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const input = path.resolve(process.argv[2] || '');
if (path.basename(input) !== 'omp-bridge.mjs' || !fs.existsSync(input)) {
  throw new Error('Oppgi stien til den installerte omp-bridge.mjs.');
}

const source = fs.readFileSync(input, 'utf8');
if (/\bfunction\s+clientPath\s*\(|\b(?:const|let)\s+clientPath\s*=/.test(source)) {
  console.log('Bridge har allerede en stihjelper.');
  process.exit(0);
}
if (!source.includes('case "GET /api/files/read"') || !source.includes('const cwd = clientPath(') ||
    !source.includes('function existingDir(value) {')) {
  throw new Error('Bridge-filen samsvarer ikke med utgaven denne rettelsen gjelder.');
}

const helper = String.raw`function clientPath(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) return null;
  if (process.platform === "win32") {
    // Reject device namespaces and drive-relative paths.
    if (/^[\\/]{2}[?.][\\/]/.test(value)) return null;
    if (!/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(value)) return null;
  } else if (!path.isAbsolute(value)) return null;
  return path.resolve(value);
}

`;
const fixed = source.replace('function existingDir(value) {', helper + 'function existingDir(value) {');
if (process.argv[3] !== '--apply') {
  if (!process.argv[3]) throw new Error('Oppgi en utfil for validering, eller bruk --apply.');
  const output = path.resolve(process.argv[3]);
  if (output === input) throw new Error('Bruk separat utfil for validering.');
  fs.writeFileSync(output, fixed);
  execFileSync(process.execPath, ['--check', output], { stdio: 'inherit' });
  console.log('Bridge-rettelsen bestod syntakskontrollen.');
  process.exit(0);
}
const backup = input + '.bak-chat-omp-' + Date.now();
fs.copyFileSync(input, backup, fs.constants.COPYFILE_EXCL);
fs.writeFileSync(input, fixed);
try { execFileSync(process.execPath, ['--check', input], { stdio: 'inherit' }); }
catch (error) { fs.copyFileSync(backup, input); throw error; }
console.log('Bridge-stihjelper lagt til. Sikkerhetskopi: ' + backup);
