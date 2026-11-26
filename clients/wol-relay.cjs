const { createSocket } = require('node:dgram');
const { isIPv4 } = require('node:net');
const { networkInterfaces } = require('node:os');

const privateAddress = address => isIPv4(address) && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);

function adapters() {
  return Object.entries(networkInterfaces())
    .filter(([name]) => !/wi-?fi|wlan|wireless|tailscale|wireguard|vpn|virtual|vmware|vethernet|loopback/i.test(name))
    .flatMap(([label, entries]) => entries.filter(item => item.family === 'IPv4' && !item.internal && privateAddress(item.address))
      .map(item => ({ ...item, label })));
}

async function discoverRelays() {
  const found = new Map();
  const targets = new Set(adapters().map(({ address, netmask }) => {
    const mask = netmask.split('.');
    return address.split('.').map((octet, i) => Number(octet) | (255 ^ Number(mask[i]))).join('.');
  }));
  if (!targets.size) return [];
  await new Promise(resolve => {
    const socket = createSocket('udp4');
    const timer = setTimeout(finish, 1700);
    function finish() {
      clearTimeout(timer);
      socket.removeListener('error', finish);
      socket.close();
      resolve();
    }
    socket.on('error', finish);
    socket.on('message', (message, peer) => {
      if (!privateAddress(peer.address) || peer.port !== 27779 || message.length > 512) return;
      try {
        const info = JSON.parse(message);
        if (info.service === 'chatompompwol') found.set(peer.address, { address: peer.address, name: String(info.name || peer.address).slice(0, 64) });
      } catch {}
    });
    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
        for (const address of targets) socket.send('chatompompwol-discover-v1', 27779, address);
      } catch { finish(); }
    });
  });
  return [...found.values()];
}

async function connectRelay(bridge, { relayAddress, adapterAddress, allowShutdown }) {
  relayAddress = String(relayAddress || '').trim().replace(/^http:\/\//, '').replace(/:27779\/?$/, '');
  if (!privateAddress(relayAddress)) throw new Error('Oppgi lokal IPv4-adresse til reléet.');
  const adapter = adapters().find(item => item.address === adapterAddress);
  if (!adapter) throw new Error('Velg PC-ens Ethernet-adresse.');
  const relayUrl = 'http://' + relayAddress + ':27779';
  const port = 27779;
  const result = await new Promise((resolve, reject) => {
    const req = require('node:http').request({
      hostname: relayAddress, port, path: '/enroll', method: 'POST', localAddress: adapter.address,
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000)
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        data += chunk;
        if (data.length > 4096) req.destroy(new Error('Ugyldig svar fra reléet.'));
      });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode !== 200 || !/^[A-Za-z0-9_-]{43}$/.test(response.relayToken || '')) {
            throw new Error(response.error || 'Oppdater chatompompwol på reléverten.');
          }
          resolve(response);
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify({ mac: adapter.mac }));
  });
  await bridge.post('/api/wol/config', { relayUrl, relayToken: result.relayToken, mac: adapter.mac, allowShutdown });
  return { address: adapter.address };
}

module.exports = { adapters, discoverRelays, connectRelay };
