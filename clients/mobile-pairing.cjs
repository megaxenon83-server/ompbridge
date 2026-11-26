const { createServer } = require('node:http');
const { randomBytes, createCipheriv } = require('node:crypto');
const { networkInterfaces } = require('node:os');
const QRCode = require('qrcode');

const lifetime = 120000;
let current;

function pairingAddresses() {
  const list = Object.values(networkInterfaces()).flat().filter(item => item.family === 'IPv4' && !item.internal);
  return [{ address: '10.0.2.2', label: 'Android-emulator' }, ...list.map(item => ({ address: item.address, label: item.address }))];
}

function closePairing() {
  if (current) {
    clearTimeout(current.timer);
    current.server.close();
    current = undefined;
  }
}

async function createPairing(bridge, address) {
  if (!pairingAddresses().some(item => item.address === address)) throw new Error('Velg en av PC-ens lokale nettverksadresser.');
  const allowed = new URL(bridge.origin);
  if (!['127.0.0.1', 'localhost'].includes(allowed.hostname)) throw new Error('Mobilparing krever en lokal bridge.');
  await bridge.get('/api/health');
  let wol;
  try {
    wol = await bridge.get('/api/wol/pairing', { address });
  } catch {
    // Older bridges still support chat pairing.
  }
  closePairing();
  const nonce = randomBytes(22).toString('base64url');
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  allowed.hostname = address;
  const encrypted = Buffer.concat([
    iv, cipher.update(JSON.stringify({ origin: allowed.origin, credential: bridge.token, wol }), 'utf8'), cipher.final(), cipher.getAuthTag()
  ]).toString('base64url');
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/' + nonce || current?.server !== server) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(encrypted);
    closePairing();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, address === '10.0.2.2' ? '127.0.0.1' : address, resolve);
  });
  const timer = setTimeout(() => { if (current?.server === server) closePairing(); }, lifetime);
  timer.unref();
  current = { server, timer };
  const data = { address, port: server.address().port, nonce, key: key.toString('base64url') };
  const link = 'chatomp://pair/' + Buffer.from(JSON.stringify(data)).toString('base64url');
  try {
    return { link, image: await QRCode.toDataURL(link, { margin: 3, width: 330, errorCorrectionLevel: 'M' }), seconds: lifetime / 1000 };
  } catch (error) {
    closePairing();
    throw error;
  }
}

module.exports = { pairingAddresses, createPairing, closePairing };
