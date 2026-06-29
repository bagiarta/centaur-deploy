// Test Hikvision ISAPI Connection with Digest Auth
const DigestFetch = require('digest-fetch');

const IP = '172.16.13.68';
const PORT = 80;
const USERNAME = 'admin';
const PASSWORD = 'Ppt@8899';

const client = new DigestFetch(USERNAME, PASSWORD, {
  algorithm: 'MD5'
});

async function testEndpoint(endpoint) {
  const url = `http://${IP}:${PORT}${endpoint}`;
  
  console.log(`\n[TEST] ${endpoint}`);
  console.log(`URL: ${url}`);
  
  try {
    const response = await client.fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/xml',
        'Accept': '*/*'
      }
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`✅ SUCCESS!`);
      console.log(`Response length: ${text.length} bytes`);
      console.log('First 1000 chars:');
      console.log(text.substring(0, 1000));
      return { success: true, data: text };
    } else {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText.substring(0, 500));
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('HIKVISION ISAPI CONNECTION TEST - DIGEST AUTH');
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

  const results = {};
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    results[endpoint] = result.success;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  for (const [endpoint, success] of Object.entries(results)) {
    console.log(`${success ? '✅' : '❌'} ${endpoint}`);
  }
  
  console.log('='.repeat(60));
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
