import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import hikvisionService from '../services/hikvisionService.js';

// Helper function to format database datetime to readable string
function convertToServerTime(dbDate) {
  if (!dbDate) return null;
  const date = new Date(dbDate);
  
  // Format: YYYY-MM-DD HH:MM:SS
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// CRM Pool for DimStore access
let crmPoolPromise = null;

async function getCrmPool() {
  if (crmPoolPromise) return crmPoolPromise;
  
  try {
    const config = {
      user: process.env.CRM_DB_USER || 'sa',
      password: process.env.CRM_DB_PASS || process.env.DB_PASS,
      server: process.env.CRM_DB_SERVER || '192.168.85.55',
      database: process.env.CRM_DB_NAME || 'DBWH_8555',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 15000,
      requestTimeout: 30000
    };
    
    const crmPool = new sql.ConnectionPool(config);
    crmPoolPromise = crmPool.connect();
    return crmPoolPromise;
  } catch (err) {
    console.error('[CCTV] Failed to connect to CRM Pool:', err.message);
    crmPoolPromise = null;
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// CCTV DEVICE MANAGEMENT WITH AUTO-DISCOVERY
// ═══════════════════════════════════════════════════════════════

export const getAllCCTVDevices = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { status, vendor, deviceType, locationId } = req.query;
    
    // Try with cross-database join first, fallback to simple query
    let query = `
      SELECT 
        d.*,
        NULL as location_name
      FROM CCTVDevices d
      WHERE d.is_active = 1
    `;
    
    const request = pool.request();
    
    if (status) {
      query += ` AND d.status = @status`;
      request.input('status', sql.NVarChar, status);
    }
    if (vendor) {
      query += ` AND d.vendor = @vendor`;
      request.input('vendor', sql.NVarChar, vendor);
    }
    if (deviceType) {
      query += ` AND d.device_type = @deviceType`;
      request.input('deviceType', sql.NVarChar, deviceType);
    }
    if (locationId) {
      query += ` AND d.location_id = @locationId`;
      request.input('locationId', sql.NVarChar, locationId);
    }
    
    query += ` ORDER BY d.status DESC, d.last_seen DESC`;
    
    const result = await request.query(query);
    
    // Convert UTC timestamps to Asia/Jakarta timezone
    result.recordset.forEach(device => {
      if (device.last_seen) device.last_seen = convertToServerTime(device.last_seen);
      if (device.last_poll) device.last_poll = convertToServerTime(device.last_poll);
      if (device.created_at) device.created_at = convertToServerTime(device.created_at);
      if (device.updated_at) device.updated_at = convertToServerTime(device.updated_at);
    });
    
    // Try to get location names from CRM Pool
    try {
      const crmPool = await getCrmPool();
      const locations = await crmPool.request()
        .query(`SELECT ORG_CD, ORG_NAME FROM DimStore WHERE ORG_STATUS = 'O'`);
      
      // Map location names to devices
      const locationMap = {};
      locations.recordset.forEach(loc => {
        locationMap[loc.ORG_CD] = loc.ORG_NAME;
      });
      
      result.recordset.forEach(device => {
        if (device.location_id && locationMap[device.location_id]) {
          device.location_name = locationMap[device.location_id];
        }
      });
    } catch (locErr) {
      console.log('[CCTV] Location lookup failed:', locErr.message);
      // Continue without location names
    }
    
    res.json({
      success: true,
      data: result.recordset,
      total: result.recordset.length
    });
  } catch (err) {
    console.error('[CCTV] getAllCCTVDevices error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getCCTVDeviceById = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    const deviceResult = await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        SELECT d.*, NULL as location_name
        FROM CCTVDevices d
        WHERE d.id = @id AND d.is_active = 1
      `);
    
    if (deviceResult.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    
    const device = deviceResult.recordset[0];
    
    // Convert timestamps to server time
    if (device.last_seen) device.last_seen = convertToServerTime(device.last_seen);
    if (device.last_poll) device.last_poll = convertToServerTime(device.last_poll);
    if (device.created_at) device.created_at = convertToServerTime(device.created_at);
    if (device.updated_at) device.updated_at = convertToServerTime(device.updated_at);
    
    // Try to get location name from CRM Pool
    if (device.location_id) {
      try {
        const crmPool = await getCrmPool();
        const locationResult = await crmPool.request()
          .input('orgCd', sql.NVarChar, device.location_id)
          .query(`SELECT ORG_NAME FROM DimStore WHERE ORG_STATUS='O' AND ORG_CD = @orgCd`);
        
        if (locationResult.recordset.length > 0) {
          device.location_name = locationResult.recordset[0].ORG_NAME;
        }
      } catch (locErr) {
        console.log('[CCTV] Location lookup failed:', locErr.message);
      }
    }
    
    // Get channels
    const channelsResult = await pool.request()
      .input('deviceId', sql.NVarChar, id)
      .query(`SELECT * FROM CCTVChannels WHERE device_id = @deviceId AND is_enabled = 1 ORDER BY channel_number`);
    
    // Get storage
    const storageResult = await pool.request()
      .input('deviceId', sql.NVarChar, id)
      .query(`SELECT * FROM CCTVStorage WHERE device_id = @deviceId ORDER BY disk_number`);
    
    // Convert timestamps for channels and storage
    channelsResult.recordset.forEach(channel => {
      if (channel.created_at) channel.created_at = convertToServerTime(channel.created_at);
      if (channel.updated_at) channel.updated_at = convertToServerTime(channel.updated_at);
    });
    
    storageResult.recordset.forEach(storage => {
      if (storage.created_at) storage.created_at = convertToServerTime(storage.created_at);
      if (storage.updated_at) storage.updated_at = convertToServerTime(storage.updated_at);
    });
    
    res.json({
      success: true,
      data: {
        ...device,
        channels: channelsResult.recordset,
        storage: storageResult.recordset
      }
    });
  } catch (err) {
    console.error('[CCTV] getCCTVDeviceById error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createCCTVDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { name, deviceType, vendor, model, ipAddress, port = 80, 
            username, password, isHttps = false, locationId, pollInterval = 300,
            autoDiscover = true } = req.body;
    
    // Check if device with this IP already exists (active)
    const existingDevice = await pool.request()
      .input('ipAddress', sql.NVarChar, ipAddress)
      .query(`SELECT id, name FROM CCTVDevices WHERE ip_address = @ipAddress AND is_active = 1`);
    
    if (existingDevice.recordset.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `Device with IP ${ipAddress} already exists: ${existingDevice.recordset[0].name}` 
      });
    }
    
    // Auto-discover device info, channels, and storage from Hikvision ISAPI
    let discoveredData = null;
    if (autoDiscover && vendor === 'Hikvision') {
      console.log(`[CCTV] Auto-discovering device: ${ipAddress}:${port}`);
      
      const discoverResult = await hikvisionService.autoDiscoverDevice(
        ipAddress, 
        port, 
        username, 
        password, 
        isHttps
      );
      
      if (discoverResult.success) {
        discoveredData = discoverResult.data;
        console.log(`[CCTV] Auto-discover successful:`, {
          device: discoveredData.device ? 'OK' : 'N/A',
          channels: discoveredData.channels.length,
          storage: discoveredData.storage.length
        });
      } else {
        console.log(`[CCTV] Auto-discover failed, continuing with manual data`);
      }
    }
    
    const id = `cctv-${Date.now()}`;
    const passwordHash = Buffer.from(password).toString('base64');
    
    // Use discovered model or provided model
    const finalModel = (discoveredData?.device?.deviceModel) || model || null;
    const finalName = name || discoveredData?.device?.deviceName || `Device ${ipAddress}`;
    
    // Use server time, not database GETDATE()
    const now = new Date();
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, finalName)
      .input('device_type', sql.NVarChar, deviceType)
      .input('vendor', sql.NVarChar, vendor)
      .input('model', sql.NVarChar, finalModel)
      .input('ip_address', sql.NVarChar, ipAddress)
      .input('port', sql.Int, port)
      .input('username', sql.NVarChar, username)
      .input('password_hash', sql.NVarChar, passwordHash)
      .input('is_https', sql.Bit, isHttps)
      .input('location_id', sql.NVarChar, locationId || null)
      .input('poll_interval', sql.Int, pollInterval)
      .input('created_at', sql.DateTime, now)
      .input('updated_at', sql.DateTime, now)
      .query(`
        INSERT INTO CCTVDevices (id, name, device_type, vendor, model, ip_address, port, username, password_hash, is_https, location_id, poll_interval, created_at, updated_at)
        VALUES (@id, @name, @device_type, @vendor, @model, @ip_address, @port, @username, @password_hash, @is_https, @location_id, @poll_interval, @created_at, @updated_at)
      `);
    
    // Save discovered channels
    if (discoveredData && discoveredData.channels && discoveredData.channels.length > 0) {
      console.log(`[CCTV] Saving ${discoveredData.channels.length} channels`);
      
      // First, disable any existing channels for this device (cleanup before insert)
      await pool.request()
        .input('device_id', sql.NVarChar, id)
        .query(`UPDATE CCTVChannels SET is_enabled = 0 WHERE device_id = @device_id`);
      
      for (const channel of discoveredData.channels) {
        const channelId = `${id}-ch${channel.id}`;
        const channelNumber = parseInt(channel.id) || 1;
        const channelName = `Channel ${channelNumber}`;
        const channelStatus = (channel.online === 'true' || channel.status === 'online') ? 'online' : 'offline';
        const isEnabled = true;
        const cameraIP = channel.ipAddress || null;
        
        // Store camera IP in channel_settings as JSON
        const channelSettings = cameraIP ? JSON.stringify({ camera_ip: cameraIP, protocol: channel.proxyProtocol }) : null;
        
        try {
          await pool.request()
            .input('id', sql.NVarChar, channelId)
            .input('device_id', sql.NVarChar, id)
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
        } catch (chErr) {
          // If duplicate, try update instead
          if (chErr.message.includes('duplicate') || chErr.message.includes('unique')) {
            await pool.request()
              .input('device_id', sql.NVarChar, id)
              .input('channel_number', sql.Int, channelNumber)
              .input('channel_name', sql.NVarChar, channelName)
              .input('status', sql.NVarChar, channelStatus)
              .input('is_enabled', sql.Bit, isEnabled)
              .input('channel_settings', sql.NVarChar, channelSettings)
              .input('updated_at', sql.DateTime, now)
              .query(`
                UPDATE CCTVChannels 
                SET channel_name = @channel_name, status = @status, is_enabled = @is_enabled, 
                    channel_settings = @channel_settings, updated_at = @updated_at
                WHERE device_id = @device_id AND channel_number = @channel_number
              `);
          } else {
            throw chErr;
          }
        }
      }
    }
    
    // Save discovered storage
    if (discoveredData && discoveredData.storage && discoveredData.storage.length > 0) {
      console.log(`[CCTV] Saving ${discoveredData.storage.length} storage devices`);
      
      // First, delete any existing storage for this device (cleanup before insert)
      await pool.request()
        .input('device_id', sql.NVarChar, id)
        .query(`DELETE FROM CCTVStorage WHERE device_id = @device_id`);
      
      for (const storage of discoveredData.storage) {
        const storageId = `${id}-hdd${storage.id}`;
        const diskNumber = parseInt(storage.id) || 1;
        const diskName = storage.name || `HDD ${diskNumber}`;
        
        // Hikvision returns MB, convert to bytes for bigint
        const totalSpace = storage.capacity ? parseInt(storage.capacity) * 1024 * 1024 : 0; // MB to bytes
        const freeSpace = storage.freeSpace ? parseInt(storage.freeSpace) * 1024 * 1024 : 0;
        const usedSpace = totalSpace - freeSpace;
        const usagePercentage = storage.usagePercentage || (totalSpace > 0 ? ((usedSpace / totalSpace) * 100).toFixed(2) : 0);
        const diskStatus = storage.status === 'ok' || storage.status === 'normal' ? 'normal' : 'error';
        const diskType = storage.type || 'HDD';
        
        try {
          await pool.request()
            .input('id', sql.NVarChar, storageId)
            .input('device_id', sql.NVarChar, id)
            .input('disk_number', sql.Int, diskNumber)
            .input('disk_name', sql.NVarChar, diskName)
            .input('total_space', sql.BigInt, totalSpace)
            .input('free_space', sql.BigInt, freeSpace)
            .input('used_space', sql.BigInt, usedSpace)
            .input('usage_percentage', sql.Decimal(5, 2), parseFloat(usagePercentage))
            .input('status', sql.NVarChar, diskStatus)
            .input('disk_type', sql.NVarChar, diskType)
            .input('created_at', sql.DateTime, now)
            .input('updated_at', sql.DateTime, now)
            .query(`
              INSERT INTO CCTVStorage (id, device_id, disk_number, disk_name, total_space, used_space, free_space, usage_percentage, status, disk_type, created_at, updated_at)
              VALUES (@id, @device_id, @disk_number, @disk_name, @total_space, @used_space, @free_space, @usage_percentage, @status, @disk_type, @created_at, @updated_at)
            `);
        } catch (stErr) {
          // If duplicate, try update instead
          if (stErr.message.includes('duplicate') || stErr.message.includes('unique')) {
            await pool.request()
              .input('device_id', sql.NVarChar, id)
              .input('disk_number', sql.Int, diskNumber)
              .input('disk_name', sql.NVarChar, diskName)
              .input('total_space', sql.BigInt, totalSpace)
              .input('free_space', sql.BigInt, freeSpace)
              .input('used_space', sql.BigInt, usedSpace)
              .input('usage_percentage', sql.Decimal(5, 2), parseFloat(usagePercentage))
              .input('status', sql.NVarChar, diskStatus)
              .input('disk_type', sql.NVarChar, diskType)
              .input('updated_at', sql.DateTime, now)
              .query(`
                UPDATE CCTVStorage 
                SET disk_name = @disk_name, total_space = @total_space, used_space = @used_space,
                    free_space = @free_space, usage_percentage = @usage_percentage, 
                    status = @status, disk_type = @disk_type, updated_at = @updated_at
                WHERE device_id = @device_id AND disk_number = @disk_number
              `);
          } else {
            throw stErr;
          }
        }
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'CCTV Device created successfully',
      data: { 
        id, 
        name: finalName, 
        vendor, 
        deviceType, 
        ipAddress,
        autoDiscovered: discoveredData !== null,
        channels: discoveredData?.channels?.length || 0,
        storage: discoveredData?.storage?.length || 0
      }
    });
  } catch (err) {
    console.error('[CCTV] createCCTVDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateCCTVDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    const updates = [];
    const request = pool.request().input('id', sql.NVarChar, id);
    
    const fields = {
      name: sql.NVarChar,
      device_type: sql.NVarChar,
      vendor: sql.NVarChar,
      model: sql.NVarChar,
      ip_address: sql.NVarChar,
      port: sql.Int,
      username: sql.NVarChar,
      is_https: sql.Bit,
      location_id: sql.NVarChar,
      poll_interval: sql.Int,
      is_active: sql.Bit
    };
    
    Object.keys(fields).forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = @${field}`);
        request.input(field, fields[field], req.body[field]);
      }
    });
    
    if (req.body.password) {
      updates.push('password_hash = @password_hash');
      request.input('password_hash', sql.NVarChar, Buffer.from(req.body.password).toString('base64'));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    // Use server time for updated_at
    updates.push('updated_at = @updated_at');
    request.input('updated_at', sql.DateTime, new Date());
    
    await request.query(`UPDATE CCTVDevices SET ${updates.join(', ')} WHERE id = @id`);
    
    res.json({ success: true, message: 'CCTV Device updated successfully' });
  } catch (err) {
    console.error('[CCTV] updateCCTVDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteCCTVDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    // Soft delete with server time
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('updated_at', sql.DateTime, new Date())
      .query(`UPDATE CCTVDevices SET is_active = 0, status = 'offline', updated_at = @updated_at WHERE id = @id`);
    
    res.json({ success: true, message: 'CCTV Device deleted successfully' });
  } catch (err) {
    console.error('[CCTV] deleteCCTVDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// CCTV DASHBOARD
// ═══════════════════════════════════════════════════════════════

export const getCCTVDashboard = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    const [deviceStats, channelStats, storageStats, recentLogs] = await Promise.all([
      // Device statistics
      pool.request().query(`
        SELECT 
          COUNT(*) as total_devices,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_devices,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_devices,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_devices
        FROM CCTVDevices WHERE is_active = 1
      `),
      
      // Channel statistics
      pool.request().query(`
        SELECT 
          COUNT(*) as total_channels,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_channels,
          SUM(CASE WHEN status IN ('offline', 'video_loss', 'no_signal') THEN 1 ELSE 0 END) as offline_channels,
          SUM(CASE WHEN is_recording = 1 THEN 1 ELSE 0 END) as recording_channels
        FROM CCTVChannels WHERE is_enabled = 1
      `),
      
      // Storage statistics
      pool.request().query(`
        SELECT 
          COUNT(*) as total_disks,
          SUM(CASE WHEN status = 'normal' THEN 1 ELSE 0 END) as normal_disks,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_disks,
          SUM(CASE WHEN usage_percentage >= 95 THEN 1 ELSE 0 END) as critical_disks,
          SUM(CASE WHEN usage_percentage >= 80 AND usage_percentage < 95 THEN 1 ELSE 0 END) as warning_disks
        FROM CCTVStorage
      `),
      
      // Recent logs
      pool.request().query(`
        SELECT TOP 10 ml.*, d.name as device_name
        FROM CCTVMonitoringLogs ml
        JOIN CCTVDevices d ON ml.device_id = d.id
        WHERE ml.severity IN ('critical', 'high') AND ml.is_resolved = 0
        ORDER BY ml.created_at DESC
      `)
    ]);
    
    // Convert timestamps for recent logs
    recentLogs.recordset.forEach(log => {
      if (log.created_at) log.created_at = convertToServerTime(log.created_at);
      if (log.resolved_at) log.resolved_at = convertToServerTime(log.resolved_at);
    });
    
    // Try to get location statistics (optional)
    let locationStats = { recordset: [] };
    try {
      const crmPool = await getCrmPool();
      const devicesForLocation = await pool.request().query(`
        SELECT location_id, status FROM CCTVDevices WHERE is_active = 1 AND location_id IS NOT NULL
      `);
      
      const storeResult = await crmPool.request().query(`
        SELECT ORG_CD, ORG_NAME FROM DimStore WHERE ORG_STATUS = 'O'
      `);
      
      // Group devices by location
      const locationMap = {};
      devicesForLocation.recordset.forEach(device => {
        if (!locationMap[device.location_id]) {
          locationMap[device.location_id] = { total: 0, online: 0 };
        }
        locationMap[device.location_id].total++;
        if (device.status === 'online') {
          locationMap[device.location_id].online++;
        }
      });
      
      // Combine with store names
      locationStats.recordset = storeResult.recordset
        .map(store => ({
          location_name: store.ORG_NAME,
          device_count: locationMap[store.ORG_CD]?.total || 0,
          online_count: locationMap[store.ORG_CD]?.online || 0
        }))
        .filter(loc => loc.device_count > 0);
        
    } catch (locErr) {
      console.log('[CCTV] Location stats failed:', locErr.message);
    }
    
    res.json({
      success: true,
      data: {
        devices: deviceStats.recordset[0],
        channels: channelStats.recordset[0],
        storage: storageStats.recordset[0],
        byLocation: locationStats.recordset,
        recentAlerts: recentLogs.recordset
      }
    });
  } catch (err) {
    console.error('[CCTV] getCCTVDashboard error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// CCTV MONITORING LOGS
// ═══════════════════════════════════════════════════════════════

export const getCCTVLogs = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { deviceId, severity, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ml.*, d.name as device_name
      FROM CCTVMonitoringLogs ml
      JOIN CCTVDevices d ON ml.device_id = d.id
      WHERE 1=1
    `;
    
    const request = pool.request();
    
    if (deviceId) {
      query += ` AND ml.device_id = @deviceId`;
      request.input('deviceId', sql.NVarChar, deviceId);
    }
    if (severity) {
      query += ` AND ml.severity = @severity`;
      request.input('severity', sql.NVarChar, severity);
    }
    
    query += ` ORDER BY ml.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, parseInt(limit));
    
    const result = await request.query(query);
    
    // Convert timestamps
    result.recordset.forEach(log => {
      if (log.created_at) log.created_at = convertToServerTime(log.created_at);
      if (log.resolved_at) log.resolved_at = convertToServerTime(log.resolved_at);
    });
    
    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error('[CCTV] getCCTVLogs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const resolveCCTVLog = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('resolved_at', sql.DateTime, new Date())
      .query(`
        UPDATE CCTVMonitoringLogs 
        SET is_resolved = 1, resolved_at = @resolved_at
        WHERE id = @id
      `);
    
    res.json({ success: true, message: 'Log resolved successfully' });
  } catch (err) {
    console.error('[CCTV] resolveCCTVLog error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// CCTV LOCATIONS - Using DimStore (same as Centaur Devices)
// ═══════════════════════════════════════════════════════════════

export const getAllCCTVLocations = async (req, res) => {
  try {
    // Get stores from DimStore table using CRM Pool
    try {
      const crmPool = await getCrmPool();
      const result = await crmPool.request()
        .query(`
          SELECT DISTINCT 
            ORG_CD AS org_cd, 
            ORG_NAME AS org_name,
            ORG_CD AS id,
            ORG_NAME AS name
          FROM DimStore 
          WHERE ORG_STATUS = 'O'
          ORDER BY ORG_CD ASC
        `);
      
      res.json({
        success: true,
        data: result.recordset
      });
    } catch (dbErr) {
      console.log('[CCTV] DimStore access failed:', dbErr.message);
      res.json({
        success: true,
        data: [],
        message: 'Location data unavailable'
      });
    }
  } catch (err) {
    console.error('[CCTV] getAllCCTVLocations error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ═══════════════════════════════════════════════════════════════
// HIKVISION ISAPI AUTO-DISCOVERY
// ═══════════════════════════════════════════════════════════════

/**
 * Test connection to Hikvision device
 * POST /api/cctv/test-connection
 */
export const testConnection = async (req, res) => {
  try {
    const { ipAddress, port = 80, username, password, isHttps = false } = req.body;
    
    if (!ipAddress || !username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'IP Address, Username, and Password are required' 
      });
    }
    
    console.log(`[CCTV] Testing connection to ${ipAddress}:${port}`);
    
    const result = await hikvisionService.testConnection(ipAddress, port, username, password, isHttps);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (err) {
    console.error('[CCTV] testConnection error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Auto-discover device information
 * POST /api/cctv/discover
 */
export const discoverDevice = async (req, res) => {
  try {
    const { ipAddress, port = 80, username, password, isHttps = false } = req.body;
    
    if (!ipAddress || !username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'IP Address, Username, and Password are required' 
      });
    }
    
    console.log(`[CCTV] Discovering device at ${ipAddress}:${port}`);
    
    const result = await hikvisionService.autoDiscoverDevice(ipAddress, port, username, password, isHttps);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Device discovery completed',
        data: result.data
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to discover device information'
      });
    }
  } catch (err) {
    console.error('[CCTV] discoverDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Trigger manual poll for all devices
 * POST /api/cctv/poll-now
 */
export const triggerPollNow = async (req, res) => {
  try {
    console.log('[CCTV] Manual poll triggered via API');
    
    const pool = await poolPromise;
    const devices = await pool.request()
      .query(`SELECT * FROM CCTVDevices WHERE is_active = 1`);
    
    let successCount = 0;
    let failedCount = 0;
    const now = new Date();
    
    for (const device of devices.recordset) {
      try {
        // Decrypt password
        const password = Buffer.from(device.password_hash, 'base64').toString('utf-8');
        
        // Test connection
        const testResult = await hikvisionService.testConnection(
          device.ip_address,
          device.port,
          device.username,
          password,
          device.is_https
        );
        
        const newStatus = testResult.success ? 'online' : 'offline';
        const lastSeen = testResult.success ? now : device.last_seen;
        
        // Update device status with server time
        await pool.request()
          .input('deviceId', sql.NVarChar, device.id)
          .input('status', sql.NVarChar, newStatus)
          .input('last_poll', sql.DateTime, now)
          .input('last_seen', sql.DateTime, lastSeen)
          .query(`
            UPDATE CCTVDevices 
            SET status = @status, 
                last_poll = @last_poll,
                last_seen = @last_seen
            WHERE id = @deviceId
          `);
        
        if (testResult.success) {
          successCount++;
          console.log(`[CCTV] ${device.name}: online`);
        } else {
          failedCount++;
          console.log(`[CCTV] ${device.name}: offline`);
        }
      } catch (err) {
        failedCount++;
        console.error(`[CCTV] Error polling ${device.name}:`, err.message);
        
        // Mark as offline on error with server time
        await pool.request()
          .input('deviceId', sql.NVarChar, device.id)
          .input('last_poll', sql.DateTime, now)
          .query(`
            UPDATE CCTVDevices 
            SET status = 'offline', last_poll = @last_poll
            WHERE id = @deviceId
          `);
      }
    }
    
    res.json({
      success: true,
      message: 'Manual poll completed',
      data: {
        total: devices.recordset.length,
        online: successCount,
        offline: failedCount
      }
    });
  } catch (err) {
    console.error('[CCTV] triggerPollNow error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};