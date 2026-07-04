// Test adding CCTV device with auto-discovery via API

const testDevice = {
  name: 'BIGM KAPAL TEST',
  deviceType: 'IPC',
  vendor: 'Hikvision',
  ipAddress: '172.16.11.4',
  port: 80,
  username: 'admin',
  password: 't34m1tppt',
  isHttps: false,
  locationId: '', // Empty for now
  autoDiscover: true
};

console.log('═══════════════════════════════════════════════════════════');
console.log('TEST: Add CCTV Device with Auto-Discovery');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Device: ${testDevice.ipAddress}:${testDevice.port}`);
console.log(`Type: ${testDevice.deviceType}`);
console.log('');

async function testAddDevice() {
  try {
    console.log('[TEST] Sending POST request to /api/cctv/devices...');
    
    const response = await fetch('http://localhost:3001/api/cctv/devices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testDevice)
    });

    const result = await response.json();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('API RESPONSE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Status:', response.status);
    console.log('');

    if (response.ok) {
      console.log('✅ SUCCESS!');
      console.log('');
      console.log('Device Added:');
      console.log(`  ID: ${result.data.id}`);
      console.log(`  Name: ${result.data.name}`);
      console.log(`  Type: ${result.data.deviceType}`);
      console.log(`  IP: ${result.data.ipAddress}`);
      console.log(`  Auto-discovered: ${result.data.autoDiscovered}`);
      console.log(`  Channels found: ${result.data.channels}`);
      console.log(`  Storage found: ${result.data.storage}`);
    } else {
      console.log('❌ FAILED!');
      console.log('Error:', result.error || result.message);
    }

    console.log('');
    console.log('Full Response:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('');
    console.error('❌ REQUEST ERROR:', error.message);
  }
}

testAddDevice();
