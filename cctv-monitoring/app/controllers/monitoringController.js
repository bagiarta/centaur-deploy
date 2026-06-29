import sql from 'mssql';
import { poolPromise } from '../../config/db.js';
import { getIO } from '../../config/socket.js';

export const getMonitoringLogs = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { deviceId, page = 1, limit = 50, logType, eventType, severity, isResolved } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ml.*, d.name as device_name
      FROM MonitoringLogs ml
      JOIN Devices d ON ml.device_id = d.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (deviceId) {
      query += ` AND ml.device_id = @deviceId`;
      params.push({ name: 'deviceId', value: deviceId, type: sql.NVarChar });
    }
    if (logType) {
      query += ` AND ml.log_type = @logType`;
      params.push({ name: 'logType', value: logType, type: sql.NVarChar });
    }
    if (eventType) {
      query += ` AND ml.event_type = @eventType`;
      params.push({ name: 'eventType', value: eventType, type: sql.NVarChar });
    }
    if (severity) {
      query += ` AND ml.severity = @severity`;
      params.push({ name: 'severity', value: severity, type: sql.NVarChar });
    }
    if (isResolved !== undefined) {
      query += ` AND ml.is_resolved = @isResolved`;
      params.push({ name: 'isResolved', value: isResolved === 'true', type: sql.Bit });
    }
    
    query += ` ORDER BY ml.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    
    const result = await pool.request()
      .query(query, ...params);
    
    const countResult = await pool.request()
      .query(`
        SELECT COUNT(*) as total FROM MonitoringLogs 
        WHERE 1=1 ${deviceId ? 'AND device_id = @deviceId' : ''}
      `, ...params.filter(p => p.name !== 'offset' && p.name !== 'limit'));
    
    res.json({
      success: true,
      data: result.recordset.map(log => ({
        ...log,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
        created_at: log.created_at ? log.created_at.toISOString() : null
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total
      }
    });
  } catch (err) {
    console.error('[MonitoringController] getMonitoringLogs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getRecentLogs = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { limit = 100, severity } = req.query;
    
    let query = `
      SELECT ml.*, d.name as device_name, l.name as location_name
      FROM MonitoringLogs ml
      JOIN Devices d ON ml.device_id = d.id
      LEFT JOIN Locations l ON d.location_id = l.id
      WHERE ml.created_at >= DATEADD(HOUR, -24, GETDATE())
    `;
    
    const params = [];
    
    if (severity) {
      query += ` AND ml.severity = @severity`;
      params.push({ name: 'severity', value: severity, type: sql.NVarChar });
    }
    
    query += ` ORDER BY ml.created_at DESC OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;
    
    const result = await pool.request()
      .input('limit', sql.Int, parseInt(limit))
      .query(query, ...params);
    
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('[MonitoringController] getRecentLogs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const resolveLog = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { id } = req.params;
    
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT * FROM MonitoringLogs WHERE id = @id');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Log not found' });
    }
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        UPDATE MonitoringLogs 
        SET is_resolved = 1, 
            resolved_at = GETDATE(),
            updated_at = GETDATE()
        WHERE id = @id
      `);
    
    const log = result.recordset[0];
    
    res.json({
      success: true,
      message: 'Log resolved successfully',
      data: {
        id: log.id,
        is_resolved: 1,
        resolved_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[MonitoringController] resolveLog error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const resolveMultipleLogs = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { logIds, severity } = req.body;
    
    if (!logIds && !severity) {
      return res.status(400).json({ success: false, error: 'logIds or severity required' });
    }
    
    const updates = [];
    const params = [];
    
    if (logIds && Array.isArray(logIds) && logIds.length > 0) {
      updates.push('id IN (@logIds)');
      params.push({ name: 'logIds', value: logIds, type: sql.NVarChar });
    }
    if (severity) {
      updates.push('severity = @severity');
      params.push({ name: 'severity', value: severity, type: sql.NVarChar });
    }
    
    const query = `
      UPDATE MonitoringLogs 
      SET is_resolved = 1, 
          resolved_at = GETDATE(),
          updated_at = GETDATE()
      WHERE ${updates.join(' AND ')}
    `;
    
    await pool.request()
      .query(query, ...params);
    
    res.json({
      success: true,
      message: 'Logs resolved successfully'
    });
  } catch (err) {
    console.error('[MonitoringController] resolveMultipleLogs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getUnresolvedAlerts = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { severity, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ml.*, d.name as device_name, l.name as location_name
      FROM MonitoringLogs ml
      JOIN Devices d ON ml.device_id = d.id
      LEFT JOIN Locations l ON d.location_id = l.id
      WHERE ml.is_resolved = 0
    `;
    
    const params = [];
    
    if (severity) {
      query += ` AND ml.severity = @severity`;
      params.push({ name: 'severity', value: severity, type: sql.NVarChar });
    }
    
    query += ` ORDER BY ml.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    
    const result = await pool.request()
      .query(query, ...params);
    
    const countResult = await pool.request()
      .query(`
        SELECT COUNT(*) as total FROM MonitoringLogs 
        WHERE is_resolved = 0
      `);
    
    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.recordset[0].total
      }
    });
  } catch (err) {
    console.error('[MonitoringController] getUnresolvedAlerts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getDeviceHealth = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { deviceId } = req.params;
    
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, deviceId)
      .query(`
        SELECT 
          d.id,
          d.name,
          d.status as device_status,
          d.last_seen,
          d.last_poll,
          d.is_active,
          d.device_type,
          d.vendor,
          d.model,
          d.ip_address,
          l.name as location_name,
          
          (SELECT COUNT(*) FROM DeviceChannels WHERE device_id = @deviceId AND is_enabled = 1) as total_channels,
          (SELECT COUNT(*) FROM DeviceChannels WHERE device_id = @deviceId AND status = 'online' AND is_enabled = 1) as online_channels,
          (SELECT COUNT(*) FROM DeviceChannels WHERE device_id = @deviceId AND status IN ('offline', 'video_loss', 'no_signal') AND is_enabled = 1) as offline_channels,
          
          (SELECT COUNT(*) FROM DeviceStorage WHERE device_id = @deviceId) as total_disks,
          (SELECT COUNT(*) FROM DeviceStorage WHERE device_id = @deviceId AND status = 'normal') as healthy_disks,
          (SELECT COUNT(*) FROM DeviceStorage WHERE device_id = @deviceId AND status != 'normal') as problematic_disks,
          
          (SELECT COUNT(*) FROM MonitoringLogs WHERE device_id = @deviceId AND is_resolved = 0 AND severity IN ('critical', 'high')) as active_alerts,
          (SELECT COUNT(*) FROM MonitoringLogs WHERE device_id = @deviceId AND created_at >= DATEADD(DAY, -7, GETDATE())) as last_week_logs
        FROM Devices d
        LEFT JOIN Locations l ON d.location_id = l.id
        WHERE d.id = @deviceId AND d.is_active = 1
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    
    const device = result.recordset[0];
    const healthScore = calculateHealthScore(device);
    
    res.json({
      success: true,
      data: {
        ...device,
        health_score: healthScore,
        health_status: getHealthStatus(healthScore)
      }
    });
  } catch (err) {
    console.error('[MonitoringController] getDeviceHealth error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

function calculateHealthScore(device) {
  let score = 100;
  
  // Device status
  if (device.device_status === 'offline') score -= 50;
  else if (device.device_status === 'error') score -= 30;
  
  // Online channels ratio
  if (device.total_channels > 0) {
    const channelRatio = device.online_channels / device.total_channels;
    score -= (1 - channelRatio) * 20;
  }
  
  // Disk health
  if (device.total_disks > 0) {
    const diskRatio = device.healthy_disks / device.total_disks;
    score -= (1 - diskRatio) * 20;
  }
  
  // Active alerts
  score -= device.active_alerts * 5;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getHealthStatus(healthScore) {
  if (healthScore >= 90) return 'healthy';
  if (healthScore >= 70) return 'warning';
  if (healthScore >= 50) return 'critical';
  return 'failed';
}