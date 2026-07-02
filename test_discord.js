import { initDb, poolPromise } from './config/db.js';
import { sendDiscordAlert } from './utils/discordWebhook.js';

async function main() {
  await initDb();
  const pool = await poolPromise;
  
  // Check webhook URL
  const r = await pool.request().query("SELECT id, webhook_url FROM NotificationSettings WHERE id = 'global'");
  console.log('NotificationSettings:', JSON.stringify(r.recordset, null, 2));
  
  if (r.recordset.length === 0 || !r.recordset[0].webhook_url) {
    console.log('ERROR: No webhook_url configured!');
    process.exit(1);
  }

  console.log('Webhook URL:', r.recordset[0].webhook_url);
  
  // Send test
  await sendDiscordAlert(
    '🛠️ CCTV Test Notification',
    '**Status:** ✅ Working\nThis is a test notification from the CCTV Monitoring System.\nIf you see this, Discord alerts are configured correctly!',
    0x3b82f6
  );
  
  // Wait 2 seconds for the request to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('Test complete.');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
