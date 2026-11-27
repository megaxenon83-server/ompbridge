const http = require('node:http');
const url = 'http://192.168.50.159:50262/rhTtU584j9VIoL7-GBGTBUQ_uMXFvQ';
http.get(url, res => {
  let total = 0;
  res.on('data', d => { total += d.length; });
  res.on('end', () => console.log('status=' + res.statusCode + ' bytes=' + total));
}).on('error', e => console.log('err=' + e.message));
