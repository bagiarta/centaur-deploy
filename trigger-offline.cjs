const sql = require('mssql');
require('dotenv').config();
const https = require('https');

async function sendWebhook(title, message, color = 0x3b82f6) {
  try {
    const pool = await sql.connect({
      user: process.env.DB_USER, password: process.env.DB_PASS,
      server: process.env.DB_SERVER, database: process.env.DB_NAME,
      options: { encrypt: false, trustServerCertificate: true }
    });
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.webhook_url) {
      console.log("[NOTIF] No webhook URL configured!");
      return;
    }

    const payload = JSON.stringify({
      embeds: [{ title, description: message, color, timestamp: new Date().toISOString() }]
    });

    const url = new URL(settings.webhook_url);
    const options = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };

    const req = https.request(options, (res) => {
      console.log(`[NOTIF] Webhook response: ${res.statusCode}`);
    });
    req.on('error', (e) => console.error(`[NOTIF] Webhook error: ${e.message}`));
    req.write(payload);
    req.end();
  } catch (err) { console.error('[NOTIF] sendWebhook error:', err); }
}

async function runTest() {
  const pool = await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  });

  console.log("1. Setting HOSERVER to offline status for testing...");
  await pool.request().query("UPDATE top (1) Devices SET status = 'online', last_seen = CONVERT(NVARCHAR, DATEADD(minute, -45, GETDATE()), 120), last_offline_alert_at = NULL");
  
  console.log("2. Running offline alert checker...");
  const offlineDevices = await pool.request().query("SELECT * FROM Devices WHERE status = 'online' AND last_seen IS NOT NULL AND ISDATE(last_seen) = 1 AND DATEDIFF(MINUTE, CAST(last_seen AS DATETIME), GETDATE()) > 30 AND (last_offline_alert_at IS NULL OR DATEDIFF(HOUR, last_offline_alert_at, GETDATE()) > 24)");

  if (offlineDevices.recordset.length === 0) {
      console.log("No offline devices found by query!");
  } else {
      for (const d of offlineDevices.recordset) {
          console.log(`[ALERT TRIGGERED] Device ${d.hostname} (${d.ip}) is offline! Sending notifications...`);
          
          await sendWebhook(
            '🚨 Device Offline Alert (TEST)',
            `Device **${d.hostname}** (${d.ip}) has been offline for more than 30 minutes.\\nLast seen: ${d.last_seen}`,
            0xef4444
          );

          await pool.request().input('id', sql.NVarChar, d.id)
            .query("UPDATE Devices SET status = 'offline', last_offline_alert_at = GETDATE() WHERE id = @id");
            
          console.log(`[SUCCESS] ${d.hostname} marked as offline and alert triggered.`);
      }
  }
  
  setTimeout(() => process.exit(0), 2000);
}
runTest();
