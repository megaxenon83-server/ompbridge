const { WebContentsView, session } = require('electron');
const { spawn, execFile } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const mime = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webm': 'video/webm'
}));

function localAddress(address) {
  let url;
  try { url = new URL(address); } catch {}
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Bruk en lokal HTTP-adresse, for eksempel http://localhost:3000.');
  }
  return url;
}

function projectDefaults(cwd) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch {}
  const scripts = data?.scripts || {};
  return {
    command: typeof scripts.dev === 'string' ? 'npm.cmd run dev' : '',
    address: /\bvite\b/.test(scripts.dev || '') ? 'http://localhost:5173' :
      typeof scripts.dev === 'string' ? 'http://localhost:3000' : '',
    staticPath: fs.existsSync(path.join(cwd, 'index.html')) ? '/' :
      fs.existsSync(path.join(cwd, 'docs', 'index.html')) ? '/docs/' : '/',
    test: typeof scripts.test === 'string' ? 'npm.cmd test' : ''
  };
}

async function serveProject(cwd) {
  const root = await fs.promises.realpath(cwd);
  const server = createServer(async (request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, headers).end(); return; }
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const name = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (name.includes('\\') || name.split('/').some(part => part.startsWith('.') || part.includes(':'))) {
        response.writeHead(403, headers).end(); return;
      }
      const file = await fs.promises.realpath(path.join(root, name, ...(url.pathname.endsWith('/') ? ['index.html'] : [])));
      const relative = path.relative(root, file);
      const type = mime.get(path.extname(file).toLowerCase());
      if (!type || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) ||
          relative.split(path.sep).some(part => part.startsWith('.')) || !(await fs.promises.stat(file)).isFile()) {
        response.writeHead(404, headers).end(); return;
      }
      response.writeHead(200, { ...headers, 'Content-Type': type });
      if (request.method === 'HEAD') { response.end(); return; }
      fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch { response.writeHead(404, headers).end('Fant ikke filen.'); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

function startCommand(cwd, command, onOutput, onDone) {
  if (typeof command !== 'string' || !command.trim() || command.length > 1000 || /[\r\n\0]/.test(command)) {
    throw new Error('Skriv inn én gyldig PowerShell-kommando.');
  }
  // Pass the command as an encoded script so Windows argument quoting is consistent.
  const script = `$ErrorActionPreference = 'Stop'; ${command}\nif ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64')], { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const pipe of [child.stdout, child.stderr]) pipe.setEncoding('utf8').on('data', onOutput);
  child.on('error', error => onOutput(error.message + '\n'));
  child.once('close', (code, signal) => onDone(code, signal));
  return child;
}

function stopCommand(child) {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, error => {
      if (error && child.exitCode === null) child.kill();
    });
  }
}

function createPreview(parent, onState) {
  const isolated = session.fromPartition('omp-project-preview');
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  isolated.on('will-download', event => event.preventDefault());
  const view = new WebContentsView({ webPreferences: {
    session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false
  } });
  parent.contentView.addChildView(view);
  view.setVisible(false);
  const contents = view.webContents;
  let allowed;
  let current;
  const guard = (event, destination) => {
    try { if (localAddress(destination).origin === allowed) return; } catch {}
    event.preventDefault();
  };
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('did-finish-load', () => { if (current) onState(current, { ready: true, url: contents.getURL() }); });

  return {
    async load(id, address) {
      const url = localAddress(address);
      current = id;
      allowed = url.origin;
      await contents.loadURL(url.href);
    },
    bounds(id, rect) {
      if (!rect || id !== current) { view.setVisible(false); return; }
      const [width, height] = parent.getContentSize();
      const x = Math.max(0, Math.min(width, Math.round(rect.x)));
      const y = Math.max(0, Math.min(height, Math.round(rect.y)));
      const w = Math.min(width - x, Math.round(rect.width));
      const h = Math.min(height - y, Math.round(rect.height));
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) { view.setVisible(false); return; }
      view.setBounds({ x, y, width: w, height: h });
      view.setVisible(true);
    },
    async pick(id) {
      if (current !== id || !localAddress(contents.getURL())) throw new Error('Åpne forhåndsvisningen først.');
      return contents.executeJavaScriptInIsolatedWorld(123, [{ code: `new Promise(resolve => {
        window.ompCancelPick?.();
        const style = document.createElement('style');
        style.textContent = '* { cursor: crosshair !important; } *:hover { outline: 1px dashed #729dff; outline-offset: -1px; }';
        document.documentElement.append(style);
        const finish = value => {
          clearTimeout(timer);
          document.removeEventListener('click', click, true);
          document.removeEventListener('keydown', key, true);
          style.remove();
          delete window.ompCancelPick;
          resolve(value);
        };
        const key = event => { if (event.key === 'Escape') finish(null); };
        const click = event => {
          if (!event.isTrusted || !(event.target instanceof Element)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const target = event.target;
          const labeled = target.closest('button, a, [role], label') || target;
          const ancestry = [];
          for (let node = labeled; node && ancestry.length < 5; node = node.parentElement) {
            if (node.id) { ancestry.unshift('#' + CSS.escape(node.id)); break; }
            const tag = node.localName;
            const peers = Array.from(node.parentElement?.children || []).filter(item => item.localName === tag);
            ancestry.unshift(tag + (peers.length > 1 ? ':nth-of-type(' + (peers.indexOf(node) + 1) + ')' : ''));
          }
          finish({ selector: ancestry.join(' > ').slice(0, 400),
            label: (labeled.getAttribute('aria-label') || labeled.alt || labeled.innerText || '').trim().slice(0, 180),
            path: location.pathname.slice(0, 300), width: innerWidth });
        };
        const timer = setTimeout(() => finish(null), 30000);
        window.ompCancelPick = () => finish(null);
        document.addEventListener('click', click, true);
        document.addEventListener('keydown', key, true);
      })` }]);
    },
    cancel() {
      return contents.executeJavaScriptInIsolatedWorld(123, [{ code: 'window.ompCancelPick?.(); void 0' }]);
    },
    close() { if (!contents.isDestroyed()) contents.close(); }
  };
}

module.exports = { localAddress, projectDefaults, serveProject, startCommand, stopCommand, createPreview };
