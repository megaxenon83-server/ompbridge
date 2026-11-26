const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { version } = require('../package.json');

const root = path.join(__dirname, '..');
const electron = path.join(root, 'node_modules', 'electron', 'dist');
const dist = path.join(root, 'dist', version);
const name = 'OMP Desktop';
const target = path.join(dist, name);
const source = path.join(target, 'resources', 'app');
const archive = path.join(dist, 'OMP-Desktop-' + version + '-win-' + process.arch + '.zip');

if (process.platform !== 'win32' || !fs.existsSync(path.join(electron, 'electron.exe'))) {
  throw new Error('Windows-versjonen av Electron må være installert før bygging.');
}
fs.mkdirSync(dist, { recursive: true });
if (fs.realpathSync(dist) !== dist || (fs.existsSync(target) && fs.realpathSync(target) !== target)) {
  throw new Error('Byggemappen må ligge direkte under prosjektet.');
}
fs.rmSync(target, { force: true, recursive: true });
fs.cpSync(electron, target, { recursive: true });
fs.renameSync(path.join(target, 'electron.exe'), path.join(target, name + '.exe'));
fs.rmSync(path.join(target, 'resources', 'default_app.asar'), { force: true });
fs.mkdirSync(source, { recursive: true });
for (const file of ['package.json', 'omp-recovery.yml', 'main.cjs', 'omp.cjs', 'bridge.cjs', 'mobile-pairing.cjs', 'wol-relay.cjs', 'local-models.cjs', 'model-catalogue.cjs', 'providers.cjs', 'workspace.cjs', 'project-panel.cjs', 'project-panel.js', 'preload.cjs', 'index.html', 'style.css', 'app.js', 'tool-filter.mjs', 'turn-changes.cjs', 'android/assets/interface.js', 'android/assets/interface.css', 'android/assets/turn-ui.js', 'android/assets/voice-mode.js', 'android/assets/turn-ui.css', 'scripts/patch-bridge-turns.cjs', 'skills-portal.cjs', 'skills-portal/index.html', 'skills-portal/portal.css', 'skills-portal/portal.js']) {
  fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
  fs.copyFileSync(path.join(root, file), path.join(source, file));
}
const dependencies = execFileSync(process.execPath, [process.env.npm_execpath, 'ls', '--omit=dev', '--parseable', '--all', '--silent'], {
  cwd: root, encoding: 'utf8'
}).trim().split(/\r?\n/);
for (const directory of dependencies) {
  const relative = path.relative(root, directory);
  if (relative.startsWith('node_modules' + path.sep)) fs.cpSync(directory, path.join(source, relative), { recursive: true });
}
execFileSync('tar.exe', ['-a', '-c', '-f', archive, '-C', dist, name], { stdio: 'inherit' });
console.log(archive);
