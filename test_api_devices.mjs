import fetch from 'node-fetch';

async function testDevicesAPI() {
  try {
    console.log('Testing /api/cctv/devices endpoint...\n');
    
    const response = await fetch('http://localhost:3001/api/cctv/devices');
    const data = await response.json();
    
    if (!data.success) {
      console.error('API Error:', data.error);
      return;
    }
    
    console.log(`Total devices: ${data.data.length}\n`);
    
    // Find NVR 3 Nusa Dua
    const nusaDua = data.data.find(d => d.name.includes('Nusa Dua'));
    
    if (!nusaDua) {
      console.log('NVR 3 Nusa Dua not found in response!');
      return;
    }
    
    console.log('=== NVR 3 Nusa Dua ===');
    console.log('Name:', nusaDua.name);
    console.log('IP:', nusaDua.ip_address);
    console.log('Status:', nusaDua.status);
    console.log('Has channels property:', 'channels' in nusaDua);
    
    if (nusaDua.channels) {
      console.log('\n=== Channels ===');
      console.log('Total channels:', nusaDua.channels.length);
      
      const online = nusaDua.channels.filter(ch => ch.status === 'online').length;
      const offline = nusaDua.channels.filter(ch => ch.status === 'offline').length;
      const videoLoss = nusaDua.channels.filter(ch => ch.status === 'video_loss').length;
      const noSignal = nusaDua.channels.filter(ch => ch.status === 'no_signal').length;
      
      console.log('Online:', online);
      console.log('Offline:', offline);
      console.log('Video Loss:', videoLoss);
      console.log('No Signal:', noSignal);
      
      console.log('\n=== Sample Channels ===');
      nusaDua.channels.slice(0, 5).forEach(ch => {
        console.log(`Ch${ch.channel_number}: ${ch.channel_name} - ${ch.status}`);
      });
    } else {
      console.log('❌ No channels property found!');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testDevicesAPI();
