// Test full auto-discovery
import hikvisionService from './services/hikvisionService.js';

const IP = '172.16.13.68';
const PORT = 80;
const USERNAME = 'admin';
const PASSWORD = 'Ppt@8899';

console.log('='.repeat(60));
console.log('FULL AUTO-DISCOVERY TEST');
console.log('='.repeat(60));

const result = await hikvisionService.autoDiscoverDevice(IP, PORT, USERNAME, PASSWORD, false);

console.log('\n' + '='.repeat(60));
console.log('RESULTS:');
console.log('='.repeat(60));

console.log('\nSuccess:', result.success);
console.log('\nDevice:', JSON.stringify(result.data.device, null, 2));
console.log('\nChannels (' + result.data.channels.length + '):');
result.data.channels.slice(0, 3).forEach((ch, idx) => {
  console.log(`  Channel ${idx + 1}:`, JSON.stringify(ch, null, 2));
});

console.log('\nStorage (' + result.data.storage.length + '):');
result.data.storage.forEach((st, idx) => {
  console.log(`  Storage ${idx + 1}:`, JSON.stringify(st, null, 2));
});

console.log('\nErrors:', result.data.errors);

console.log('\n' + '='.repeat(60));
