const sql = require('mssql');
require('dotenv').config();
const { exec } = require('child_process');
const util = require('util');
const https = require('https');
const execPromise = (cmd, options = {}) => {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
};


async function sendWebhook(title, message, color = 0x3b82f6) {
    try {
        const pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASS,
            server: process.env.DB_SERVER, database: process.env.DB_NAME,
            options: { encrypt: false, trustServerCertificate: true }
        });
        const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
        const settings = settingsRes.recordset[0];
        if (!settings || !settings.webhook_url) return console.log("No Webhook URL");

        const payload = JSON.stringify({
            embeds: [{ title, description: message, color, timestamp: new Date().toISOString() }]
        });

        const url = new URL(settings.webhook_url);
        const options = {
            hostname: url.hostname, path: url.pathname + url.search,
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };

        const req = https.request(options, (res) => console.log(`Webhook Sent: ${res.statusCode}`));
        req.on('error', (e) => console.error(`Webhook Error: ${e.message}`));
        req.write(payload);
        req.end();
    } catch (err) { console.error('Webhook Error:', err); }
}

async function sendWhatsapp(message) {
    try {
        const pool = await sql.connect({
            user: process.env.DB_USER, password: process.env.DB_PASS,
            server: process.env.DB_SERVER, database: process.env.DB_NAME,
            options: { encrypt: false, trustServerCertificate: true }
        });
        const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
        const settings = settingsRes.recordset[0];
        if (!settings || !settings.whatsapp_token) return console.log("No WA Token");

        const targets = [settings.whatsapp_target, settings.whatsapp_group].filter(Boolean).join(',');
        if (!targets) return console.log("No WA Target");

        const payload = JSON.stringify({ token: settings.whatsapp_token, target: targets, message, countryCode: '62' });
        const options = {
            hostname: 'api.fonnte.com', path: '/send', method: 'POST',
            headers: { 'Authorization': settings.whatsapp_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        };

        const req = https.request(options, (res) => console.log(`WA Sent: ${res.statusCode}`));
        req.on('error', (e) => console.error(`WA Error: ${e.message}`));
        req.write(payload);
        req.end();
    } catch (err) { console.error('WA Error:', err); }
}

async function runTestManual() {
    console.log("Starting Manual Network Detector Test...");
    const pool = await sql.connect({
        user: process.env.DB_USER, password: process.env.DB_PASS,
        server: process.env.DB_SERVER, database: process.env.DB_NAME,
        options: { encrypt: false, trustServerCertificate: true }
    });

    // Pick 1 specific device to "go offline"
    console.log("Mocking STORESRVR028 to offline status...");
    await pool.request().query("UPDATE Devices SET last_seen = DATEADD(hour, -2, GETDATE()), last_offline_alert_at = NULL, status = 'online' WHERE hostname = 'STORESRVR028'");

    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    const timeoutMins = settings.offline_timeout_mins || 30;

    // 1. Get Online devices
    const devicesToCheck = await pool.request().query("SELECT id, hostname, ip, last_seen, last_offline_alert_at FROM Devices WHERE status = 'online'");
    let newlyOffline = [];

    console.log(`Checking ${devicesToCheck.recordset.length} online devices via Heartbeat & Ping...`);

    for (const dev of devicesToCheck.recordset) {
        let isHeartbeatStale = false;
        if (dev.last_seen) {
            const diff = (new Date() - new Date(dev.last_seen)) / (1000 * 60);
            if (diff > timeoutMins) isHeartbeatStale = true;
        } else isHeartbeatStale = true;

        let isPingFailing = false;
        // Only ping if heartbeat is stale OR we want extra verification
        if (isHeartbeatStale && dev.ip && dev.ip !== '127.0.0.1' && dev.ip !== 'Unknown') {
           try {
              const { stdout } = await execPromise(`ping -n 1 -w 1000 ${dev.ip}`);
              if (!stdout.includes("TTL=")) isPingFailing = true;
           } catch (e) { isPingFailing = true; }
        }

        if (isHeartbeatStale || isPingFailing) {
           newlyOffline.push({ ...dev, alertNeeded: true, reason: isHeartbeatStale ? "Heartbeat Timeout" : "Ping Failed" });
        }
        
        // Small delay between pings to avoid CMD spam
        await new Promise(r => setTimeout(r, 50));
    }


    if (newlyOffline.length > 0) {
        console.log(`\n[ALERT] Detected ${newlyOffline.length} newly offline devices!`);
        
        // Mark them
        for (const dev of newlyOffline) {
            await pool.request().input('id', sql.NVarChar, dev.id).query("UPDATE Devices SET last_offline_alert_at = GETDATE(), status = 'offline' WHERE id = @id");
        }

        // Get total summary
        const allOfflineRes = await pool.request().query("SELECT hostname, ip FROM Devices WHERE status = 'offline'");
        const allOffline = allOfflineRes.recordset;

        let summaryWA = `🚨 *NETWORK ALERT (MANUAL TEST)*\n`;
        summaryWA += `New Tumbang: *${newlyOffline.length}*\n`;
        summaryWA += `Total Offline Saat Ini: *${allOffline.length} devices*\n\n`;
        
        summaryWA += `*Detected Just Now:*\n`;
        newlyOffline.forEach(d => summaryWA += `- *${d.hostname}* (${d.ip}) | ${d.reason}\n`);

        if (allOffline.length > newlyOffline.length) {
          summaryWA += `\n*Context (Still Offline):*\n`;
          const others = allOffline.filter(a => !newlyOffline.find(n => n.hostname === a.hostname)).slice(0, 5);
          others.forEach(d => summaryWA += `- ${d.hostname} (${d.ip})\n`);
          if (allOffline.length > newlyOffline.length + 5) summaryWA += `...and others.`;
        }

        console.log("\n--- NOTIFICATION CONTENT ---");
        console.log(summaryWA);
        console.log("----------------------------\n");

        await sendWebhook("🚨 Network Status Alert (Test)", summaryWA.replace(/\*/g, '**'), 0xef4444);
        await sendWhatsapp(summaryWA);
    } else {
        console.log("No newly offline devices detected in this run.");
    }

    setTimeout(() => process.exit(0), 5000);
}

runTestManual();
