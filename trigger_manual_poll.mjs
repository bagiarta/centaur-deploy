import fetch from 'node-fetch';

async function triggerManualPoll() {
  console.log('🔄 Triggering manual CCTV poll...\n');
  
  try {
    const response = await fetch('http://localhost:3001/api/cctv/poll-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Manual poll triggered successfully!');
      console.log('\nResults:');
      console.log('- Total devices:', result.data.total);
      console.log('- Online:', result.data.online);
      console.log('- Offline:', result.data.offline);
      console.log('\n📬 Check Discord for any status change notifications!');
    } else {
      console.error('❌ Failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

triggerManualPoll();
