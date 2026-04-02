const sql = require('mssql');
require('dotenv').config();
const https = require('https');

async function sendWhatsapp(pool, message) {
  try {
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];

    if (!settings || !settings.whatsapp_token) {
        console.log("[LOG] WhatsApp token not set. Skipping.");
        return;
    }
    const targets = [settings.whatsapp_target, settings.whatsapp_group].filter(Boolean).join(',');
    if (!targets) {
        console.log("[LOG] WhatsApp target not set. Skipping.");
        return;
    }

    const payload = JSON.stringify({
      token: settings.whatsapp_token,
      target: targets,
      message: message,
      countryCode: '62',
    });

    const options = {
      hostname: 'api.fonnte.com',
      path: '/send',
      method: 'POST',
      headers: {
        'Authorization': settings.whatsapp_token,
        'token': settings.whatsapp_token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    console.log(`[LOG] Sending real WA to Fonnte -> ${targets}`);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => console.log(`[FONNTE RESPONSE] ${res.statusCode}: ${data}`));
    });
    req.on('error', (e) => console.error(`[FONNTE ERROR] ${e.message}`));
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('[NOTIF] sendWhatsapp error:', err.message);
  }
}

async function runTest() {
  const pool = await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  });

  // 1. CLEAR & INSERT 3 DUMMY DEVICES OFFLINE
  await pool.request().query("DELETE FROM Devices WHERE id IN ('t_dev_1', 't_dev_2', 't_dev_3')");
  
  await pool.request().query("INSERT INTO Devices (id, hostname, ip, status, last_seen) VALUES ('t_dev_1', 'SVR-TEST-1', '192.168.10.1', 'online', CONVERT(NVARCHAR, DATEADD(minute, -40, GETDATE()), 120))");
  await pool.request().query("INSERT INTO Devices (id, hostname, ip, status, last_seen) VALUES ('t_dev_2', 'SVR-TEST-2', '192.168.10.2', 'online', CONVERT(NVARCHAR, DATEADD(minute, -41, GETDATE()), 120))");
  await pool.request().query("INSERT INTO Devices (id, hostname, ip, status, last_seen) VALUES ('t_dev_3', 'SVR-TEST-3', '192.168.10.3', 'online', CONVERT(NVARCHAR, DATEADD(minute, -42, GETDATE()), 120))");
  
  console.log("[LOG] 3 Dummy Devices created & injected directly with offline status (-40mins).\n");

  // 2. RUN ALERT CHECK
  const offlineDevices = await pool.request().query(`
    SELECT * FROM Devices 
    WHERE status = 'online' 
      AND id IN ('t_dev_1', 't_dev_2', 't_dev_3')
      AND last_seen IS NOT NULL
      AND ISDATE(last_seen) = 1
      AND DATEDIFF(MINUTE, CAST(last_seen AS DATETIME), GETDATE()) > 30
      AND (last_offline_alert_at IS NULL OR DATEDIFF(HOUR, last_offline_alert_at, GETDATE()) > 24)
  `);

  const records = offlineDevices.recordset;
  if (records.length > 0) {
      console.log(`[LOG] Query returned ${records.length} devices... Preparing SINGLE Summary WhatsApp message.`);
      
      let summaryWA = `🚨 *Offline Devices Summary (${records.length})*\n\n`;
      
      for (let i = 0; i < records.length; i++) {
        const d = records[i];
        summaryWA += `- *${d.hostname}* (${d.ip}) | Last: ${d.last_seen}\n`;
      }
      
      // SEND REAL WHATSAPP
      await sendWhatsapp(pool, summaryWA);

      // Clean up dummies immediately
      await pool.request().query("DELETE FROM Devices WHERE id IN ('t_dev_1', 't_dev_2', 't_dev_3')");
  }

  // Allow time for request to fire
  setTimeout(() => process.exit(0), 4000);
}

runTest();
