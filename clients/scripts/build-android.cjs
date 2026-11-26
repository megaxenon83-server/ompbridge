const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { version } = require('../package.json');

const root = path.join(__dirname, '..');
const source = path.join(root, 'android');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME || 'C:\\Android';
const tools = path.join(sdk, 'build-tools', '35.0.0');
const platform = path.join(sdk, 'platforms', 'android-35', 'android.jar');
const library = path.join(source, 'vendor', 'zxing-core-3.5.3.jar');
const output = path.join(root, 'dist', version);
const cache = path.join(root, '.android-build');
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const build = fs.mkdtempSync(path.join(cache, 'build-'));
const classes = path.join(build, 'classes');
const dex = path.join(build, 'dex');
for (const directory of [classes, dex]) fs.mkdirSync(directory);
if (!fs.existsSync(platform)) throw new Error('Android SDK-platform 35 mangler.');
if (!fs.existsSync(library)) throw new Error('Legg ZXing Core 3.5.3 i android/vendor.');
const hash = createHash('sha256').update(fs.readFileSync(library)).digest('hex');
if (hash !== '8d8064c1636fdaef7189dd9055c7d59950a8940a12f2293956446ec3c109fd82') {
  throw new Error('ZXing Core samsvarer ikke med den festede versjonen.');
}

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', cwd: root, windowsHide: true });
const apk = path.join(build, 'unsigned.apk');
const aligned = path.join(build, 'aligned.apk');
const resources = path.join(build, 'resources.zip');
const java = path.join(source, 'src', 'net', 'nimay', 'chatompomp');
const manifest = path.join(source, 'AndroidManifest.xml');
const androidVersion = fs.readFileSync(manifest, 'utf8').match(/android:versionName="([\d.]+)"/)[1];
run(path.join(tools, 'aapt2.exe'), ['compile', '--dir', path.join(source, 'res'), '-o', resources]);
run(path.join(tools, 'aapt2.exe'), ['link', '-I', platform, '--manifest', manifest,
  '-A', path.join(source, 'assets'), '-o', apk, resources]);
run('javac.exe', ['-encoding', 'UTF-8', '--release', '8', '-classpath', platform + ';' + library, '-d', classes,
  ...fs.readdirSync(java).filter(file => file.endsWith('.java')).map(file => path.join(java, file))]);
const classesJar = path.join(build, 'classes.jar');
run('jar.exe', ['cf', classesJar, '-C', classes, '.']);
run('java.exe', ['-cp', path.join(tools, 'lib', 'd8.jar'), 'com.android.tools.r8.D8',
  '--lib', platform, '--min-api', '26', '--output', dex, classesJar, library]);
run('jar.exe', ['uf', apk, '-C', dex, 'classes.dex']);
run(path.join(tools, 'zipalign.exe'), ['-f', '4', apk, aligned]);
const signing = path.join(cache, 'development.jks');
if (!fs.existsSync(signing)) {
  run('keytool.exe', ['-genkeypair', '-keystore', signing, '-storepass', 'android', '-keypass', 'android',
    '-alias', 'chat-omp-dev', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '3650', '-dname', 'CN=Chat OMP OMP Development']);
}
const signer = path.join(tools, 'lib', 'apksigner.jar');
const release = path.join(output, 'Chat-OMP-OMP-Android-' + androidVersion + '.apk');
run('java.exe', ['-jar', signer, 'sign', '--ks', signing, '--ks-pass', 'pass:android', '--v4-signing-enabled', 'false', '--out', release, aligned]);
run('java.exe', ['-jar', signer, 'verify', release]);
console.log(release);
