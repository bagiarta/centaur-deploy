import sql from 'mssql';
import { poolPromise } from '../../config/db.js';
import { getIO } from '../../config/socket.js';
import * as hikvisionService from './hikvisionService.js';

// Device status polling
export const pollDeviceStatus = async (deviceId) => {
  try {
    const pool = await poolPromise;
    
    const deviceResult = await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .query('SELECT * FROM Devices WHERE id = @id AND is_active = 1');
    
    if (deviceResult.recordset.length === 0) {
      throw new Error('Device not found or inactive');
    }
    
    const device = deviceResult.recordset[0];
    const settings = device.connection_settings ? JSON.parse(device.connection_settings) : {};
    
    // Get API service based on vendor
    let apiService;
    switch (device.vendor.toLowerCase()) {
      case 'hikvision':
        apiService = hikvisionService;
        break;
      case 'dahua':
        // Dahua service implementation
        apiService = hikvisionService; // Using same service for now
        break;
      default:
        throw new Error(`Unsupported vendor: ${device.vendor}`);
    }
    
    // Poll device info
    const deviceInfo = await apiService.getDeviceInfo(device);
    
    // Poll channels
    const channels = await apiService.getChannelStatus(device);
    
    // Poll storage
    const storage = await apiService.getStorageStatus(device);
    
    // Update device status
    const newStatus = deviceInfo.isOnline ? 'online' : 'offline';
    await updateDeviceStatus(device.id, newStatus);
    
    // Update channels
    await updateDeviceChannels(device.id, channels);
    
    // Update storage
    await updateDeviceStorage(device.id, storage);
    
    // Update device info
    await updateDeviceInfo(device.id, {
      model: deviceInfo.model,
      firmwareVersion: deviceInfo.firmwareVersion,
      serialNumber: deviceInfo.serialNumber,
      channelsCount: deviceInfo.channelsCount,
      storageCount: deviceInfo.storageCount,
      capabilities: deviceInfo.capabilities
    });
    
    // Log device info update
    await logDevicePoll(device.id, 'device_info', 'info', 'Device information updated', 'info');
    
    console.log(`[DeviceService] Poll completed for device ${device.name} (${device.id})`);
    
    return {
      success: true,
      deviceStatus: newStatus,
      channelsCount: channels.length,
      storageCount: storage.length
    };
  } catch (err) {
    console.error(`[DeviceService] Poll failed for device ${deviceId}:`, err.message);
    
    // Update device to error status
    await updateDeviceStatus(deviceId, 'error', err.message);
    
    return {
      success: false,
      error: err.message
    };
  }
};

