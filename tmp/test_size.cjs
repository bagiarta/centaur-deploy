const fs = require('fs');

const software = [];
for(let i=0; i<300; i++) {
  software.push({
    name: 'Test Application Long Name Version Pro Enterprise Edition ' + i,
    version: '10.0.1234.5678',
    publisher: 'Microsoft Corporation',
    install_date: '20250101'
  });
}

const payload = {
  device_id: 'DESKTOP-ABCDEF',
  software: software
};

const str = JSON.stringify(payload);
console.log('Size:', str.length, 'bytes');
