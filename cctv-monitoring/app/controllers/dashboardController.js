import sql from 'mssql';
import { poolPromise } from '../../config/db.js';

export const getDashboardSummary = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    const queries = [
      // Total devices
      'SELECT COUNT(*) as total_devices FROM Devices WHERE is_active = 1',
      
      // Device status counts
      'SELECT status, COUNT(*) as count FROM Devices WHERE is_active = 1 GROUP BY status',
      
      // Total channels
      'SELECT COUNT(*) as total_channels FROM DeviceChannels WHERE is_enabled = 1',
      
      // Channel status counts
      'SELECT status, COUNT(*) as count FROM DeviceChannels WHERE is_enabled = 1 GROUP BY status',
      
      // Storage alerts
      `SELECT 
        COUNT(*) as total_storage,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN usage_percentage >= 95 THEN 1 ELSE 0 END) as critical_count,
        SUM(CASE WHEN usage_percentage >= 80 AND usage_percentage < 95 THEN 1 ELSE 0 END) as warning_count
      FROM DeviceStorage`,
      
      // Devices by location
      `SELECT 
        l.name as location_name,
        COUNT(d.id) as device_count,
        SUM(CASE WHEN d.status = 'online' THEN 1 ELSE 0 END) as online_count,
        SUM(CASE WHEN d.status = 'offline' THEN 1 ELSE 0 END) as offline_count
      FROM Locations l
      LEFT JOIN Devices d ON l.id = d.location_id AND d.is_active = 1
      GROUP BY l.name, l.id`,
      
      // Devices by type
      `SELECT 
        device_type,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_count
      FROM Devices WHERE is_active = 1
      GROUP BY device_type`,
      
      // Devices by vendor
      `SELECT 
        vendor,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_count
      FROM Devices WHERE is_active = 1
      GROUP BY vendor`,
      
      // Recent alerts (unresolved high/critical)
      `SELECT COUNT(*) as alert_count FROM MonitoringLogs 
       WHERE severity IN ('critical', 'high') AND is_resolved = 0`,
      
      // Last 24 hours activity
      `SELECT 
        COUNT(*) as total_logs,
        SUM(CASE WHEN log_type = 'device_status' THEN 1 ELSE 0 END) as device_status_logs,
        SUM(CASE WHEN log_type = 'channel_status' THEN 1 ELSE 0 END) as channel_status_logs,
        SUM(CASE WHEN log_type = 'storage_status' THEN 1 ELSE 0 END) as storage_status_logs
      FROM MonitoringLogs 
      WHERE created_at >= DATEADD(DAY, -1, GETDATE())`
    ];
    
    const results = await Promise.all(queries.map(query => pool.request().query(query)));
    
    const summary = {
      totalDevices: results[0].recordset[0].total_devices,
      deviceStatus: {},
      totalChannels: results[2].recordset[0].total_channels,
      channelStatus: {},
      storageAlerts: results[3].recordset[0],
      devicesByLocation: results[4].recordset,
      devicesByType: results[5].recordset,
      devicesByVendor: results[6].recordset,
      activeAlerts: results[7].recordset[0].alert_count,
      recentActivity: results[8].recordset[0]
    };
    
    // Process device status
    results[1].recordset.forEach(item => {
      summary.deviceStatus[item.status] = item.count;
    });
    
    // Process channel status
    results[3].recordset.forEach(item => {
      summary.channelStatus[item.status] = item.count;
    });
    
    res.json({
      success: true,
      data: summary
    });
  } catch (err) {
    console.error('[DashboardController] getDashboardSummary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getOnlineDevicesMap = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    const result = await pool.request()
      .query(`
        SELECT 
          d.id,
          d.name,
          d.ip_address,
          d.vendor,
          d.device_type,
          d.status,
          d.last_seen,
          l.name as location_name,
          l.latitude,
          l.longitude
        FROM Devices d
        LEFT JOIN Locations l ON d.location_id = l.id
        WHERE d.status = 'online' AND d.is_active = 1
        ORDER BY d.last_seen DESC
      `);
    
    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('[DashboardController] getOnlineDevicesMap error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getRecentAlerts = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { page = 1, limit = 50, severity, isResolved } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ml.*, d.name as device_name, l.name as location_name
      FROM MonitoringLogs ml
      JOIN Devices d ON ml.device_id = d.id
      LEFT JOIN Locations l ON d.location_id = l.id
      WHERE ml.is_resolved = @isResolved
    `;
    
    if (severity) {
      query += ` AND ml.severity = @severity`;
    }
    
    query += ` ORDER BY ml.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
    
    const result = await pool.request()
      .input('isResolved', sql.Bit, isResolved === 'true')
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, parseInt(limit))
      .query(query);
    
    const countResult = await pool.request()
      .input('isResolved', sql.Bit, isResolved === 'true')
      .query(`
        SELECT COUNT(*) as total FROM MonitoringLogs 
        WHERE is_resolved = @isResolved
        ${severity ? 'AND severity = @severity' : ''}
      `);
    
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
        total: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / limit)
      }
    });
  } catch (err) {
    console.error('[DashboardController] getRecentAlerts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getStorageStatus = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { warningThreshold = 80, criticalThreshold = 95 } = req.query;
    
    const result = await pool.request()
      .query(`
        SELECT 
          ds.*,
          d.name as device_name,
          d.ip_address,
          l.name as location_name,
          CASE 
            WHEN ds.usage_percentage >= ${criticalThreshold} THEN 'critical'
            WHEN ds.usage_percentage >= ${warningThreshold} THEN 'warning'
            ELSE 'normal'
          END as usage_status
        FROM DeviceStorage ds
        JOIN Devices d ON ds.device_id = d.id
        LEFT JOIN Locations l ON d.location_id = l.id
        WHERE ds.is_active = 1
        ORDER BY ds.usage_percentage DESC
      `);
    
    const critical = result.recordset.filter(s => s.usage_status === 'critical');
    const warning = result.recordset.filter(s => s.usage_status === 'warning');
    const normal = result.recordset.filter(s => s.usage_status === 'normal');
    
    res.json({
      success: true,
      data: result.recordset,
      summary: {
        critical: critical.length,
        warning: warning.length,
        normal: normal.length
      }
    });
  } catch (err) {
    console.error('[DashboardController] getStorageStatus error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getChannelStatus = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { status, deviceType, vendor } = req.query;
    
    let query = `
      SELECT 
        dc.*,
        d.name as device_name,
        d.vendor,
        d.device_type,
        l.name as location_name
      FROM DeviceChannels dc
      JOIN Devices d ON dc.device_id = d.id
      LEFT JOIN Locations l ON d.location_id = l.id
      WHERE dc.is_enabled = 1
    `;
    
    if (status) {
      query += ` AND dc.status = @status`;
    }
    if (deviceType) {
      query += ` AND d.device_type = @deviceType`;
    }
    if (vendor) {
      query += ` AND d.vendor = @vendor`;
    }
    
    query += ` ORDER BY dc.status, dc.channel_number`;
    
    const result = await pool.request()
      .query(query);
    
    res.json({
      success: true,
      data: result.recordset,
      total: result.recordset.length
    });
  } catch (err) {
    console.error('[DashboardController] getChannelStatus error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};