import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import fetch from 'node-fetch';
import cron from 'node-cron';

// ═══════════════════════════════════════════════════════════════
// HIKVISION ISAPI SERVICE
// ═══════════════════════════════════════════════════════════════

async function pollHikvisionDevice(device) {
  try {
    const baseUrl = `${device.is_https ? 'https' : 'http'}://${device.ip_address}:${device.port}`;
    const auth = Buffer.from(`${device.username}:${Buffer.from(device.password_hash, 'base64').toString()}`).toString('base64');
    
    // Get device info
    const deviceInfoUrl = `${baseUrl}/ISAPI/System/deviceInfo`;
    const response = await fetch(deviceInfoUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml'
      },
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const xmlData = await response.text();
    
    // Update device status to online
    await updateDeviceStatus(device.id, 'online');
    
    // Get channels status
    await pollChannelStatus(device, auth, baseUrl);
    
    // Get storage status
    await pollStorageStatus(device, auth, baseUrl);
    
    return { success: true, deviceId: device.id };
  } catch (err) {
    console.error(`[CCTV Polling] Error polling device ${device.name}:`, err.message);
    
    // Update device status to offline/error
    await updateDeviceStatus(device.id, 'offline', err.message);
    
    return { success: false, deviceId: device.id, error: err.message };
  }
}

async function pollChannelStatus(device, auth, baseUrl) {
  try {
    const channelUrl = `${baseUrl}/ISAPI/ContentMgmt/InputProxy/channels`;
    const response = await fetch(channelUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml'
      },
      timeout: 10000
    });
    
    if (!response.ok) return;
    
    const xmlData = await response.text();
    
    // Parse XML and update channel status
    // For simplicity, we'll just log it here
    // In production, parse XML and update CCTVChannels table
    console.log(`[CCTV Polling] Channel data received for ${device.name}`);
    
  } catch (err) {
    console.error(`[CCTV Polling] Error polling channels for ${device.name}:`, err.message);
  }
}

async function pollStorageStatus(device, auth, baseUrl) {
  try {
    const storageUrl = `${baseUrl}/ISAPI/ContentMgmt/Storage`;
    const response = await fetch(storageUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/xml'
      },
      timeout: 10000
    });
    
    if (!response.ok) return;
    
    const xmlData = await response.text();
    
    // Parse XML and update storage status
    console.log(`[CCTV Polling] Storage data received for ${device.name}`);
    
  } catch (err) {
    console.error(`[CCTV Polling] Error polling storage for ${device.name}:`, err.message);
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
    
    // Get all active devices
    const result = await pool.request()
      .query(`
        SELECT id, name, device_type, vendor, ip_address, port, username, password_hash, is_https
        FROM CCTVDevices 
        WHERE is_active = 1
        ORDER BY last_poll ASC NULLS FIRST
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