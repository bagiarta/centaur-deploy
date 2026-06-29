// Test Hikvision ISAPI Connection
const fetch = require('node-fetch');
const https = require('https');

const IP = '172.16.13.68';
const PORT = 80;
const USERNAME = 'admin';
const PASSWORD = 'Ppt@8899';

// Disable SSL verification
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

function createAuthHeader(username, password) {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

async function testEndpoint(endpoint) {
  const url = `http://${IP}:${PORT}${endpoint}`;
  
  console.log(`\n[TEST] ${endpoint}`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': createAuthHeader(USERNAME, PASSWORD),
        'Content-Type': 'application/xml',
        'Accept': '*/*'
      },
      timeout: 15000
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`Response length: ${text.length} bytes`);
      console.log('First 500 chars:', text.substring(0, 500));
      return { success: true, data: text };
    } else {
      const errorText = await response.text();
      console.log('Error response:', errorText.substring(0, 500));
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log(`Error: ${error.message}`);
    console.log('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('HIKVISION ISAPI CONNECTION TEST');
  console.log('='.repeat(60));
  console.log(`Device: ${IP}:${PORT}`);
  console.log(`Username: ${USERNAME}`);
  console.log(`Password: ${'*'.repeat(PASSWORD.length)}`);
  console.log('='.repeat(60));

  const endpoints = [
    '/ISAPI/System/status',
    '/ISAPI/System/deviceInfo',
    '/ISAPI/ContentMgmt/InputProxy/channels/status',
    '/ISAPI/ContentMgmt/InputProxy/channels',
    '/ISAPI/Smart/storageDetection',
    '/ISAPI/ContentMgmt/Storage'
  ];

  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between requests
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST COMPLETE');
  console.log('='.repeat(60));
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
