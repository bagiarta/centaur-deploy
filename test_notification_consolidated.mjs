import sql from 'mssql';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

async function sendDiscordAlert(title, description, color = 0x5865F2) {
  try {
    const pool = await sql.connect(dbConfig);
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    
    if (!settings || !settings.webhook_url) {
      console.log('❌ No webhook_url in NotificationSettings');
      return;
    }

    const payload = JSON.stringify({
      embeds: [{ title, description, color, timestamp: new Date().toISOString() }]
    });

    const response = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });

    if (response.ok) {
      console.log(`✅ Alert sent successfully: ${title}`);
    } else {
      const body = await response.text();
      console.error(`❌ Failed to send alert: HTTP ${response.status} - ${body}`);
    }
    
    await pool.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

async function testConsolidatedNotification() {
  console.log('🧪 Testing Consolidated Notification\n');
  
  // Simulate multiple alerts
  const alerts = [
    '🚨 **Device Offline:** DVRFMLK001 (172.16.104.67) - Hikvision',
    '⚠️ **Channel Offline:** NVR 3 Nusa Dua (172.16.9.46) - 2 channel(s) went offline (Total: 5)',
    '💿 **Storage Alert:** NVR 2 GOURMET ECHO BEACH (172.16.10.27) - 1 disk(s) reporting errors (Total: 1)',
    '✅ **Device Recovered:** DVRFMLK001 (172.16.104.67) is back online',
    '✅ **Channel Recovered:** NVR 3 Nusa Dua (172.16.9.46) - 2 channel(s) recovered'
  ];
  
  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const title = `📊 CCTV Monitoring Alert - ${alerts.length} Change(s) Detected`;
  const description = `**Time:** ${timestamp}\n\n` + alerts.join('\n\n');
  
  // Determine color based on alert types
  let color = 0x22c55e; // Green (default for recoveries)
  if (alerts.some(a => a.includes('🚨') || a.includes('💿'))) {
    color = 0xef4444; // Red (critical)
  } else if (alerts.some(a => a.includes('⚠️'))) {
    color = 0xf59e0b; // Amber (warning)
  }
  
  console.log('📤 Sending consolidated notification...\n');
  console.log('Title:', title);
  console.log('Color:', color === 0xef4444 ? 'Red' : color === 0xf59e0b ? 'Amber' : 'Green');
  console.log('Alerts:', alerts.length);
  console.log('\nDescription:');
  console.log(description);
  console.log('\n---\n');
  
  await sendDiscordAlert(title, description, color);
  
  console.log('\n✅ Test complete!');
  console.log('📬 Check your Discord channel for the consolidated notification');
  
  process.exit(0);
}

testConsolidatedNotification();
