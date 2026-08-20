const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/crm/reports/wakeup-call',
  method: 'GET'
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    console.log(`BODY: ${data}`);
  });
});

req.on('error', error => {
  console.error(`HTTP ERROR: ${error.message}`);
});

req.end();
