import fetch from 'node-fetch';

// Direct test without database
const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1486637793286291607/fiyrUE61rFoXwzV2n5X3KTiJnyMpfI2Dmsya5tqzGCM48d4VHTlltpZsZAiNyBmH4aWS';

async function testDirectWebhook() {
  console.log('🧪 Testing Discord webhook directly...\n');
  
  const payload = {
    embeds: [{
      title: '🧪 Direct Test from CCTV System',
      description: '**This is a direct test notification**\n\nIf you see this message, the Discord webhook URL is valid and working!\n\n**Test Time:** ' + new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      color: 0x5865F2,
      timestamp: new Date().toISOString(),
      footer: {
        text: 'CCTV Monitoring System'
      }
    }]
  };

  try {
    console.log('📤 Sending to Discord...');
    const response = await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      console.log(`✅ SUCCESS! Message sent (HTTP ${response.status})`);
      console.log('\n🎉 Check your Discord channel now!');
    } else {
      const errorText = await response.text();
      console.error(`❌ FAILED! HTTP ${response.status}`);
      console.error('Error:', errorText);
    }
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

testDirectWebhook();
