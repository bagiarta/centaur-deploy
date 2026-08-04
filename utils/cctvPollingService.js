import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import cron from 'node-cron';
import fetch from 'node-fetch';
import { autoDiscoverDevice } from '../services/hikvisionService.js';
import { sendDiscordAlert } from './discordWebhook.js';

// In-memory state tracker to prevent notification spam
// Format: { deviceId: { lastDeviceStatus, lastOfflineChannelCount, lastErrorDiskCount, lastTimeMismatch } }
const lastKnownState = new Map();

// Status history tracker for 3-check confirmation
// Format: { deviceId: { statusHistory: ['online', 'online', 'offline'], lastNotifiedStatus: 'online', pendingRecovery: false } }
const statusHistory = new Map();

// Polling lock to prevent concurrent polling
let isPolling = false;
let lastPollingTime = null;

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION SERVICE - Read from Database
// ═══════════════════════════════════════════════════════════════

export async function checkAndSendNotifications() {
  console.log('');
  console.log('='.repeat(80));
  console.log('[CCTV Notification] Starting notification check with 3-check confirmation...');
  console.log('='.repeat(80));
  console.log('');
  try {
    console.log('[CCTV Notification] Step 1: Getting poolPromise...');
    const pool = await poolPromise;
    
    if (!pool) {
      console.error('[CCTV Notification] ERROR: poolPromise is not initialized!');
      return;
    }
    
    console.log('[CCTV Notification] Step 2: Pool obtained, executing query...');
    
    // Get all active devices with their current status
    const devicesResult = await pool.request().query(`
      SELECT 
        d.id,
        d.name,
        d.ip_address,
        d.status,
        d.vendor,
        (SELECT COUNT(*) FROM CCTVChannels WHERE device_id = d.id AND is_enabled = 1 AND status IN ('offline', 'video_loss', 'no_signal')) as offline_channel_count,
        (SELECT COUNT(*) FROM CCTVStorage WHERE device_id = d.id AND status != 'normal') as error_disk_count
      FROM CCTVDevices d
      WHERE d.is_active = 1
    `);
    
    console.log(`[CCTV Notification] Step 3: Found ${devicesResult.recordset.length} active devices to check`);
    
    // Collect all changes before sending
    const alerts = [];
    
    for (const device of devicesResult.recordset) {
      const deviceId = device.id;
      const prevState = lastKnownState.get(deviceId);
      let history = statusHistory.get(deviceId);
      if (!history) {
        history = { statusHistory: [], lastNotifiedStatus: null, pendingRecovery: false };
        statusHistory.set(deviceId, history);
      }
      
      // If this is the first check for this device, initialize state and skip notifications
      if (!prevState) {
        console.log(`[CCTV Notification] Initializing state for device: ${device.name} (${device.status})`);
        lastKnownState.set(deviceId, {
          lastDeviceStatus: device.status,
          lastOfflineChannelCount: device.offline_channel_count,
          lastErrorDiskCount: device.error_disk_count
        });
        continue;
      }
      
      console.log(`[CCTV Notification] Checking device: ${device.name} | Status: ${prevState.lastDeviceStatus} → ${device.status} | Offline Ch: ${prevState.lastOfflineChannelCount} → ${device.offline_channel_count} | Error Disks: ${prevState.lastErrorDiskCount} → ${device.error_disk_count}`);
      
      // ═══════════════════════════════════════════════════════════
      // 3-CHECK CONFIRMATION FOR DEVICE STATUS CHANGES
      // ═══════════════════════════════════════════════════════════
      if (history) {
        const recentStatuses = history.statusHistory.slice(-3);
        const hasFullWindow = recentStatuses.length === 3;
        const allSame = hasFullWindow && recentStatuses.every(s => s === device.status);
        const lastNotified = history.lastNotifiedStatus;
        
        console.log(`[CCTV Notification] 3-check validation: [${recentStatuses.join(', ')}] | All same: ${allSame} | Last notified: ${lastNotified}`);
        
        if (hasFullWindow && allSame) {
          if (device.status === 'offline' && lastNotified !== 'offline' && !history.pendingRecovery) {
            console.log(`[CCTV Notification] ✅ CONFIRMED OFFLINE: ${device.name} has been offline for 3 consecutive checks`);
            alerts.push(`🚨 **Device Offline (Confirmed):** ${device.name} (${device.ip_address}) - ${device.vendor}`);
            history.lastNotifiedStatus = 'offline';
            history.pendingRecovery = true;
          } else if (device.status === 'online' && lastNotified === 'offline' && history.pendingRecovery) {
            console.log(`[CCTV Notification] ✅ CONFIRMED RECOVERY: ${device.name} has been online for 3 consecutive checks after an offline alert`);
            alerts.push(`✅ **Device Recovered (Confirmed):** ${device.name} (${device.ip_address}) is back online`);
            history.lastNotifiedStatus = 'online';
            history.pendingRecovery = false;
          } else {
            console.log(`[CCTV Notification] ⏳ WAITING: ${device.name} - Not yet confirmed for notification rules`);
          }
        } else {
          console.log(`[CCTV Notification] ⏳ WAITING: ${device.name} - Need ${3 - recentStatuses.length} more check(s) for confirmation`);
        }
      }
      
      // Check Channel Changes (immediate notification, no 3-check needed)
      if (device.offline_channel_count > prevState.lastOfflineChannelCount) {
        const newOfflineCount = device.offline_channel_count - prevState.lastOfflineChannelCount;
        console.log(`[CCTV Notification] ⚠️ Channels went offline: ${device.name} (+${newOfflineCount})`);
        alerts.push(`⚠️ **Channel Offline:** ${device.name} (${device.ip_address}) - ${newOfflineCount} channel(s) went offline (Total: ${device.offline_channel_count})`);
      } else if (device.offline_channel_count < prevState.lastOfflineChannelCount) {
        const recoveredCount = prevState.lastOfflineChannelCount - device.offline_channel_count;
        console.log(`[CCTV Notification] ✅ Channels recovered: ${device.name} (-${recoveredCount})`);
        alerts.push(`✅ **Channel Recovered:** ${device.name} (${device.ip_address}) - ${recoveredCount} channel(s) recovered`);
      }
      
      // Check Storage Changes (immediate notification, no 3-check needed)
      if (device.error_disk_count > prevState.lastErrorDiskCount) {
        const newErrorCount = device.error_disk_count - prevState.lastErrorDiskCount;
        console.log(`[CCTV Notification] ⚠️ Disk errors detected: ${device.name} (+${newErrorCount})`);
        alerts.push(`💿 **Storage Alert:** ${device.name} (${device.ip_address}) - ${newErrorCount} disk(s) reporting errors (Total: ${device.error_disk_count})`);
      } else if (device.error_disk_count < prevState.lastErrorDiskCount) {
        const recoveredCount = prevState.lastErrorDiskCount - device.error_disk_count;
        console.log(`[CCTV Notification] ✅ Disk errors recovered: ${device.name} (-${recoveredCount})`);
        alerts.push(`✅ **Storage Recovered:** ${device.name} (${device.ip_address}) - ${recoveredCount} disk(s) returned to normal`);
      }
      
      // Update state
      lastKnownState.set(deviceId, {
        lastDeviceStatus: device.status,
        lastOfflineChannelCount: device.offline_channel_count,
        lastErrorDiskCount: device.error_disk_count
      });
    }
    
    // Send consolidated notification if there are any alerts
    if (alerts.length > 0) {
      console.log('[CCTV Notification] Step 4: Preparing to send notification...');
      console.log(`[CCTV Notification] Total alerts: ${alerts.length}`);
      
      const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
      const title = `📊 CCTV Monitoring Alert - ${alerts.length} Change(s) Detected`;
      const description = `**Time:** ${timestamp}\n\n` + alerts.join('\n\n');
      
      // Determine color: Red if any critical alerts, Amber if warnings, Green if all recoveries
      let color = 0x22c55e; // Green (default for recoveries)
      if (alerts.some(a => a.includes('🚨') || a.includes('💿'))) {
        color = 0xef4444; // Red (critical)
      } else if (alerts.some(a => a.includes('⚠️'))) {
        color = 0xf59e0b; // Amber (warning)
      }
      
      console.log(`[CCTV Notification] Alert color: ${color === 0xef4444 ? 'Red (Critical)' : color === 0xf59e0b ? 'Amber (Warning)' : 'Green (Recovery)'}`);
      console.log(`[CCTV Notification] Sending consolidated alert...`);
      
      await sendDiscordAlert(title, description, color);
      
      console.log(`[CCTV Notification] Alert sent successfully!`);
    } else {
      console.log('[CCTV Notification] Step 4: No confirmed status changes detected, skipping notification');
    }
    
    console.log(`[CCTV Notification] Step 5: Checked ${devicesResult.recordset.length} devices for status changes`);
    console.log('');
    console.log('='.repeat(80));
    console.log('[CCTV Notification] Notification check completed!');
    console.log('='.repeat(80));
    console.log('');
  } catch (err) {
    console.error('');
    console.error('='.repeat(80));
    console.error('[CCTV Notification] ERROR during notification check:');
    console.error('[CCTV Notification] Error message:', err.message);
    console.error('[CCTV Notification] Stack trace:', err.stack);
    console.error('='.repeat(80));
    console.error('');
  }
}

