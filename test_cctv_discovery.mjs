import hikvisionService from './services/hikvisionService.js';

// Test device credentials
const testDevice = {
  ip: '172.16.11.4',
  port: 80,
  username: 'admin',
  password: 't34m1tppt',
  isHttps: false
};

console.log('═══════════════════════════════════════════════════════════');
console.log('CCTV DEVICE DISCOVERY TEST');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Testing device: ${testDevice.ip}:${testDevice.port}`);
console.log(`Username: ${testDevice.username}`);
console.log('');

async function testDiscovery() {
  try {
    console.log('[TEST] Starting auto-discovery...');
    console.log('');

    const result = await hikvisionService.autoDiscoverDevice(
      testDevice.ip,
      testDevice.port,
      testDevice.username,
      testDevice.password,
      testDevice.isHttps
    );

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('DISCOVERY RESULTS');
    console.log('═══════════════════════════════════════════════════════════');
    
    if (result.success) {
      console.log('✅ Discovery SUCCESSFUL');
      console.log('');
      
      // Device Info
      console.log('📱 DEVICE INFORMATION:');
      console.log('─────────────────────────────────────────────────────────');
      if (result.data.device) {
        console.log(`  Device Name    : ${result.data.device.deviceName || 'N/A'}`);
        console.log(`  Model          : ${result.data.device.deviceModel || 'N/A'}`);
        console.log(`  Type           : ${result.data.device.deviceType || 'N/A'}`);
        console.log(`  Serial Number  : ${result.data.device.serialNumber || 'N/A'}`);
        console.log(`  Firmware       : ${result.data.device.firmwareVersion || 'N/A'}`);
        console.log(`  MAC Address    : ${result.data.device.macAddress || 'N/A'}`);
        console.log(`  Manufacturer   : ${result.data.device.manufacturer || 'N/A'}`);
        console.log(`  Local Time     : ${result.data.device.localTime || 'N/A'}`);
        console.log(`  Time Zone      : ${result.data.device.timeZone || 'N/A'}`);
      } else {
        console.log('  ⚠️  No device information retrieved');
      }
      console.log('');

      // Channels
      console.log('📹 CHANNELS:');
      console.log('─────────────────────────────────────────────────────────');
      if (result.data.channels && result.data.channels.length > 0) {
        console.log(`  Total Channels : ${result.data.channels.length}`);
        console.log('');
        result.data.channels.forEach((channel, index) => {
          console.log(`  Channel #${index + 1}:`);
          console.log(`    ID           : ${channel.id || 'N/A'}`);
          console.log(`    Name         : ${channel.channel_name || channel.name || 'N/A'}`);
          console.log(`    Status       : ${channel.status || 'N/A'}`);
          console.log(`    Enabled      : ${channel.is_enabled !== undefined ? channel.is_enabled : channel.enabled || 'N/A'}`);
          console.log(`    IP Address   : ${channel.ipAddress || 'N/A'}`);
          console.log(`    Resolution   : ${channel.resolution || 'N/A'}`);
          console.log(`    Codec        : ${channel.codec || 'N/A'}`);
          console.log(`    Transport    : ${channel.transport || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('  ⚠️  No channels found');
      }
      console.log('');

      // Storage
      console.log('💾 STORAGE:');
      console.log('─────────────────────────────────────────────────────────');
      if (result.data.storage && result.data.storage.length > 0) {
        console.log(`  Total Disks    : ${result.data.storage.length}`);
        console.log('');
        result.data.storage.forEach((storage, index) => {
          const capacityGB = (storage.capacity / (1024 * 1024 * 1024)).toFixed(2);
          const usedGB = (storage.usedSpace / (1024 * 1024 * 1024)).toFixed(2);
          const freeGB = (storage.freeSpace / (1024 * 1024 * 1024)).toFixed(2);
          
          console.log(`  Disk #${index + 1}:`);
          console.log(`    ID           : ${storage.id || 'N/A'}`);
          console.log(`    Name         : ${storage.name || 'N/A'}`);
          console.log(`    Type         : ${storage.type || 'N/A'}`);
          console.log(`    Status       : ${storage.status || 'N/A'}`);
          console.log(`    Capacity     : ${capacityGB} GB (${storage.capacity} MB)`);
          console.log(`    Used         : ${usedGB} GB (${storage.usedSpace} MB)`);
          console.log(`    Free         : ${freeGB} GB (${storage.freeSpace} MB)`);
          console.log(`    Usage        : ${storage.usagePercentage}%`);
          console.log(`    Property     : ${storage.property || 'N/A'}`);
          console.log('');
        });
      } else {
        console.log('  ⚠️  No storage information retrieved');
      }

      // Errors
      if (result.data.errors && result.data.errors.length > 0) {
        console.log('');
        console.log('⚠️  ERRORS ENCOUNTERED:');
        console.log('─────────────────────────────────────────────────────────');
        result.data.errors.forEach(error => {
          console.log(`  • ${error}`);
        });
      }

    } else {
      console.log('❌ Discovery FAILED');
      console.log(`Error: ${result.error || 'Unknown error'}`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST COMPLETED');
    console.log('═══════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('');
    console.error('❌ TEST ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testDiscovery();
