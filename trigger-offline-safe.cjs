const sql = require('mssql');
require('dotenv').config();
const https = require('https');

async function sendWebhook(title, message, color = 0x3b82f6) {
  // Mock Webhook for testing - disable real push to save rate limit
  console.log(`\n============================`);
  console.log(`[MOCK WEBHOOK PAYLOAD]`);
  console.log(`Title: ${title}`);
  console.log(`Message:\n${message}`);
  console.log(`============================\n`);
}

async function sendWhatsapp(message) {
  // Mock Whatsapp for testing - disable real push to save Fonnte Quota
  console.log(`\n============================`);
  console.log(`[MOCK WHATSAPP PAYLOAD]`);
  console.log(`Message:\n${message}`);
  console.log(`Status: Sent safely! QUOTA USED: 1`);
  console.log(`============================\n`);
}

async function runTest() {
  const pool = await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  });

  // Create 2 temporary dummy offline devices just for testing
  await pool.request().query("DELETE FROM Devices WHERE id IN ('test_dev_1', 'test_dev_2')");
  await pool.request().query("INSERT INTO Devices (id, hostname, ip, status, last_seen) VALUES ('test_dev_1', 'TEST-DEVICE-01', '192.168.1.101', 'online', CONVERT(NVARCHAR, DATEADD(minute, -45, GETDATE()), 120))");
  await pool.request().query("INSERT INTO Devices (id, hostname, ip, status, last_seen) VALUES ('test_dev_2', 'TEST-DEVICE-02', '192.168.1.102', 'online', CONVERT(NVARCHAR, DATEADD(minute, -45, GETDATE()), 120))");
  
  console.log("--> 2 Test Devices inserted and set to offline > 30 mins.\n");
  
  // 1. Emulate the exact query that server.cjs runs
  const offlineDevices = await pool.request().query(`
    SELECT * FROM Devices 
    WHERE status = 'online' 
      AND id IN ('test_dev_1', 'test_dev_2') /* LIMIT TO THE 2 DUMMY DEVICES ONLY */
      AND last_seen IS NOT NULL
      AND ISDATE(last_seen) = 1
      AND DATEDIFF(MINUTE, CAST(last_seen AS DATETIME), GETDATE()) > 30
      AND (last_offline_alert_at IS NULL OR DATEDIFF(HOUR, last_offline_alert_at, GETDATE()) > 24)
  `);

  const records = offlineDevices.recordset;
  if (records.length > 0) {
      console.log(`[LOG] Found ${records.length} offline devices. Building summary...`);
      
      let summaryWA = `🚨 *Offline Devices Summary (${records.length})*\n\n`;
      let summaryDiscord = `Found **${records.length}** devices offline for more than 30 minutes.\n\n`;
      
      const maxList = 10;
      for (let i = 0; i < Math.min(records.length, maxList); i++) {
        const d = records[i];
        summaryWA += `- *${d.hostname}* (${d.ip}) | Last: ${d.last_seen}\n`;
        summaryDiscord += `- **${d.hostname}** (${d.ip}) | Last seen: ${d.last_seen}\n`;
      }
      
      if (records.length > maxList) {
        summaryWA += `\n...and ${records.length - maxList} more devices. Check dashboard.`;
        summaryDiscord += `\n...and ${records.length - maxList} more devices. Check dashboard.`;
      }

      await sendWebhook(
        `🚨 Target Offline Summary (${records.length} Devices)`,
        summaryDiscord,
        0xef4444 // Red
      );

      await sendWhatsapp(summaryWA);

      // Clean up dummy devices to not leave trash
      await pool.request().query("DELETE FROM Devices WHERE id IN ('test_dev_1', 'test_dev_2')");
      console.log("[LOG] Dummy devices cleaned up from DB.");
  } else {
      console.log("[LOG] No offline test devices found.");
  }
  
  setTimeout(() => process.exit(0), 1000);
}
runTest();
