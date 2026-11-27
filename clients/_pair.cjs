const fs = require('node:fs');
const { Bridge } = require('./bridge.cjs');
const { createPairing } = require('./mobile-pairing.cjs');
(async () => {
  const cfg = JSON.parse(fs.readFileSync('C:/Users/Megaxenon/AppData/Local/Nimay/OMPBridge/bridge/config.json','utf8'));
  const bridge = new Bridge('http://127.0.0.1:' + (cfg.port || 27778), cfg.token);
  const { link } = await createPairing(bridge, '10.0.2.2');
  console.log(link);
  const payload = link.replace('chatomp://pair/','');
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  console.log('ORIGIN=' + json.origin);
  setTimeout(() => process.exit(0), 120000);
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
