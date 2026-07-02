import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import cron from 'node-cron';
import { autoDiscoverDevice } from '../services/hikvisionService.js';
import { sendDiscordAlert } from './discordWebhook.js';

// In-memory state tracker to prevent Discord notification spam.
// Format: deviceId -> { offline: boolean, badChannels: string[], badDisks: string[], timeMismatch: boolean }
const deviceStates = new Map();

// ═══════════════════════════════════════════════════════════════
// HIKVISION ISAPI SERVICE
// ═══════════════════════════════════════════════════════════════

async function pollHikvisionDevice(device) {
  try {
    const password = Buffer.from(device.password_hash, 'base64').toString();
    const result = await autoDiscoverDevice(device.ip_address, device.port, device.username, password, device.is_https);

    // Initialize state if not exists
    if (!deviceStates.has(device.id)) {
      deviceStates.set(device.id, { offline: false, badChannels: [], badDisks: [], timeMismatch: false });
    }
    const state = deviceStates.get(device.id);

    if (!result.device) {
      // Device is completely offline/unreachable
      await updateDeviceStatus(device.id, 'offline', 'Device unreachable or authentication failed');
      
      if (!state.offline) {
        state.offline = true;
        await sendDiscordAlert(
          `🚨 CCTV Device Offline: ${device.name}`,
          `**Host:** ${device.ip_address}:${device.port}\n**Vendor:** ${device.vendor}\n**Error:** Cannot reach device or authenticate.`,
          0xef4444 // Red
        );
      }
      return { success: false, deviceId: device.id, error: 'Unreachable' };
    }

    // Device is Online
    await updateDeviceStatus(device.id, 'online');
    if (state.offline) {
      state.offline = false;
      await sendDiscordAlert(
        `✅ CCTV Device Recovered: ${device.name}`,
        `**Host:** ${device.ip_address}:${device.port}\nDevice is back online.`,
        0x22c55e // Green
      );
    }

    // Check Channels
    const badChannels = (result.channels || []).filter(c => c.status !== 'online');
    const badChannelIds = badChannels.map(c => c.id);
    const newBadChannels = badChannels.filter(c => !state.badChannels.includes(c.id));
    const recoveredChannels = state.badChannels.filter(id => !badChannelIds.includes(id));
    
    if (newBadChannels.length > 0) {
      const chNames = newBadChannels.map(c => `- ${c.name} (Status: ${c.status})`).join('\n');
      await sendDiscordAlert(
        `⚠️ CCTV Channel Offline: ${device.name}`,
        `**Host:** ${device.ip_address}\nThe following channels went offline or lost video:\n${chNames}`,
        0xf59e0b // Amber
      );
    }
    if (recoveredChannels.length > 0) {
      await sendDiscordAlert(
        `✅ CCTV Channel Recovered: ${device.name}`,
        `**Host:** ${device.ip_address}\n${recoveredChannels.length} channel(s) recovered and are back online.`,
        0x22c55e // Green
      );
    }
    state.badChannels = badChannelIds;

    // Check Storage
    const badDisks = (result.storage || []).filter(s => s.status !== 'ok' && s.status !== 'normal');
    const badDiskIds = badDisks.map(d => d.id);
    const newBadDisks = badDisks.filter(d => !state.badDisks.includes(d.id));
    const recoveredDisks = state.badDisks.filter(id => !badDiskIds.includes(id));

    if (newBadDisks.length > 0) {
      const diskNames = newBadDisks.map(d => `- HDD ${d.id} (${d.name || 'Unknown'}) - Status: ${d.status}`).join('\n');
      await sendDiscordAlert(
        `💿 CCTV Storage Alert: ${device.name}`,
        `**Host:** ${device.ip_address}\nThe following storage disks are reporting errors:\n${diskNames}`,
        0xef4444 // Red
      );
    }
    if (recoveredDisks.length > 0) {
      await sendDiscordAlert(
        `✅ CCTV Storage Recovered: ${device.name}`,
        `**Host:** ${device.ip_address}\n${recoveredDisks.length} disk(s) returned to normal status.`,
        0x22c55e // Green
      );
    }
    state.badDisks = badDiskIds;

    // Check System Time Mismatch
    const devTimeStr = result.device.systemTime; // e.g. '2026-07-02T10:00:00'
    if (devTimeStr) {
      const devDate = new Date(devTimeStr);
      const serverDate = new Date();
      // Check if day/month/year differs
      const isMismatch = (
        devDate.getFullYear() !== serverDate.getFullYear() ||
        devDate.getMonth() !== serverDate.getMonth() ||
        devDate.getDate() !== serverDate.getDate()
      );

      if (isMismatch && !state.timeMismatch) {
        state.timeMismatch = true;
        await sendDiscordAlert(
          `⏱️ CCTV Time Sync Error: ${device.name}`,
          `**Host:** ${device.ip_address}\nDevice time is out of sync.\n**Device Time:** ${devDate.toISOString().split('T')[0]}\n**Server Time:** ${serverDate.toISOString().split('T')[0]}\nPlease re-sync the device time.`,
          0xf59e0b // Amber
        );
      } else if (!isMismatch && state.timeMismatch) {
        state.timeMismatch = false;
        await sendDiscordAlert(
          `✅ CCTV Time Synced: ${device.name}`,
          `**Host:** ${device.ip_address}\nDevice time matches today's date.`,
          0x22c55e // Green
        );
      }
    }

    return { success: true, deviceId: device.id };
  } catch (err) {
    console.error(`[CCTV Polling] Error polling device ${device.name}:`, err.message);
    
    await updateDeviceStatus(device.id, 'offline', err.message);

    if (!deviceStates.has(device.id)) {
      deviceStates.set(device.id, { offline: false, badChannels: [], badDisks: [], timeMismatch: false });
    }
    const state = deviceStates.get(device.id);

    if (!state.offline) {
      state.offline = true;
      await sendDiscordAlert(
        `🚨 CCTV Device Offline: ${device.name}`,
        `**Host:** ${device.ip_address}:${device.port}\n**Error:** ${err.message}`,
        0xef4444
      );
    }
    
    return { success: false, deviceId: device.id, error: err.message };
  }
}

