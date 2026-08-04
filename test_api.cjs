const http = require('http');

const data = JSON.stringify({
  custom_name: 'Test Name',
  is_empty_slot: true
});

const options = {
  hostname: 'localhost',
  port: 9001,
  path: '/api/cctv/devices',
  method: 'GET',
};

const req = http.request(options, res => {
  console.log('statusCode:', res.statusCode);
  res.on('data', d => {
    process.stdout.write(d.toString().substring(0, 100) + '\n');
  });
});
req.on('error', error => {
  console.error(error);
});
req.end();