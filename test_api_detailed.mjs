import fetch from 'node-fetch';

async function testAPI() {
  console.log('🧪 Testing CCTV Poll API with detailed logging\n');
  console.log('📤 Sending POST request to http://localhost:3001/api/cctv/poll-now');
  console.log('⏰ Timestamp:', new Date().toISOString());
  console.log('');
  
  try {
    const startTime = Date.now();
    
    const response = await fetch('http://localhost:3001/api/cctv/poll-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Response received in ${duration}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log('');
    
    const result = await response.json();
    
    console.log('📋 Response Body:');
    console.log(JSON.stringify(result, null, 2));
    console.log('');
    
    if (response.ok) {
      console.log('✅ API call successful!');
      console.log(`   Total devices: ${result.data.total}`);
      console.log(`   Online: ${result.data.online}`);
      console.log(`   Offline: ${result.data.offline}`);
    } else {
      console.log('❌ API call failed!');
      console.log(`   Error: ${result.error}`);
    }
    
    console.log('');
    console.log('📬 Now check PM2 logs for notification output:');
    console.log('   pm2 logs Centaur-bacend --lines 50');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error occurred:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testAPI();
