import { poolPromise } from '../config/db.js';

function getISOTimestamp() {
  return new Date().toISOString();
}

/**
 * Sends a Discord webhook using the URL from NotificationSettings
 * @param {string} title 
 * @param {string} description 
 * @param {number} color 
 */
export async function sendDiscordAlert(title, description, color = 0x5865F2) {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    
    if (!settings || !settings.webhook_url) {
      console.log('[DISCORD] Skipping alert, no webhook_url in NotificationSettings.');
      return;
    }

    const payload = JSON.stringify({
      embeds: [{ title, description, color, timestamp: getISOTimestamp() }]
    });

    const response = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });

    if (response.ok) {
      console.log(`[DISCORD] ✅ Alert sent successfully: ${title} (HTTP ${response.status})`);
    } else {
      const body = await response.text();
      console.error(`[DISCORD] ❌ Failed to send alert: HTTP ${response.status} - ${body}`);
    }
  } catch (err) {
    console.error('[DISCORD] Error sending webhook:', err.message);
  }
}