// ═══════════════════════════════════════════════════════════════
// LIGHTWEIGHT STATUS CHECK (Simple Connection Test)
// ═══════════════════════════════════════════════════════════════

async function quickStatusCheck(device) {
  try {
    const password = Buffer.from(device.password_hash, 'base64').toString();
    
    // Simple connection test - just check if device is reachable
    const protocol = device.is_https ? 'https' : 'http';
    const url = `${protocol}://${device.ip_address}:${device.port}/ISAPI/System/deviceInfo`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${device.username}:${password}`).toString('base64')
        },
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      const isOnline = response.ok || response.status === 401; // 401 means device is reachable
      return { 
        success: isOnline, 
        deviceId: device.id,
        status: isOnline ? 'online' : 'offline'
      };
    } catch (err) {
      clearTimeout(timeout);
      return { 
        success: false, 
        deviceId: device.id, 
        status: 'offline',
        error: err.message 
      };
    }
  } catch (err) {
    return { 
      success: false, 
      deviceId: device.id, 
      status: 'offline',
      error: err.message 
    };
  }
}

export async function quickStatusCheckAll() {
  console.log('[CCTV Quick Check] Starting quick status check...');
  
  try {
    const pool = await poolPromise;
    
    const result = await pool.request()
      .query(`
        SELECT id, name, ip_address, port, username, password_hash, is_https
        FROM CCTVDevices 
        WHERE is_active = 1
      `);
    
    const devices = result.recordset;
    console.log(`[CCTV Quick Check] Checking ${devices.length} devices`);
    
    const maxConcurrent = 10; // Can be higher for simple checks
    const results = [];
    const now = new Date();
    
    for (let i = 0; i < devices.length; i += maxConcurrent) {
      const batch = devices.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(device => quickStatusCheck(device))
      );
      
      // Update database and track status history
      for (const result of batchResults) {
        const device = devices.find(d => d.id === result.deviceId);
        if (!device) continue;
        
        // Track status history for 3-check confirmation
        let history = statusHistory.get(result.deviceId);
        if (!history) {
          history = {
            statusHistory: [],
            lastNotifiedStatus: null,
            pendingRecovery: false
          };
          statusHistory.set(result.deviceId, history);
        }

        // Add current status to history
        history.statusHistory.push(result.status);
        
        // Keep only last 3 checks
        if (history.statusHistory.length > 3) {
          history.statusHistory.shift();
        }
        
        console.log(`[CCTV Quick Check] ${device.name} history: [${history.statusHistory.join(' → ')}]`);
        
        try {
          await pool.request()
            .input('id', sql.NVarChar, result.deviceId)
            .input('status', sql.NVarChar, result.status)
            .input('last_poll', sql.DateTime, now)
            .input('last_seen', sql.DateTime, result.status === 'online' ? now : null)
            .query(`
              UPDATE CCTVDevices 
              SET status = @status, 
                  last_poll = @last_poll,
                  last_seen = CASE WHEN @last_seen IS NOT NULL THEN @last_seen ELSE last_seen END
              WHERE id = @id
            `);
        } catch (err) {
          console.error(`[CCTV Quick Check] Error updating ${device.name}:`, err.message);
        }
      }
      
      results.push(...batchResults);
    }
    
    const onlineCount = results.filter(r => r.status === 'online').length;
    const offlineCount = results.filter(r => r.status === 'offline').length;
    
    console.log(`[CCTV Quick Check] Completed: ${onlineCount} online, ${offlineCount} offline`);
    
    return {
      success: true,
      total: devices.length,
      online: onlineCount,
      offline: offlineCount
    };
  } catch (err) {
    console.error('[CCTV Quick Check] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// FULL DISCOVERY (Channels, Storage, Device Info)
// ═══════════════════════════════════════════════════════════════

async function pollHikvisionDevice(device) {
  try {
    const password = Buffer.from(device.password_hash, 'base64').toString();
    const result = await autoDiscoverDevice(device.ip_address, device.port, device.username, password, device.is_https);

    if (!result.device) {
      // Full discovery should not overwrite status; only refresh discovery metadata.
      await updateDeviceDiscoveryMetadata(device.id, 'Device unreachable or authentication failed');
      return { success: false, deviceId: device.id, error: 'Unreachable' };
    }

    // Refresh discovery metadata only; keep the existing device status intact.
    await updateDeviceDiscoveryMetadata(device.id);

    // Update Channels in Database
    await updateChannelsInDatabase(device.id, result.channels || []);

    // Update Storage in Database
    await updateStorageInDatabase(device.id, result.storage || []);

    return { success: true, deviceId: device.id };
  } catch (err) {
    console.error(`[CCTV Polling] Error polling device ${device.name}:`, err.message);
    await updateDeviceDiscoveryMetadata(device.id, err.message);
    return { success: false, deviceId: device.id, error: err.message };
  }
}

async function updateDeviceDiscoveryMetadata(deviceId, errorMessage = null) {
  try {
    const pool = await poolPromise;

    await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .query(`
        UPDATE CCTVDevices
        SET last_poll = GETDATE(),
            updated_at = GETDATE()
        WHERE id = @id
      `);

    if (errorMessage) {
      console.log(`[CCTV Polling] Discovery metadata refreshed for ${deviceId}: ${errorMessage}`);
    }
  } catch (err) {
    console.error('[CCTV Polling] updateDeviceDiscoveryMetadata error:', err.message);
  }
}

async function updateChannelsInDatabase(deviceId, channels) {
  try {
    const pool = await poolPromise;
    const now = new Date();
    
    for (const channel of channels) {
      const channelId = `${deviceId}-ch${channel.id}`;
      const channelNumber = parseInt(channel.channel_number || channel.id) || 1;
      const channelName = channel.channel_name || channel.name || `Channel ${channelNumber}`;
      
      // Check if channel exists
      const existingChannel = await pool.request()
        .input('id', sql.NVarChar, channelId)
        .query('SELECT status, channel_name, channel_settings FROM CCTVChannels WHERE id = @id');
      
      let customName = null;
      let isEmptySlot = false;
      let existingSettingsObj = {};

      if (existingChannel.recordset.length > 0) {
        const row = existingChannel.recordset[0];
        if (row.channel_settings) {
           try { existingSettingsObj = JSON.parse(row.channel_settings); } catch(e){}
           customName = existingSettingsObj.custom_name || null;
           isEmptySlot = existingSettingsObj.is_empty_slot === true;
        }
      }

      channelName = customName || channelName;

      // Determine status
      let channelStatus = 'offline';
      if (isEmptySlot) {
        channelStatus = 'empty_slot';
      } else if (channel.status === 'online') {
        channelStatus = 'online';
      } else if (channel.online === 'true') {
        channelStatus = 'online';
      } else if (channel.is_enabled === true) {
        channelStatus = 'online';
      }
      
      const isEnabled = channel.is_enabled !== false;
      const cameraIP = channel.ipAddress || null;
      
      // Store additional channel info
      const settings = {
        camera_ip: cameraIP,
        protocol: channel.protocol || channel.proxyProtocol || channel.transport || null,
        codec: channel.codec || channel.videoCodecType || null,
        resolution: channel.resolution || null,
        custom_name: customName,
        is_empty_slot: isEmptySlot
      };
      const channelSettings = JSON.stringify(settings);
      
      if (existingChannel.recordset.length > 0) {
        // Update existing channel
        await pool.request()
          .input('id', sql.NVarChar, channelId)
          .input('channel_name', sql.NVarChar, channelName)
          .input('status', sql.NVarChar, channelStatus)
          .input('is_enabled', sql.Bit, isEnabled)
          .input('channel_settings', sql.NVarChar, channelSettings)
          .input('updated_at', sql.DateTime, now)
          .query(`
            UPDATE CCTVChannels 
            SET channel_name = @channel_name,
                status = @status,
                is_enabled = @is_enabled,
                channel_settings = @channel_settings,
                updated_at = @updated_at
            WHERE id = @id
          `);
      } else {
        // Insert new channel
        await pool.request()
          .input('id', sql.NVarChar, channelId)
          .input('device_id', sql.NVarChar, deviceId)
          .input('channel_number', sql.Int, channelNumber)
          .input('channel_name', sql.NVarChar, channelName)
          .input('status', sql.NVarChar, channelStatus)
          .input('is_enabled', sql.Bit, isEnabled)
          .input('channel_settings', sql.NVarChar, channelSettings)
          .input('created_at', sql.DateTime, now)
          .input('updated_at', sql.DateTime, now)
          .query(`
            INSERT INTO CCTVChannels (id, device_id, channel_number, channel_name, status, is_enabled, channel_settings, created_at, updated_at)
            VALUES (@id, @device_id, @channel_number, @channel_name, @status, @is_enabled, @channel_settings, @created_at, @updated_at)
          `);
      }
    }
  } catch (err) {
    console.error('[CCTV Polling] updateChannelsInDatabase error:', err.message);
  }
}

async function updateStorageInDatabase(deviceId, storage) {
  try {
    const pool = await poolPromise;
    const now = new Date();
    
    for (const disk of storage) {
      const storageId = `${deviceId}-hdd${disk.id}`;
      const diskNumber = parseInt(disk.id) || 1;
      const diskName = disk.name || `HDD ${diskNumber}`;
      
      // Hikvision returns MB, convert to bytes
      const totalSpace = disk.capacity ? parseInt(disk.capacity) * 1024 * 1024 : 0;
      const freeSpace = disk.freeSpace ? parseInt(disk.freeSpace) * 1024 * 1024 : 0;
      const usedSpace = totalSpace - freeSpace;
      const usagePercentage = disk.usagePercentage || (totalSpace > 0 ? ((usedSpace / totalSpace) * 100).toFixed(2) : 0);
      const diskStatus = disk.status === 'ok' || disk.status === 'normal' ? 'normal' : 'error';
      const diskType = disk.type || 'HDD';
      
      // Check if storage exists
      const existingStorage = await pool.request()
        .input('id', sql.NVarChar, storageId)
        .query('SELECT status FROM CCTVStorage WHERE id = @id');
      
      if (existingStorage.recordset.length > 0) {
        // Update existing storage
        await pool.request()
          .input('id', sql.NVarChar, storageId)
          .input('disk_name', sql.NVarChar, diskName)
          .input('total_space', sql.BigInt, totalSpace)
          .input('used_space', sql.BigInt, usedSpace)
          .input('free_space', sql.BigInt, freeSpace)
          .input('usage_percentage', sql.Decimal(5, 2), parseFloat(usagePercentage))
          .input('status', sql.NVarChar, diskStatus)
          .input('disk_type', sql.NVarChar, diskType)
          .input('updated_at', sql.DateTime, now)
          .query(`
            UPDATE CCTVStorage 
            SET disk_name = @disk_name,
                total_space = @total_space,
                used_space = @used_space,
                free_space = @free_space,
                usage_percentage = @usage_percentage,
                status = @status,
                disk_type = @disk_type,
                updated_at = @updated_at
            WHERE id = @id
          `);
      } else {
        // Insert new storage
        await pool.request()
          .input('id', sql.NVarChar, storageId)
          .input('device_id', sql.NVarChar, deviceId)
          .input('disk_number', sql.Int, diskNumber)
          .input('disk_name', sql.NVarChar, diskName)
          .input('total_space', sql.BigInt, totalSpace)
          .input('used_space', sql.BigInt, usedSpace)
          .input('free_space', sql.BigInt, freeSpace)
          .input('usage_percentage', sql.Decimal(5, 2), parseFloat(usagePercentage))
          .input('status', sql.NVarChar, diskStatus)
          .input('disk_type', sql.NVarChar, diskType)
          .input('created_at', sql.DateTime, now)
          .input('updated_at', sql.DateTime, now)
          .query(`
            INSERT INTO CCTVStorage (id, device_id, disk_number, disk_name, total_space, used_space, free_space, usage_percentage, status, disk_type, created_at, updated_at)
            VALUES (@id, @device_id, @disk_number, @disk_name, @total_space, @used_space, @free_space, @usage_percentage, @status, @disk_type, @created_at, @updated_at)
          `);
      }
    }
  } catch (err) {
    console.error('[CCTV Polling] updateStorageInDatabase error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// POLLING JOB
// ═══════════════════════════════════════════════════════════════

export async function pollAllCCTVDevices(options = {}) {
  console.log('');
  console.log('>>> [CCTV Polling] pollAllCCTVDevices() START <<<');
  
  const { bypassLock = false } = options;
  
  // Check if already polling (unless bypassed for verification)
  if (!bypassLock && isPolling) {
    console.log('[CCTV Polling] WARNING: Polling already in progress, skipping this run');
    return { 
      success: false, 
      error: 'Polling already in progress',
      skipped: true
    };
  }
  
  // Check if last polling was too recent (within 30 seconds) - unless bypassed
  if (!bypassLock && lastPollingTime && (Date.now() - lastPollingTime) < 30000) {
    const timeSince = Math.floor((Date.now() - lastPollingTime) / 1000);
    console.log(`[CCTV Polling] WARNING: Last polling was ${timeSince}s ago, skipping to prevent overload`);
    return {
      success: false,
      error: 'Polling too frequent',
      skipped: true
    };
  }
  
  isPolling = true;
  lastPollingTime = Date.now();
  
  try {
    const pool = await poolPromise;
    
    // Get all active devices
    const result = await pool.request()
      .query(`
        SELECT id, name, device_type, vendor, ip_address, port, username, password_hash, is_https
        FROM CCTVDevices 
        WHERE is_active = 1
        ORDER BY 
          CASE WHEN last_poll IS NULL THEN 0 ELSE 1 END, 
          last_poll
      `);
    
    const devices = result.recordset;
    console.log(`[CCTV Polling] Starting poll for ${devices.length} devices`);
    
    const maxConcurrent = 5; // Poll 5 devices at a time (reduced from 10 to prevent network congestion)
    const results = [];
    
    console.log('[CCTV Polling] Processing in batches of', maxConcurrent);
    
    for (let i = 0; i < devices.length; i += maxConcurrent) {
      const batch = devices.slice(i, i + maxConcurrent);
      console.log(`[CCTV Polling] Batch ${Math.floor(i / maxConcurrent) + 1}/${Math.ceil(devices.length / maxConcurrent)}: Processing ${batch.length} devices`);
      
      const batchResults = await Promise.all(
        batch.map(device => {
          if (device.vendor === 'Hikvision' || device.vendor === 'hikvision') {
            return pollHikvisionDevice(device);
          } else {
            // Add support for other vendors here
            return Promise.resolve({ success: false, deviceId: device.id, error: 'Vendor not supported' });
          }
        })
      );
      results.push(...batchResults);
      
      // Add small delay between batches to prevent overwhelming the network
      if (i + maxConcurrent < devices.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log(`[CCTV Polling] Completed: ${successCount} success, ${failedCount} failed`);
    
    isPolling = false; // Release lock
    
    return {
      total: devices.length,
      success: successCount,
      failed: failedCount
    };
  } catch (err) {
    console.error('[CCTV Polling] pollAllCCTVDevices error:', err.message);
    isPolling = false; // Release lock on error
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// CRON SCHEDULER - SEPARATED QUICK CHECK & FULL DISCOVERY
// ═══════════════════════════════════════════════════════════════

export function startCCTVPollingJob() {
  // ─────────────────────────────────────────────────────────────
  // QUICK STATUS CHECK - Every 1 minute (simple connection test)
  // ─────────────────────────────────────────────────────────────
  cron.schedule('*/1 * * * *', async () => {
    console.log(`[CCTV Quick Check] Running quick status check at ${new Date().toISOString()}`);
    
    try {
      await quickStatusCheckAll();
    } catch (err) {
      console.error('[CCTV Quick Check] Error:', err.message);
    }
  });
  
  console.log('✅ CCTV Quick Status Check scheduled (every 1 minute)');
  console.log('   Purpose: Simple connection test to update device online/offline status');
  
  // ─────────────────────────────────────────────────────────────
  // FULL DISCOVERY - Every 5 minutes (channels, storage, device info)
  // ─────────────────────────────────────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    console.log(`[CCTV Full Discovery] Starting full discovery at ${new Date().toISOString()}`);
    
    const result = await pollAllCCTVDevices();
    
    if (result.skipped) {
      console.log('[CCTV Full Discovery] Skipped due to lock or rate limit');
      return;
    }
    
    console.log('[CCTV Full Discovery] Completed, waiting 1 minute before sending notifications...');
    
    // Wait 1 minute before sending notifications
    setTimeout(async () => {
      console.log('[CCTV Full Discovery] 1 minute elapsed, checking for notifications...');
      try {
        await checkAndSendNotifications();
      } catch (err) {
        console.error('[CCTV Full Discovery] Notification error:', err.message);
      }
    }, 60000); // 60 seconds = 1 minute
  });
  
  console.log('✅ CCTV Full Discovery scheduled (every 5 minutes)');
  console.log('   Purpose: Complete device discovery (channels, storage, device info)');
  console.log('   Timeline: Poll → Wait 1min → Notify');
  
  // ─────────────────────────────────────────────────────────────
  // INITIAL STARTUP
  // ─────────────────────────────────────────────────────────────
  
  // Run initial quick check after 10 seconds
  setTimeout(async () => {
    console.log('[CCTV Startup] Running initial quick status check...');
    try {
      await quickStatusCheckAll();
    } catch (err) {
      console.error('[CCTV Startup] Initial quick check error:', err.message);
    }
  }, 10000);
  
  // Run initial full discovery after 30 seconds
  setTimeout(async () => {
    console.log('[CCTV Startup] Running initial full discovery...');
    await pollAllCCTVDevices();
    
    // Initial notification check after 1 minute
    setTimeout(async () => {
      console.log('[CCTV Startup] Initial notification check...');
      try {
        await checkAndSendNotifications();
      } catch (err) {
        console.error('[CCTV Startup] Initial notification error:', err.message);
      }
    }, 60000);
  }, 30000);
}

// Manual trigger endpoint
export async function triggerManualPoll() {
  console.log('[CCTV Polling] Manual poll triggered');
  return await pollAllCCTVDevices();
}