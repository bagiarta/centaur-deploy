import sql from 'mssql';
import { poolPromise } from '../../config/db.js';
import { getIO } from '../../config/socket.js';
import * as deviceService from '../services/deviceService.js';

export const getAllDevices = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { status, vendor, deviceType, locationId, is_active = true } = req.query;
    
    let query = `
      SELECT d.*, l.name as location_name
      FROM Devices d
      LEFT JOIN Locations l ON d.location_id = l.id
      WHERE d.is_active = @is_active
    `;
    
    const params = { is_active: Boolean(is_active) };
    
    if (status) {
      query += ` AND d.status = @status`;
      params.status = status;
    }
    if (vendor) {
      query += ` AND d.vendor = @vendor`;
      params.vendor = vendor;
    }
    if (deviceType) {
      query += ` AND d.device_type = @deviceType`;
      params.deviceType = deviceType;
    }
    if (locationId) {
      query += ` AND d.location_id = @locationId`;
      params.locationId = locationId;
    }
    
    query += ` ORDER BY d.status DESC, d.last_seen DESC`;
    
    const result = await pool.request()
      .input('is_active', sql.Bit, params.is_active)
      .query(query);
    
    const devices = result.recordset;
    
    // Parse JSON fields
    const parsedDevices = devices.map(device => ({
      ...device,
      device_info: device.device_info ? JSON.parse(device.device_info) : null,
      connection_settings: device.connection_settings ? JSON.parse(device.connection_settings) : null,
      last_seen: device.last_seen ? device.last_seen.toISOString() : null,
      last_poll: device.last_poll ? device.last_poll.toISOString() : null,
      created_at: device.created_at ? device.created_at.toISOString() : null,
      updated_at: device.updated_at ? device.updated_at.toISOString() : null
    }));
    
    res.json({
      success: true,
      data: parsedDevices,
      total: parsedDevices.length,
      status: {
        online: parsedDevices.filter(d => d.status === 'online').length,
        offline: parsedDevices.filter(d => d.status === 'offline').length,
        error: parsedDevices.filter(d => d.status === 'error').length
      }
    });
  } catch (err) {
    console.error('[DeviceController] getAllDevices error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getDeviceById = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        SELECT d.*, l.name as location_name, l.latitude, l.longitude
        FROM Devices d
        LEFT JOIN Locations l ON d.location_id = l.id
        WHERE d.id = @id AND d.is_active = 1
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    
    const device = result.recordset[0];
    
    // Get device channels
    const channelsResult = await pool.request()
      .input('deviceId', sql.NVarChar, id)
      .query(`
        SELECT * FROM DeviceChannels 
        WHERE device_id = @deviceId AND is_enabled = 1
        ORDER BY channel_number
      `);
    
    // Get device storage
    const storageResult = await pool.request()
      .input('deviceId', sql.NVarChar, id)
      .query(`
        SELECT * FROM DeviceStorage 
        WHERE device_id = @deviceId
        ORDER BY disk_number
      `);
    
    res.json({
      success: true,
      data: {
        ...device,
        device_info: device.device_info ? JSON.parse(device.device_info) : null,
        connection_settings: device.connection_settings ? JSON.parse(device.connection_settings) : null,
        channels: channelsResult.recordset.map(c => ({
          ...c,
          channel_settings: c.channel_settings ? JSON.parse(c.channel_settings) : null,
          last_seen: c.last_seen ? c.last_seen.toISOString() : null
        })),
        storage: storageResult.recordset.map(s => ({
          ...s,
          disk_info: s.disk_info ? JSON.parse(s.disk_info) : null,
          last_checked: s.last_checked ? s.last_checked.toISOString() : null
        }))
      }
    });
  } catch (err) {
    console.error('[DeviceController] getDeviceById error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const createDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { name, deviceType, vendor, model, firmwareVersion, serialNumber, 
            ipAddress, port, username, password, isHttps = false, locationId,
            deviceInfo, connectionSettings, pollInterval = 300 } = req.body;
    
    const id = `dev-${Date.now()}`;
    const passwordHash = Buffer.from(password).toString('base64'); // Simple encoding, use bcrypt in production
    
    const now = new Date().toISOString();
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('device_type', sql.NVarChar, deviceType)
      .input('vendor', sql.NVarChar, vendor)
      .input('model', sql.NVarChar, model || null)
      .input('firmware_version', sql.NVarChar, firmwareVersion || null)
      .input('serial_number', sql.NVarChar, serialNumber || null)
      .input('ip_address', sql.NVarChar, ipAddress)
      .input('port', sql.Int, port)
      .input('username', sql.NVarChar, username)
      .input('password_hash', sql.NVarChar, passwordHash)
      .input('is_https', sql.Bit, isHttps)
      .input('location_id', sql.NVarChar, locationId || null)
      .input('status', sql.NVarChar, 'offline')
      .input('device_info', sql.NVarChar, deviceInfo ? JSON.stringify(deviceInfo) : null)
      .input('connection_settings', sql.NVarChar, connectionSettings ? JSON.stringify(connectionSettings) : null)
      .input('poll_interval', sql.Int, pollInterval)
      .input('created_at', sql.NVarChar, now)
      .input('updated_at', sql.NVarChar, now)
      .query(`
        INSERT INTO Devices (id, name, device_type, vendor, model, firmware_version, serial_number,
                            ip_address, port, username, password_hash, is_https, location_id,
                            status, device_info, connection_settings, poll_interval, created_at, updated_at)
        VALUES (@id, @name, @device_type, @vendor, @model, @firmware_version, @serial_number,
                @ip_address, @port, @username, @password_hash, @is_https, @location_id,
                @status, @device_info, @connection_settings, @poll_interval, @created_at, @updated_at)
      `);
    
    res.status(201).json({
      success: true,
      message: 'Device created successfully',
      data: { id, name, vendor, deviceType, ipAddress }
    });
  } catch (err) {
    console.error('[DeviceController] createDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    const { name, deviceType, vendor, model, firmwareVersion, serialNumber,
            ipAddress, port, username, password, isHttps, locationId,
            deviceInfo, connectionSettings, pollInterval, isEnabled } = req.body;
    
    const params = [];
    const updates = [];
    
    if (name !== undefined) { updates.push('name = @name'); params.push({ name, type: sql.NVarChar }); }
    if (deviceType !== undefined) { updates.push('device_type = @device_type'); params.push({ name: 'device_type', value: deviceType, type: sql.NVarChar }); }
    if (vendor !== undefined) { updates.push('vendor = @vendor'); params.push({ name: 'vendor', value: vendor, type: sql.NVarChar }); }
    if (model !== undefined) { updates.push('model = @model'); params.push({ name: 'model', value: model, type: sql.NVarChar }); }
    if (firmwareVersion !== undefined) { updates.push('firmware_version = @firmware_version'); params.push({ name: 'firmware_version', value: firmwareVersion, type: sql.NVarChar }); }
    if (serialNumber !== undefined) { updates.push('serial_number = @serial_number'); params.push({ name: 'serial_number', value: serialNumber, type: sql.NVarChar }); }
    if (ipAddress !== undefined) { updates.push('ip_address = @ip_address'); params.push({ name: 'ip_address', value: ipAddress, type: sql.NVarChar }); }
    if (port !== undefined) { updates.push('port = @port'); params.push({ name: 'port', value: port, type: sql.Int }); }
    if (username !== undefined) { updates.push('username = @username'); params.push({ name: 'username', value: username, type: sql.NVarChar }); }
    if (password !== undefined) { updates.push('password_hash = @password_hash'); params.push({ name: 'password_hash', value: Buffer.from(password).toString('base64'), type: sql.NVarChar }); }
    if (isHttps !== undefined) { updates.push('is_https = @is_https'); params.push({ name: 'is_https', value: isHttps, type: sql.Bit }); }
    if (locationId !== undefined) { updates.push('location_id = @location_id'); params.push({ name: 'location_id', value: locationId, type: sql.NVarChar }); }
    if (pollInterval !== undefined) { updates.push('poll_interval = @poll_interval'); params.push({ name: 'poll_interval', value: pollInterval, type: sql.Int }); }
    if (isEnabled !== undefined) { updates.push('is_active = @is_active'); params.push({ name: 'is_active', value: isEnabled, type: sql.Bit }); }
    
    if (deviceInfo !== undefined) {
      updates.push('device_info = @device_info');
      params.push({ name: 'device_info', value: JSON.stringify(deviceInfo), type: sql.NVarChar });
    }
    if (connectionSettings !== undefined) {
      updates.push('connection_settings = @connection_settings');
      params.push({ name: 'connection_settings', value: JSON.stringify(connectionSettings), type: sql.NVarChar });
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    updates.push('updated_at = @updated_at');
    params.push({ name: 'updated_at', value: new Date().toISOString(), type: sql.NVarChar });
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        UPDATE Devices SET ${updates.join(', ')} WHERE id = @id
      `, ...params);
    
    res.json({
      success: true,
      message: 'Device updated successfully'
    });
  } catch (err) {
    console.error('[DeviceController] updateDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const deleteDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    
    try {
      // Soft delete by setting is_active = 0
      await transaction.request()
        .input('id', sql.NVarChar, id)
        .query('UPDATE Devices SET is_active = 0, status = 'offline' WHERE id = @id');
      
      await transaction.commit();
      
      res.json({
        success: true,
        message: 'Device deleted successfully'
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('[DeviceController] deleteDevice error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getDeviceStatus = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        SELECT id, name, status, last_seen, last_poll, is_active, 
               DATEDIFF(SECOND, last_seen, GETDATE()) as seconds_since_seen
        FROM Devices WHERE id = @id
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    
    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    console.error('[DeviceController] getDeviceStatus error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getOnlineDevices = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    const result = await pool.request()
      .query(`
        SELECT id, name, ip_address, port, vendor, device_type, 
               location_id, status, last_seen, last_poll
        FROM Devices 
        WHERE status = 'online' AND is_active = 1
        ORDER BY last_seen DESC
      `);
    
    res.json({
      success: true,
      data: result.recordset,
      total: result.recordset.length
    });
  } catch (err) {
    console.error('[DeviceController] getOnlineDevices error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getDeviceChannels = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { deviceId } = req.params;
    const { status, isEnabled = true } = req.query;
    
    let query = `
      SELECT dc.*, d.name as device_name, d.ip_address
      FROM DeviceChannels dc
      JOIN Devices d ON dc.device_id = d.id
      WHERE dc.device_id = @deviceId AND dc.is_enabled = @isEnabled
    `;
    
    if (status) {
      query += ` AND dc.status = @status`;
    }
    
    query += ` ORDER BY dc.channel_number`;
    
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, deviceId)
      .input('isEnabled', sql.Bit, isEnabled)
      .query(query);
    
    res.json({
      success: true,
      data: result.recordset.map(channel => ({
        ...channel,
        channel_settings: channel.channel_settings ? JSON.parse(channel.channel_settings) : null,
        last_seen: channel.last_seen ? channel.last_seen.toISOString() : null
      }))
    });
  } catch (err) {
    console.error('[DeviceController] getDeviceChannels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getDeviceStorage = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { deviceId } = req.params;
    
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, deviceId)
      .query(`
        SELECT * FROM DeviceStorage 
        WHERE device_id = @deviceId
        ORDER BY disk_number
      `);
    
    res.json({
      success: true,
      data: result.recordset.map(storage => ({
        ...storage,
        disk_info: storage.disk_info ? JSON.parse(storage.disk_info) : null,
        last_checked: storage.last_checked ? storage.last_checked.toISOString() : null
      }))
    });
  } catch (err) {
    console.error('[DeviceController] getDeviceStorage error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};