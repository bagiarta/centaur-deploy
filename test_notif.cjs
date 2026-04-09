const http = require('http');

const data = JSON.stringify({
  id: "NOTIF-TEST-" + Date.now().toString().slice(-4),
  title: "⚠️ NETWORK STATUS CHECK",
  description: "Automated test for helpdesk notification system.",
  category: "Network",
  priority: "High",
  outlet_name: "SYSTEM_ALARM",
  hostname: "SERVER_MONITOR",
  created_by: "SystemDiagnostic"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/tickets',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (error) => {
  console.error('Error sending test notification:', error);
});

req.write(data);
req.end();