export const pollAllDevices = async () => {
  try {
    const pool = await poolPromise;
    
    // Get all active devices that need polling
    const result = await pool.request()
      .query(`
        SELECT id, name, vendor, ip_address, port, username, 
               password_hash, is_https, device_type
        FROM Devices 
        WHERE is_active = 1 
        AND status != 'error'
        ORDER BY last_poll ASC
      `);
    
    const devices = result.recordset;
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_POLLS || 10);
    
    console.log(`[DeviceService] Polling ${devices.length} devices (max: ${maxConcurrent} concurrent)`);
    
    // Process in batches
    const results = [];
    for (let i = 0; i < devices.length; i += maxConcurrent) {
      const batch = devices.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map(device => pollDeviceStatus(device.id).catch(err => ({ success: false, error: err.message })))
      );
      results.push(...batchResults);
    }
    
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    
    console.log(`[DeviceService] Polling completed: ${successCount} success, ${failedCount} failed`);
    
    return {
      total: devices.length,
      success: successCount,
      failed: failedCount
    };
  } catch (err) {
    console.error('[DeviceService] pollAllDevices error:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
};

// Update device status
export const updateDeviceStatus = async (deviceId, status, errorMessage = null) => {
  try {
    const pool = await poolPromise;
    
    const deviceResult = await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .query('SELECT * FROM Devices WHERE id = @id');
    
    if (deviceResult.recordset.length === 0) {
      return;
    }
    
    const device = deviceResult.recordset[0];
    
    // Check if status actually changed
    if (device.status === status) {
      return;
    }
    
    const now = new Date().toISOString();
    const oldStatus = device.status;
    
    await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .input('status', sql.NVarChar, status)
      .input('last_seen', sql.NVarChar, now)
      .input('last_poll', sql.NVarChar, now)
      .query(`
        UPDATE Devices 
        SET status = @status, 
            last_seen = @last_seen, 
            last_poll = @last_poll,
            updated_at = @updated_at
        WHERE id = @id
      `, {
        name: 'updated_at', value: now, type: sql.NVarChar
      });
    
    // Create monitoring log
    await pool.request()
      .input('id', sql.NVarChar, `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
      .input('deviceId', sql.NVarChar, deviceId)
      .input('logType', sql.NVarChar, 'device_status')
      .input('eventType', sql.NVarChar, 'status_change')
      .input('oldValue', sql.NVarChar, oldStatus)
      .input('newValue', sql.NVarChar, status)
      .input('message', sql.NVarChar, errorMessage || `Device status changed from ${oldStatus} to ${status}`)
      .input('severity', sql.NVarChar, status === 'offline' ? 'high' : 'info')
      .query(`
        INSERT INTO MonitoringLogs (id, device_id, log_type, event_type, old_value, new_value, message, severity)
        VALUES (@id, @deviceId, @logType, @eventType, @oldValue, @newValue, @message, @severity)
      `);
    
    // Broadcast to Socket.IO
    const io = getIO();
    io.to(`device:${deviceId}`).emit('device_status_update', {
      deviceId,
      deviceName: device.name,
      status,
      timestamp: now
    });
    
    io.emit('device_alert', {
      type: 'device_status',
      deviceId,
      message: `Device ${device.name} is now ${status}`,
      severity: status === 'offline' ? 'critical' : 'info',
      timestamp: now
    });
    
    console.log(`[DeviceService] Device ${device.name} status changed: ${oldStatus} → ${status}`);
  } catch (err) {
    console.error(`[DeviceService] updateDeviceStatus error for ${deviceId}:`, err.message);
  }
};

// Update device channels
export const updateDeviceChannels = async (deviceId, channels) => {
  try {
    const pool = await poolPromise;
    const now = new Date().toISOString();
    
    for (const channel of channels) {
      // Check if channel exists
      const existingResult = await pool.request()
        .input('deviceId', sql.NVarChar, deviceId)
        .input('channelNumber', sql.Int, channel.channelNumber)
        .query(`
          SELECT id, status, is_recording FROM DeviceChannels 
          WHERE device_id = @deviceId AND channel_number = @channelNumber
        `);
      
      if (existingResult.recordset.length === 0) {
        // Create new channel
        await pool.request()
          .input('id', sql.NVarChar, `ch-${Date.now()}-${channel.channelNumber}`)
          .input('deviceId', sql.NVarChar, deviceId)
          .input('channelNumber', sql.Int, channel.channelNumber)
          .input('channelName', sql.NVarChar, channel.channelName)
          .input('channelType', sql.NVarChar, channel.channelType || 'ip')
          .input('status', sql.NVarChar, channel.status)
          .input('isRecording', sql.Bit, channel.isRecording)
          .input('lastSeen', sql.NVarChar, now)
          .query(`
            INSERT INTO DeviceChannels (id, device_id, channel_number, channel_name, channel_type, status, is_recording, last_seen)
            VALUES (@id, @deviceId, @channelNumber, @channelName, @channelType, @status, @isRecording, @lastSeen)
          `);
        
        console.log(`[DeviceService] Created channel ${channel.channelNumber} for device ${deviceId}`);
      } else {
        const existing = existingResult.recordset[0];
        
        // Check if status changed
        if (existing.status !== channel.status || existing.is_recording !== channel.isRecording) {
          await pool.request()
            .input('id', sql.NVarChar, existing.id)
            .input('status', sql.NVarChar, channel.status)
            .input('isRecording', sql.Bit, channel.isRecording)
            .input('lastSeen', sql.NVarChar, channel.status === 'online' ? now : existing.last_seen)
            .query(`
              UPDATE DeviceChannels 
              SET status = @status, 
                  is_recording = @isRecording,
                  last_seen = @lastSeen,
                  updated_at = @updatedAt
              WHERE id = @id
            `, {
              name: 'updatedAt', value: now, type: sql.NVarChar
            });
          
          // Log status change
          await pool.request()
            .input('id', sql.NVarChar, `log-${Date.now()}-${channel.channelNumber}`)
            .input('deviceId', sql.NVarChar, deviceId)
            .input('logType', sql.NVarChar, 'channel_status')
            .input('eventType', sql.NVarChar, 'status_change')
            .input('objectId', sql.NVarChar, existing.id)
            .input('oldValue', sql.NVarChar, existing.status)
            .input('newValue', sql.NVarChar, channel.status)
            .input('message', sql.NVarChar, `Channel ${channel.channelNumber} status changed from ${existing.status} to ${channel.status}`)
            .input('severity', sql.NVarChar, channel.status === 'online' ? 'info' : 'medium')
            .query(`
              INSERT INTO MonitoringLogs (id, device_id, log_type, event_type, object_id, old_value, new_value, message, severity)
              VALUES (@id, @deviceId, @logType, @eventType, @objectId, @oldValue, @newValue, @message, @severity)
            `);
          
          // Broadcast channel update
          const io = getIO();
          io.to(`device:${deviceId}`).emit('channel_status_update', {
            channelId: existing.id,
            deviceName: device.name,
            channelNumber: channel.channelNumber,
            status: channel.status,
            isRecording: channel.isRecording,
            timestamp: now
          });
        }
      }
    }
  } catch (err) {
    console.error(`[DeviceService] updateDeviceChannels error for ${deviceId}:`, err.message);
  }
};

// Update device storage
export const updateDeviceStorage = async (deviceId, storage) => {
  try {
    const pool = await poolPromise;
    const now = new Date().toISOString();
    
    for (const disk of storage) {
      // Check if disk exists
      const existingResult = await pool.request()
        .input('deviceId', sql.NVarChar, deviceId)
        .input('diskNumber', sql.Int, disk.diskNumber)
        .query(`
          SELECT id, status, usage_percentage FROM DeviceStorage 
          WHERE device_id = @deviceId AND disk_number = @diskNumber
        `);
      
      if (existingResult.recordset.length === 0) {
        // Create new disk record
        await pool.request()
          .input('id', sql.NVarChar, `disk-${Date.now()}-${disk.diskNumber}`)
          .input('deviceId', sql.NVarChar, deviceId)
          .input('diskNumber', sql.Int, disk.diskNumber)
          .input('diskName', sql.NVarChar, disk.diskName)
          .input('status', sql.NVarChar, disk.status)
          .input('totalSpace', sql.BigInt, disk.totalSpace)
          .input('usedSpace', sql.BigInt, disk.usedSpace)
          .input('freeSpace', sql.BigInt, disk.freeSpace)
          .input('usagePercentage', sql.Decimal(5, 2), disk.usagePercentage)
          .input('lastChecked', sql.NVarChar, now)
          .query(`
            INSERT INTO DeviceStorage (id, device_id, disk_number, disk_name, status, total_space, used_space, free_space, usage_percentage, last_checked)
            VALUES (@id, @deviceId, @diskNumber, @diskName, @status, @totalSpace, @usedSpace, @freeSpace, @usagePercentage, @lastChecked)
          `);
        
        console.log(`[DeviceService] Created disk record ${disk.diskNumber} for device ${deviceId}`);
      } else {
        const existing = existingResult.recordset[0];
        
        // Check if status or usage changed
        if (existing.status !== disk.status || existing.usage_percentage !== disk.usagePercentage) {
          await pool.request()
            .input('id', sql.NVarChar, existing.id)
            .input('status', sql.NVarChar, disk.status)
            .input('totalSpace', sql.BigInt, disk.totalSpace)
            .input('usedSpace', sql.BigInt, disk.usedSpace)
            .input('freeSpace', sql.BigInt, disk.freeSpace)
            .input('usagePercentage', sql.Decimal(5, 2), disk.usagePercentage)
            .input('lastChecked', sql.NVarChar, now)
            .query(`
              UPDATE DeviceStorage 
              SET status = @status,
                  total_space = @totalSpace,
                  used_space = @usedSpace,
                  free_space = @freeSpace,
                  usage_percentage = @usagePercentage,
                  last_checked = @lastChecked,
                  updated_at = @updatedAt
              WHERE id = @id
            `, {
              name: 'updatedAt', value: now, type: sql.NVarChar
            });
          
          // Log storage status change
          const severity = disk.usagePercentage >= 95 ? 'critical' : disk.usagePercentage >= 80 ? 'high' : 'info';
          await pool.request()
            .input('id', sql.NVarChar, `log-${Date.now()}-${disk.diskNumber}`)
            .input('deviceId', sql.NVarChar, deviceId)
            .input('logType', sql.NVarChar, 'storage_status')
            .input('eventType', sql.NVarChar, 'status_change')
            .input('objectId', sql.NVarChar, existing.id)
            .input('oldValue', sql.NVarChar, existing.status)
            .input('newValue', sql.NVarChar, disk.status)
            .input('message', sql.NVarChar, `Disk ${disk.diskNumber} status changed: ${existing.status} → ${disk.status}. Usage: ${existing.usage_percentage}% → ${disk.usagePercentage}%`)
            .input('severity', sql.NVarChar, severity)
            .query(`
              INSERT INTO MonitoringLogs (id, device_id, log_type, event_type, object_id, old_value, new_value, message, severity)
              VALUES (@id, @deviceId, @logType, @eventType, @objectId, @oldValue, @newValue, @message, @severity)
            `);
          
          // Broadcast storage alert if critical
          if (disk.usagePercentage >= 95) {
            const io = getIO();
            io.to(`device:${deviceId}`).emit('storage_alert', {
              storageId: existing.id,
              deviceName: device.name,
              diskNumber: disk.diskNumber,
              usagePercentage: disk.usagePercentage,
              status: disk.status,
              severity: 'critical',
              timestamp: now
            });
          }
        }
      }
    }
  } catch (err) {
    console.error(`[DeviceService] updateDeviceStorage error for ${deviceId}:`, err.message);
  }
};

export const updateDeviceInfo = async (deviceId, info) => {
  try {
    const pool = await poolPromise;
    
    await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .input('model', sql.NVarChar, info.model || null)
      .input('firmwareVersion', sql.NVarChar, info.firmwareVersion || null)
      .input('serialNumber', sql.NVarChar, info.serialNumber || null)
      .input('deviceInfo', sql.NVarChar, JSON.stringify(info))
      .query(`
        UPDATE Devices 
        SET model = @model,
            firmware_version = @firmwareVersion,
            serial_number = @serialNumber,
            device_info = @deviceInfo,
            updated_at = GETDATE()
        WHERE id = @id
      `);
  } catch (err) {
    console.error(`[DeviceService] updateDeviceInfo error for ${deviceId}:`, err.message);
  }
};

export const logDevicePoll = async (deviceId, logType, eventType, message, severity) => {
  try {
    const pool = await poolPromise;
    
    await pool.request()
      .input('id', sql.NVarChar, `log-${Date.now()}`)
      .input('deviceId', sql.NVarChar, deviceId)
      .input('logType', sql.NVarChar, logType)
      .input('eventType', sql.NVarChar, eventType)
      .input('message', sql.NVarChar, message)
      .input('severity', sql.NVarChar, severity)
      .query(`
        INSERT INTO MonitoringLogs (id, device_id, log_type, event_type, message, severity)
        VALUES (@id, @deviceId, @logType, @eventType, @message, @severity)
      `);
  } catch (err) {
    console.error(`[DeviceService] logDevicePoll error for ${deviceId}:`, err.message);
  }
};

// Manual device status check
export const checkDeviceStatus = async (deviceId) => {
  try {
    const pool = await poolPromise;
    
    const deviceResult = await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .query('SELECT * FROM Devices WHERE id = @id AND is_active = 1');
    
    if (deviceResult.recordset.length === 0) {
      throw new Error('Device not found or inactive');
    }
    
    const device = deviceResult.recordset[0];
    
    // Try to connect to device
    const isOnline = await testDeviceConnection(device);
    
    const newStatus = isOnline ? 'online' : 'offline';
    
    if (device.status !== newStatus) {
      await updateDeviceStatus(deviceId, newStatus);
    }
    
    return {
      success: true,
      deviceId,
      status: newStatus,
      isOnline
    };
  } catch (err) {
    console.error(`[DeviceService] checkDeviceStatus error for ${deviceId}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
};

export const testDeviceConnection = async (device) => {
  try {
    // For Hikvision devices, try to get device info via ISAPI
    const url = `${device.is_https ? 'https' : 'http'}://${device.ip_address}:${device.port}/ISAPI/System/status`;
    
    // In production, implement proper HTTP request with digest auth
    // For now, just check if IP is reachable
    const isReachable = await checkIpReachable(device.ip_address);
    
    return isReachable;
  } catch (err) {
    console.error(`[DeviceService] testDeviceConnection error for ${device.ip_address}:`, err.message);
    return false;
  }
};

export const checkIpReachable = async (ipAddress) => {
  try {
    // Simple TCP port check
    const net = await import('net');
    
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const port = 80; // Default port, might need to be configurable
      
      socket.setTimeout(5000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.connect(port, ipAddress);
    });
  } catch (err) {
    return false;
  }
};