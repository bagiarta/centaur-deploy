const sql = require('mssql');
const https = require('https');
const url = require('url');
require('dotenv').config();

// Helper to match server.cjs timestamp format
function getISOTimestamp() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return (new Date(now - tzOffset)).toISOString().slice(0, -1);
}

// Helper to parse inconsistent date formats (ISO vs Local)
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  // 1. Handle ISO-like format (e.g., "2026-04-10T03:00:00Z" or "2026-04-10T11:00:00")
  if (dateStr.includes('T')) {
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
    if (!isNaN(d.getTime())) return d;
    // Try without Z if it fails (sometimes it's a pseudo-ISO local string)
    const d2 = new Date(dateStr);
    return isNaN(d2.getTime()) ? null : d2;
  }
  
  // 2. Handle "DD/MM/YYYY, HH.mm" or "DD/MM/YYYY HH:mm"
  const parts = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[,\s]+(\d{1,2})[:\.](\d{1,2})/);
  if (parts) {
    const [_, day, month, year, hour, min] = parts;
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min));
    return isNaN(d.getTime()) ? null : d;
  }
  
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

async function sendWebhook(pool, title, description, color = 0x5865F2) {
  try {
    const settingsRes = await pool.request().query("SELECT TOP 1 webhook_url FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    const webhookUrl = settings?.webhook_url || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const payload = JSON.stringify({
      embeds: [{ title, description, color, timestamp: new Date().toISOString() }]
    });

    const parsedUrl = new url.URL(webhookUrl);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        console.log("[NOTIF] Webhook response:", res.statusCode);
        resolve();
      });
      req.on('error', (e) => {
        console.error("[NOTIF] Webhook error:", e.message);
        resolve();
      });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.error("[NOTIF] Webhook setup error:", err.message);
  }
}

async function sendWhatsapp(pool, message) {
  try {
    const settingsRes = await pool.request().query("SELECT TOP 1 whatsapp_token, whatsapp_target, whatsapp_group FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.whatsapp_token) return;

    const targets = [settings.whatsapp_target, settings.whatsapp_group].filter(Boolean).join(',');
    if (!targets) return;

    const payload = JSON.stringify({ 
      token: settings.whatsapp_token, 
      target: targets, 
      message, 
      countryCode: '62' 
    });

    const options = {
      hostname: 'api.fonnte.com',
      path: '/send',
      method: 'POST',
      headers: { 
        'Authorization': settings.whatsapp_token,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        console.log("[NOTIF] WhatsApp response:", res.statusCode);
        resolve();
      });
      req.on('error', (e) => {
        console.error("[NOTIF] WhatsApp error:", e.message);
        resolve();
      });
      req.write(payload);
      req.end();
    });
  } catch (err) {
    console.error("[NOTIF] WhatsApp setup error:", err.message);
  }
}

const { exec } = require('child_process');
const execPromise = require('util').promisify(exec);

