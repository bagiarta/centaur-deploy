import dotenv from 'dotenv';
dotenv.config();

import { poolPromise } from './config/db.js';

async function testDiscordWebhook() {
  console.log('Testing Discord webhook...\n');
  
  try {
    // Initialize database connection first
    console.log('Connecting to database...');
    const pool = await poolPromise;
    console.log('✅ Pool obtained:', typeof pool);
    
    // Get webhook URL
    console.log('Querying NotificationSettings...');
    const request = pool.request();
    const settingsRes = await request.query("SELECT webhook_url FROM NotificationSettings WHERE id = 'global'");
    
    console.log('Query result:', settingsRes.recordset.length, 'rows');
    const settings = settingsRes.recordset[0];
    
    if (!settings || !settings.webhook_url) {
      console.log('❌ No webhook URL configured in database');
      process.exit(1);
    }
    
    console.log('✅ Webhook URL found:', settings.webhook_url.substring(0, 50) + '...');
    
    // Send test notification
    const payload = JSON.stringify({
      embeds: [{
        title: '🧪 Test Alert from CCTV System',
        description: '**This is a test notification**\nIf you see this, the Discord webhook is working correctly!\n\n**Test Time:** ' + new Date().toISOString(),
        color: 0x5865F2,
        timestamp: new Date().toISOString()
      }]
    });

    console.log('\n📤 Sending to Discord...');
    const response = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });

    if (response.ok) {
      console.log(`✅ Success! Discord webhook sent (HTTP ${response.status})`);
      console.log('\n🎉 Check your Discord channel for the test message!');
    } else {
      const errorText = await response.text();
      console.error(`❌ Failed! HTTP ${response.status}:`, errorText);
    }
    
    await pool.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testDiscordWebhook();
