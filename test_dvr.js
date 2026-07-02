/**
 * Quick test script for DVR channel discovery
 * Device: 172.16.11.99 - "Embedded Net DVR"
 */

import hikvisionService from './services/hikvisionService.js';

const IP = '172.16.11.99';
const PORT = 80;
const USERNAME = 'admin';
const PASSWORD = 'Admin12345';
const IS_HTTPS = false;

async function runTest() {
  console.log('='.repeat(60));
  console.log(`Testing DVR: ${IP}:${PORT} (user=${USERNAME})`);
  console.log('='.repeat(60));

  // 1. Test connection
  console.log('\n[1] Testing connection...');
  const connResult = await hikvisionService.testConnection(IP, PORT, USERNAME, PASSWORD, IS_HTTPS);
  console.log('Connection result:', connResult);

  // 2. Get device info
  console.log('\n[2] Getting device info...');
  const deviceInfoResult = await hikvisionService.getDeviceInfo(IP, PORT, USERNAME, PASSWORD, IS_HTTPS);
  console.log('Device info:', JSON.stringify(deviceInfoResult.data || deviceInfoResult.error, null, 2));

  // 3. Get system time
  console.log('\n[3] Getting system time...');
  const timeResult = await hikvisionService.getSystemTime(IP, PORT, USERNAME, PASSWORD, IS_HTTPS);
  console.log('System time:', JSON.stringify(timeResult.data || timeResult.error, null, 2));

  // 4. Test DVR channel endpoint directly
  console.log('\n[4] Testing DVR channel endpoint /ISAPI/System/Video/inputs/channels...');
  const dvrChannels = await hikvisionService.getDVRChannels(IP, PORT, USERNAME, PASSWORD, IS_HTTPS);
  if (dvrChannels.success) {
    console.log(`Found ${dvrChannels.data.length} DVR channels:`);
    dvrChannels.data.forEach(ch => console.log(` - [${ch.channel_number}] ${ch.channel_name} (${ch.resolution || 'N/A'})`));
  } else {
    console.log('DVR channels FAILED:', dvrChannels.error);
  }

  // 5. Full auto-discover (should auto-detect DVR and use correct endpoint)
  console.log('\n[5] Full auto-discover (should auto-detect DVR)...');
  const discoverResult = await hikvisionService.autoDiscoverDevice(IP, PORT, USERNAME, PASSWORD, IS_HTTPS);
  console.log('Auto-discover result:', {
    success: discoverResult.success,
    deviceName: discoverResult.data?.device?.deviceName,
    deviceType: discoverResult.data?.device?.deviceType,
    channelsFound: discoverResult.data?.channels?.length,
    storageFound: discoverResult.data?.storage?.length,
    errors: discoverResult.data?.errors,
  });

  console.log('\n='.repeat(60));
  console.log('TEST DONE');
  console.log('='.repeat(60));
}

runTest().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});