async function runDetector() {
  try {
    const pool = await sql.connect({
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      options: { encrypt: false, trustServerCertificate: true }
    });

    console.log("1. Fetching all devices for analysis...");
    const res = await pool.request().query("SELECT * FROM Devices");
    const allDevices = res.recordset;

    const now = new Date();
    const webhookList = [];
    const whatsappList = [];

    console.log(`2. Analyzing ${allDevices.length} devices...`);

    const recoveryIds = [];

    for (const d of allDevices) {
      const lastSeenDate = parseDate(d.last_seen);
      if (!lastSeenDate) continue;

      // Calculate heartbeat diff
      const diffMins = Math.abs(now - lastSeenDate) / (1000 * 60);
      const isHeartbeatStale = diffMins > 5;
      
      const lastWebhookAlert = d.last_offline_alert_at ? new Date(d.last_offline_alert_at) : null;
      const lastWhatsappAlert = d.last_whatsapp_alert_at ? new Date(d.last_whatsapp_alert_at) : null;

      const diffHoursWebhook = lastWebhookAlert ? (now - lastWebhookAlert) / (1000 * 60 * 60) : 9999;
      const diffHoursWhatsapp = lastWhatsappAlert ? (now - lastWhatsappAlert) / (1000 * 60 * 60) : 9999;

      let isPingFailing = false;
      const canPing = d.ip && d.ip !== 'Unknown' && d.ip !== '127.0.0.1' && !d.ip.startsWith('169.');

      // Proactive Ping (Only if heartbeat is stale)
      if (isHeartbeatStale && canPing) {
        try {
          const { stdout } = await execPromise(`ping -n 3 -w 1000 ${d.ip}`);
          if (!stdout.includes("TTL=")) {
            isPingFailing = true;
          } else {
            // Ping succeeded! If it was offline, we should recover it
            if (d.status === 'offline') {
              recoveryIds.push(d.id);
            }
          }
        } catch (e) {
          isPingFailing = true;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      let notifyHooks = false;
      let notifyWA = false;

      // RULE 1: Newly Offline (Heartbeat Stale AND Ping Fails)
      if (d.status === 'online' && isHeartbeatStale && isPingFailing) {
        notifyHooks = true;
        notifyWA = true; 
      } 
      // RULE 2: Still Offline Reminder - Webhook (Every 1 hour)
      else if (d.status === 'offline' && diffHoursWebhook >= 1 && isPingFailing) {
        notifyHooks = true;
      }
      
      // RULE 3: Still Offline Reminder - WhatsApp (Every 24 hours)
      if (d.status === 'offline' && diffHoursWhatsapp >= 24 && isPingFailing) {
        notifyWA = true;
      }

      if (notifyHooks) webhookList.push(d);
      if (notifyWA) whatsappList.push(d);
    }

    // Perform Recovery Updates
    if (recoveryIds.length > 0) {
      const recIds = recoveryIds.map(id => `'${id}'`).join(',');
      await pool.request().query(`UPDATE Devices SET status = 'online', last_offline_alert_at = NULL, last_whatsapp_alert_at = NULL WHERE id IN (${recIds})`);
      console.log(`[RECOVERY] Updated ${recoveryIds.length} devices to ONLINE (Responsive to Ping).`);
    }

    if (webhookList.length === 0 && whatsappList.length === 0) {
      console.log("No devices require notification at this time.");
    } else {
      console.log(`[ANALYSIS] Found ${webhookList.length} Webhook alerts and ${whatsappList.length} WhatsApp alerts needed.`);
      
      // Dispatch logic... (rest remains similar)

      // 1. Dispatch Webhooks
      if (webhookList.length > 0) {
        let summary = `🚨 **Network Alert: ${webhookList.length} Devices Offline**\n*Frequency: Hourly Reminder / New Event*\n\n`;
        webhookList.slice(0, 40).forEach(d => {
          summary += `- **${d.hostname}** (${d.ip}) | Last: ${d.last_seen}\n`;
        });
        if (webhookList.length > 40) summary += `\n*...and ${webhookList.length - 40} more.*`;
        
        await sendWebhook(pool, "🚨 Network Status Report", summary, 0xef4444);

        const hookIds = webhookList.map(d => `'${d.id}'`).join(',');
        await pool.request()
          .input('now', sql.DateTime, now)
          .query(`UPDATE Devices SET status = 'offline', last_offline_alert_at = @now WHERE id IN (${hookIds})`);
      }

      // 2. Dispatch WhatsApp
      if (whatsappList.length > 0) {
        let summary = `🚨 *Network Alert: ${whatsappList.length} Devices Offline*\n*Frequency: 24h Reminder / New Event*\n\n`;
        whatsappList.slice(0, 50).forEach(d => {
          summary += `- *${d.hostname}* (${d.ip})\n`;
        });
        if (whatsappList.length > 50) summary += `\n*...and ${whatsappList.length - 50} more.*`;

        await sendWhatsapp(pool, summary);

        const waIds = whatsappList.map(d => `'${d.id}'`).join(',');
        await pool.request()
          .input('now', sql.DateTime, now)
          .query(`UPDATE Devices SET status = 'offline', last_whatsapp_alert_at = @now WHERE id IN (${waIds})`);
      }

      console.log(`[SUCCESS] Notifications dispatched.`);
    }

    process.exit(0);
  } catch (err) {
    console.error("Fatal Error:", err.message);
    process.exit(1);
  }
}

runDetector();
