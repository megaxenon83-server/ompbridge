import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIPv4 } from 'node:net';
import { hostname, networkInterfaces } from 'node:os';

const defaultInterface = readFileSync('/proc/net/route', 'utf8').split('\n')
  .map(line => line.trim().split(/\s+/)).find(fields => fields[1] === '00000000')?.[0];
const bind = process.env.WOL_BIND || networkInterfaces()[defaultInterface]?.find(item => item.family === 'IPv4')?.address;
const broadcast = process.env.WOL_BROADCAST || '255.255.255.255';
const legacyToken = process.env.WOL_TOKEN || '';
if ((legacyToken && !/^[A-Za-z0-9_-]{32,128}$/.test(legacyToken)) || !isIPv4(bind) || !isIPv4(broadcast)) {
  throw new Error('Set WOL_BIND to the LAN IPv4 address if automatic detection fails.');
}
const keyFile = '/data/relay.key';
if (!legacyToken) {
  try { writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
const signingKey = legacyToken || readFileSync(keyFile);
const tokenFor = mac => createHmac('sha256', signingKey).update('chatompompwol:' + mac).digest('base64url');
const validMac = mac => typeof mac === 'string' && /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)
  && !/^(?:00:){5}00$|^(?:ff:){5}ff$/i.test(mac);
const info = { service: 'chatompompwol', name: hostname(), port: 27779 };
function deviceOwnsMac(address, mac) {
  return readFileSync('/proc/net/arp', 'utf8').split('\n').some(line => {
    const [ip, , flags, neighbor] = line.trim().split(/\s+/);
    return ip === address && (Number(flags) & 2) !== 0 && neighbor?.toLowerCase() === mac;
  });
}

const discovery = createSocket('udp4');
discovery.on('message', (message, peer) => {
  if (message.toString() === 'chatompompwol-discover-v1') {
    discovery.send(JSON.stringify(info), peer.port, peer.address);
  }
});
discovery.on('error', error => console.error('Wake-on-LAN discovery:', error.code));
discovery.bind(27779);
let lastWake = 0;

function sendPacket(mac) {
  const address = Buffer.from(mac.replaceAll(':', ''), 'hex');
  const packet = Buffer.concat([Buffer.alloc(6, 255), ...Array(16).fill(address)]);
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', error => {
      socket.close();
      reject(error);
    });
    socket.bind(0, bind, () => {
      try {
        socket.setBroadcast(true);
        socket.send(packet, 9, broadcast, error => {
          socket.close();
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        socket.close();
        reject(error);
      }
    });
  });
}

function reply(res, status, error, data = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(error ? { ok: false, error } : { ok: true, ...data }));
}

createServer({ requestTimeout: 5000, headersTimeout: 5000 }, async (req, res) => {
  if (req.method === 'GET' && req.url === '/info') return reply(res, 200, null, info);
  if (req.method !== 'POST' || !['/wake', '/enroll'].includes(req.url)) return reply(res, 404, 'Ukjent Wake-on-LAN-handling.');
  let mac;
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (body.length > 256) throw new Error('Request too large');
    }
    mac = JSON.parse(body).mac;
  } catch {
    return reply(res, 400, 'Ugyldig Wake-on-LAN-forespørsel.');
  }
  if (!validMac(mac)) return reply(res, 400, 'Ugyldig MAC-adresse.');
  mac = mac.toLowerCase();
  if (req.url === '/enroll') {
    if (!deviceOwnsMac(req.socket.remoteAddress, mac)) {
      return reply(res, 403, 'Koble PC-en med Ethernet til samme lokalnett som reléet.');
    }
    return reply(res, 200, null, { relayToken: tokenFor(mac) });
  }
  const authorization = Buffer.from(req.headers.authorization ?? '');
  const tokens = legacyToken ? [legacyToken, tokenFor(mac)] : [tokenFor(mac)];
  if (!tokens.some(token => {
    const expected = Buffer.from('Bearer ' + token);
    return authorization.length === expected.length && timingSafeEqual(authorization, expected);
  })) {
    return reply(res, 401, 'Wake-on-LAN-reléet avviste tilkoblingen. Skann en ny QR-kode.');
  }
  if (Date.now() - lastWake < 500) return reply(res, 429, 'Vent litt før du prøver igjen.');
  lastWake = Date.now();
  try {
    await sendPacket(mac);
    reply(res, 200);
  } catch (error) {
    console.error('Wake-on-LAN UDP send failed:', error.code ?? error.name);
    reply(res, 503, 'Reléet kunne ikke sende vekkesignalet.');
  }
}).listen(27779, bind);
