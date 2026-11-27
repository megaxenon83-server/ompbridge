const http = require('node:http');
const fs = require('node:fs');
const link = fs.readFileSync('C:/Prosjekter/Inkling/tools/_pairlink_ts.txt','utf8').trim();
const data = JSON.parse(Buffer.from(link.replace('chatomp://pair/',''), 'base64url').toString('utf8'));
console.log('nonce=' + data.nonce + ' address=' + data.address + ' port=' + data.port);
const url = 'http://' + data.address + ':' + data.port + '/' + data.nonce;
http.get(url, res => {
  let total = 0;
  res.on('data', d => { total += d.length; });
  res.on('end', () => console.log('fetch status=' + res.statusCode + ' bytes=' + total));
}).on('error', e => console.log('err=' + e.message));
