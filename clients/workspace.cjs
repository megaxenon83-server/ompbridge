const { spawn } = require('node:child_process');
const { BrowserWindow, Menu, session } = require('electron');

async function openBrowser(address, parent) {
  const url = new URL(address);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Skriv inn en HTTP- eller HTTPS-adresse.');
  }
  const isolated = session.fromPartition('omp-preview');
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.setPermissionCheckHandler(() => false);
  const preview = new BrowserWindow({
    parent, width: 1100, height: 760, title: 'Nettleser · OMP Desktop',
    webPreferences: { session: isolated, sandbox: true, nodeIntegration: false, contextIsolation: true }
  });
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const history = preview.webContents.navigationHistory;
  preview.setMenu(Menu.buildFromTemplate([{
    label: 'Navigasjon', submenu: [
      { label: 'Tilbake', accelerator: 'Alt+Left', click: () => { if (history.canGoBack()) history.goBack(); } },
      { label: 'Fram', accelerator: 'Alt+Right', click: () => { if (history.canGoForward()) history.goForward(); } },
      { label: 'Last på nytt', accelerator: 'Ctrl+R', click: () => preview.webContents.reload() },
      { role: 'close', label: 'Lukk' }
    ]
  }]));
  const guard = (event, destination) => {
    if (!/^https?:\/\//i.test(destination)) event.preventDefault();
  };
  preview.webContents.on('will-navigate', guard);
  preview.webContents.on('will-redirect', guard);
  try { await preview.loadURL(url.href); }
  catch (error) {
    if (!preview.isDestroyed()) preview.close();
    throw error;
  }
}

class ProjectTerminal {
  constructor(cwd, onOutput) {
    this.child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '-'], { cwd, windowsHide: true });
    this.child.on('error', error => onOutput(error.message + '\n'));
    this.child.stdin.on('error', error => onOutput(error.message + '\n'));
    for (const pipe of [this.child.stdout, this.child.stderr]) {
      pipe.setEncoding('utf8').on('data', onOutput);
    }
  }

  send(command) {
    this.child.stdin.write(command + '\n');
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}

function hunks(diff) {
  const lines = diff.split('\n');
  const index = lines.findIndex(line => line.startsWith('@@ '));
  if (index < 0) return [];
  const header = lines.slice(0, index).filter(line => !/^(new file mode|deleted file mode|index )/.test(line));
  const patches = [];
  let body;
  for (const line of lines.slice(index)) {
    if (line.startsWith('@@ ')) {
      body = [line];
      patches.push(body);
    } else if (line && body) {
      body.push(line);
    }
  }
  return patches.map(patch => ({
    label: patch[0], text: patch.join('\n'),
    patch: [...header, ...patch].join('\n') + '\n'
  }));
}

module.exports = { openBrowser, ProjectTerminal, hunks };
