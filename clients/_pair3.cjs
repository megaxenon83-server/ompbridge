const fs = require('node:fs');
const { createServer } = require('node:http');
const { randomBytes, createCipheriv } = require('node:crypto');
const cfg = JSON.parse(fs.readFileSync('C:/Users/Megaxenon/AppData/Local/Nimay/OMPBridge/bridge/config.json','utf8'));
const address = '100.110.243.76';
const port = cfg.port || 27778;
const nonce = randomBytes(22).toString('base64url');
const key = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const origin = 'http://' + address + ':' + port;
const encrypted = Buffer.concat([iv, cipher.update(JSON.stringify({ origin, credential: cfg.token, wol: null }), 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
const server = createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/' + nonce) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(encrypted);
  console.log('PAIR_FETCHED');
});
server.on('error', e => { console.error('LISTEN_ERR ' + e.message); process.exit(1); });
server.listen(0, address, () => {
  const p = server.address().port;
  const data = { address, port: p, nonce, key: key.toString('base64url') };
  const link = 'chatomp://pair/' + Buffer.from(JSON.stringify(data)).toString('base64url');
  fs.writeFileSync('C:/Prosjekter/Inkling/tools/_pairlink_ts.txt', link, 'utf8');
  console.log('LINK=' + link);
  setTimeout(() => process.exit(0), 600000);
});
