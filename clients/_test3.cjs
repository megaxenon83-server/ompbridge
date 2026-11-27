const http = require('node:http');
http.get('http://100.110.243.76:51174/y6EcTALJGxCd2RlNQMovja%2FEcl9tjA', res => {
  let total = 0;
  res.on('data', d => { total += d.length; });
  res.on('end', () => console.log('status=' + res.statusCode + ' bytes=' + total));
}).on('error', e => console.log('err=' + e.message));
