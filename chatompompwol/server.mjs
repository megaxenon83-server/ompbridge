import { timingSafeEqual } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';
import { isIPv4 } from 'node:net';

const { WOL_TOKEN: token, WOL_BIND: bind, WOL_BROADCAST: broadcast = '255.255.255.255' } = process.env;
if (!/^[A-Za-z0-9_-]{32,128}$/.test(token ?? '') || !isIPv4(bind) || !isIPv4(broadcast)) {
  throw new Error('Configure WOL_TOKEN, WOL_BIND and an IPv4 WOL_BROADCAST.');
}
const expected = Buffer.from('Bearer ' + token);
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

function reply(res, status, error) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(error ? { ok: false, error } : { ok: true }));
}

createServer({ requestTimeout: 5000, headersTimeout: 5000 }, async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/wake') return reply(res, 404, 'Ukjent Wake-on-LAN-handling.');
  const authorization = Buffer.from(req.headers.authorization ?? '');
  if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) {
    return reply(res, 401, 'Wake-on-LAN-reléet avviste tilkoblingen. Skann en ny QR-kode.');
  }
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
  if (typeof mac !== 'string' || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac) ||
    ['00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff'].includes(mac.toLowerCase())) {
    return reply(res, 400, 'Ugyldig MAC-adresse.');
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
