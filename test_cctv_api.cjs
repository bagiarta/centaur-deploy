// Test CCTV API Endpoints
require('dotenv').config();

const BASE_URL = 'http://localhost:3001';

// Test credentials
const TEST_DEVICE = {
  ipAddress: '172.16.13.68',
  port: 80,
  username: 'admin',
  password: 'Ppt@8899',
  isHttps: false
};

async function testAPI() {
  console.log('🧪 TESTING CCTV API ENDPOINTS\n');
  console.log('='.repeat(60));

  try {
    // Test 1: Get Locations
    console.log('\n📍 Test 1: Get Locations from DimStore');
    const locationsRes = await fetch(`${BASE_URL}/api/cctv/locations`);
    const locationsData = await locationsRes.json();
    console.log(`✅ Status: ${locationsRes.status}`);
    console.log(`✅ Found ${locationsData.data?.length || 0} locations`);
    if (locationsData.data?.length > 0) {
      console.log(`   First location: ${locationsData.data[0].name} (${locationsData.data[0].id})`);
    }

    // Test 2: Test Connection
    console.log('\n🔌 Test 2: Test Connection to Device');
    const testConnRes = await fetch(`${BASE_URL}/api/cctv/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_DEVICE)
    });
    const testConnData = await testConnRes.json();
    console.log(`${testConnRes.ok ? '✅' : '❌'} Status: ${testConnRes.status}`);
    if (testConnRes.ok) {
      console.log(`✅ Message: ${testConnData.message}`);
      if (testConnData.data) {
        console.log(`   Device: ${testConnData.data.deviceName || 'N/A'}`);
        console.log(`   Model: ${testConnData.data.deviceModel || 'N/A'}`);
      }
    } else {
      console.log(`❌ Error: ${testConnData.error}`);
    }

    // Test 3: Auto-Discover Device
    console.log('\n🔍 Test 3: Auto-Discover Device Info');
    const discoverRes = await fetch(`${BASE_URL}/api/cctv/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TEST_DEVICE)
    });
    const discoverData = await discoverRes.json();
    console.log(`${discoverRes.ok ? '✅' : '❌'} Status: ${discoverRes.status}`);
    if (discoverRes.ok) {
      console.log(`✅ Discovery successful!`);
      console.log(`   Device: ${discoverData.data.device?.deviceName || 'N/A'}`);
      console.log(`   Model: ${discoverData.data.device?.deviceModel || 'N/A'}`);
      console.log(`   Firmware: ${discoverData.data.device?.firmwareVersion || 'N/A'}`);
      console.log(`   Channels: ${discoverData.data.channels?.length || 0}`);
      console.log(`   Storage: ${discoverData.data.storage?.length || 0}`);
      
      if (discoverData.data.channels?.length > 0) {
        const onlineChannels = discoverData.data.channels.filter(ch => ch.online === 'true').length;
        console.log(`   → ${onlineChannels} channels online`);
      }
      
      if (discoverData.data.storage?.length > 0) {
        discoverData.data.storage.forEach((storage, idx) => {
          const capacityTB = (storage.capacity / 1024 / 1024).toFixed(2);
          console.log(`   → HDD ${idx + 1}: ${capacityTB} TB (${storage.status})`);
        });
      }
    } else {
      console.log(`❌ Error: ${discoverData.error}`);
    }

    // Test 4: Get All Devices
    console.log('\n📋 Test 4: Get All Devices');
    const devicesRes = await fetch(`${BASE_URL}/api/cctv/devices`);
    const devicesData = await devicesRes.json();
    console.log(`✅ Status: ${devicesRes.status}`);
    console.log(`✅ Found ${devicesData.data?.length || 0} devices`);
    if (devicesData.data?.length > 0) {
      const onlineCount = devicesData.data.filter(d => d.status === 'online').length;
      const offlineCount = devicesData.data.filter(d => d.status === 'offline').length;
      console.log(`   → ${onlineCount} online, ${offlineCount} offline`);
      
      // Show first 3 devices
      devicesData.data.slice(0, 3).forEach((device, idx) => {
        console.log(`   ${idx + 1}. ${device.name} - ${device.ip_address} (${device.status})`);
      });
    }

    // Test 5: Get Dashboard
    console.log('\n📊 Test 5: Get Dashboard Statistics');
    const dashboardRes = await fetch(`${BASE_URL}/api/cctv/dashboard`);
    const dashboardData = await dashboardRes.json();
    console.log(`✅ Status: ${dashboardRes.status}`);
    if (dashboardRes.ok && dashboardData.data) {
      const stats = dashboardData.data;
      console.log(`   Devices: ${stats.devices.total_devices} total, ${stats.devices.online_devices} online`);
      console.log(`   Channels: ${stats.channels.total_channels} total, ${stats.channels.online_channels} online`);
      console.log(`   Storage: ${stats.storage.total_disks} disks, ${stats.storage.normal_disks} normal`);
      console.log(`   Locations with devices: ${stats.byLocation?.length || 0}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS COMPLETED!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.log('\n💡 Make sure the server is running: npm start');
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

// Main
(async () => {
  console.log('Checking if server is running...\n');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('❌ Server is not running!');
    console.log('💡 Please start the server first:');
    console.log('   cd f:\\PepiUpdater\\centaur-deploy');
    console.log('   npm start\n');
    process.exit(1);
  }
  
  console.log('✅ Server is running!\n');
  await testAPI();
})();