async function updateDeviceStatus(deviceId, status, errorMessage = null) {
  try {
    const pool = await poolPromise;
    
    // Get current status
    const currentResult = await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .query('SELECT status, name FROM CCTVDevices WHERE id = @id');
    
    if (currentResult.recordset.length === 0) return;
    
    const currentStatus = currentResult.recordset[0].status;
    const deviceName = currentResult.recordset[0].name;
    
    // Only update if status changed
    if (currentStatus !== status) {
      await pool.request()
        .input('id', sql.NVarChar, deviceId)
        .input('status', sql.NVarChar, status)
        .query(`
          UPDATE CCTVDevices 
          SET status = @status, 
              last_seen = GETDATE(), 
              last_poll = GETDATE(),
              updated_at = GETDATE()
          WHERE id = @id
        `);
      
      // Log status change
      const severity = status === 'offline' ? 'high' : 'info';
      await pool.request()
        .input('id', sql.NVarChar, `log-${Date.now()}`)
        .input('device_id', sql.NVarChar, deviceId)
        .input('log_type', sql.NVarChar, 'device_status')
        .input('event_type', sql.NVarChar, 'status_change')
        .input('old_value', sql.NVarChar, currentStatus)
        .input('new_value', sql.NVarChar, status)
        .input('message', sql.NVarChar, errorMessage || `Device ${deviceName} status changed from ${currentStatus} to ${status}`)
        .input('severity', sql.NVarChar, severity)
        .query(`
          INSERT INTO CCTVMonitoringLogs (id, device_id, log_type, event_type, old_value, new_value, message, severity)
          VALUES (@id, @device_id, @log_type, @event_type, @old_value, @new_value, @message, @severity)
        `);
      
      console.log(`[CCTV Polling] ${deviceName} status: ${currentStatus} → ${status}`);
    } else {
      // Just update last_poll
      await pool.request()
        .input('id', sql.NVarChar, deviceId)
        .query(`UPDATE CCTVDevices SET last_poll = GETDATE() WHERE id = @id`);
    }
  } catch (err) {
    console.error('[CCTV Polling] updateDeviceStatus error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// POLLING JOB
// ═══════════════════════════════════════════════════════════════

export async function pollAllCCTVDevices() {
  try {
    const pool = await poolPromise;
    
    // Get all active devices (FIXED SQL SYNTAX for SQL Server)
    const result = await pool.request()
      .query(`
        SELECT id, name, device_type, vendor, ip_address, port, username, password_hash, is_https
        FROM CCTVDevices 
        WHERE is_active = 1
        ORDER BY CASE WHEN last_poll IS NULL THEN 0 ELSE 1 END, last_poll ASC
      `);
    
    const devices = result.recordset;
    console.log(`[CCTV Polling] Starting poll for ${devices.length} devices`);
    
    const maxConcurrent = 10; // Poll 10 devices at a time
    const results = [];
    
    for (let i = 0; i < devices.length; i += maxConcurrent) {
      const batch = devices.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(device => {
          if (device.vendor === 'hikvision') {
            return pollHikvisionDevice(device);
          } else {
            // Add support for other vendors here
            return Promise.resolve({ success: false, deviceId: device.id, error: 'Vendor not supported' });
          }
        })
      );
      results.push(...batchResults);
    }
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log(`[CCTV Polling] Completed: ${successCount} success, ${failedCount} failed`);
    
    return {
      total: devices.length,
      success: successCount,
      failed: failedCount
    };
  } catch (err) {
    console.error('[CCTV Polling] pollAllCCTVDevices error:', err.message);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CRON SCHEDULER
// ═══════════════════════════════════════════════════════════════

export function startCCTVPollingJob() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log(`[CCTV Polling] Starting scheduled poll at ${new Date().toISOString()}`);
    await pollAllCCTVDevices();
  });
  
  console.log('✅ CCTV Polling job scheduled (every 5 minutes)');
  
  // Run initial poll after 30 seconds
  setTimeout(async () => {
    console.log('[CCTV Polling] Running initial poll...');
    await pollAllCCTVDevices();
  }, 30000);
}

// Manual trigger endpoint
export async function triggerManualPoll() {
  console.log('[CCTV Polling] Manual poll triggered');
  return await pollAllCCTVDevices();
}