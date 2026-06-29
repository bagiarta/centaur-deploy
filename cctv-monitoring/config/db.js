import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

export const dbConfig = {
  user: process.env.CCTV_DB_USER,
  password: process.env.CCTV_DB_PASS,
  server: process.env.CCTV_DB_SERVER,
  database: process.env.CCTV_DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 30,
    min: 5,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 15000,
  requestTimeout: 60000
};

export let poolPromise;

export async function initDb() {
  if (poolPromise) {
    const pool = await poolPromise;
    return pool;
  }
  try {
    poolPromise = sql.connect(dbConfig);
    const pool = await poolPromise;

    pool.on('error', err => {
      console.error('⚠️ [CCTV SQL POOL ERROR]:', err.message);
    });

    console.log('✅ Connected to CCTV SQL Server:', dbConfig.server);

    // Create main tables for CCTV monitoring system
    const tables = [
      // Users & Roles
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
       CREATE TABLE Users (
           id NVARCHAR(50) PRIMARY KEY,
           username NVARCHAR(100) UNIQUE NOT NULL,
           password_hash NVARCHAR(MAX) NOT NULL,
           full_name NVARCHAR(200),
           email NVARCHAR(200),
           phone NVARCHAR(50),
           is_active BIT DEFAULT 1,
           created_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Roles' AND xtype='U')
       CREATE TABLE Roles (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(100) UNIQUE NOT NULL,
           display_name NVARCHAR(200) NOT NULL,
           description NVARCHAR(500),
           permissions NVARCHAR(MAX),
           created_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UserRoles' AND xtype='U')
       CREATE TABLE UserRoles (
           id INT IDENTITY(1,1) PRIMARY KEY,
           user_id NVARCHAR(50) NOT NULL,
           role_id NVARCHAR(50) NOT NULL,
           created_at DATETIME DEFAULT GETDATE(),
           FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
           FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE
       )`,
      
      // Locations
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Locations' AND xtype='U')
       CREATE TABLE Locations (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(200) NOT NULL,
           address NVARCHAR(500),
           latitude DECIMAL(10, 8),
           longitude DECIMAL(11, 8),
           description NVARCHAR(MAX),
           is_active BIT DEFAULT 1,
           created_at DATETIME DEFAULT GETDATE()
       )`,
      
      // Devices
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Devices' AND xtype='U')
       CREATE TABLE Devices (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(200) NOT NULL,
           device_type NVARCHAR(50) NOT NULL, -- NVR, DVR, XVR, Hybrid_DVR
           vendor NVARCHAR(50) NOT NULL, -- hikvision, dahua
           model NVARCHAR(200),
           firmware_version NVARCHAR(100),
           serial_number NVARCHAR(100),
           ip_address NVARCHAR(50) NOT NULL,
           port INT DEFAULT 80,
           username NVARCHAR(100) NOT NULL,
           password_hash NVARCHAR(500) NOT NULL,
           is_https BIT DEFAULT 0,
           location_id NVARCHAR(50),
           status NVARCHAR(50) DEFAULT 'offline', -- online, offline, error
           last_seen DATETIME,
           last_poll DATETIME,
           device_info NVARCHAR(MAX),
           connection_settings NVARCHAR(MAX),
           is_active BIT DEFAULT 1,
           poll_interval INT DEFAULT 300, -- seconds
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE(),
           FOREIGN KEY (location_id) REFERENCES Locations(id) ON DELETE SET NULL
       )`,
      
      // Device Channels
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeviceChannels' AND xtype='U')
       CREATE TABLE DeviceChannels (
           id NVARCHAR(50) PRIMARY KEY,
           device_id NVARCHAR(50) NOT NULL,
           channel_number INT NOT NULL,
           channel_name NVARCHAR(200),
           channel_type NVARCHAR(20) DEFAULT 'ip', -- analog, ip
           status NVARCHAR(50) DEFAULT 'offline', -- online, offline, video_loss, no_signal
           is_recording BIT DEFAULT 0,
           resolution NVARCHAR(50),
           fps DECIMAL(5, 2),
           bitrate INT,
           channel_settings NVARCHAR(MAX),
           is_enabled BIT DEFAULT 1,
           last_seen DATETIME,
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE(),
           FOREIGN KEY (device_id) REFERENCES Devices(id) ON DELETE CASCADE,
           CONSTRAINT UQ_Device_Channel UNIQUE (device_id, channel_number)
       )`,
      
      // Device Storage
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeviceStorage' AND xtype='U')
       CREATE TABLE DeviceStorage (
           id NVARCHAR(50) PRIMARY KEY,
           device_id NVARCHAR(50) NOT NULL,
           disk_number INT NOT NULL,
           disk_name NVARCHAR(200),
           status NVARCHAR(50) DEFAULT 'normal', -- normal, error, full, unformatted, not_exist
           total_space BIGINT,
           used_space BIGINT,
           free_space BIGINT,
           usage_percentage DECIMAL(5, 2),
           disk_type NVARCHAR(50),
           disk_info NVARCHAR(MAX),
           last_checked DATETIME,
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE(),
           FOREIGN KEY (device_id) REFERENCES Devices(id) ON DELETE CASCADE,
           CONSTRAINT UQ_Device_Disk UNIQUE (device_id, disk_number)
       )`,
      
      // Monitoring Logs
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MonitoringLogs' AND xtype='U')
       CREATE TABLE MonitoringLogs (
           id NVARCHAR(50) PRIMARY KEY,
           device_id NVARCHAR(50) NOT NULL,
           log_type NVARCHAR(50) NOT NULL, -- device_status, channel_status, storage_status
           event_type NVARCHAR(50) NOT NULL, -- status_change, error, warning, info
           object_type NVARCHAR(50),
           object_id NVARCHAR(50),
           old_value NVARCHAR(200),
           new_value NVARCHAR(200),
           message NVARCHAR(MAX),
           metadata NVARCHAR(MAX),
           severity NVARCHAR(20) DEFAULT 'info', -- critical, high, medium, low, info
           is_resolved BIT DEFAULT 0,
           resolved_at DATETIME,
           created_at DATETIME DEFAULT GETDATE(),
           FOREIGN KEY (device_id) REFERENCES Devices(id) ON DELETE CASCADE
       )`,
      
      // Notification Channels
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationChannels' AND xtype='U')
       CREATE TABLE NotificationChannels (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(100) NOT NULL,
           type NVARCHAR(50) NOT NULL, -- telegram, whatsapp, email, webhook
           settings NVARCHAR(MAX),
           is_active BIT DEFAULT 1,
           created_at DATETIME DEFAULT GETDATE()
       )`,
      
      // Notification Rules
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationRules' AND xtype='U')
       CREATE TABLE NotificationRules (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(200) NOT NULL,
           conditions NVARCHAR(MAX), -- JSON conditions
           channels NVARCHAR(MAX), -- JSON array of channel IDs
           template NVARCHAR(MAX),
           cooldown_minutes INT DEFAULT 15,
           is_active BIT DEFAULT 1,
           created_at DATETIME DEFAULT GETDATE()
       )`,
      
      // Notification Logs
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationLogs' AND xtype='U')
       CREATE TABLE NotificationLogs (
           id NVARCHAR(50) PRIMARY KEY,
           monitoring_log_id NVARCHAR(50) NOT NULL,
           notification_rule_id NVARCHAR(50) NOT NULL,
           channel_type NVARCHAR(50),
           recipient NVARCHAR(500),
           message NVARCHAR(MAX),
           status NVARCHAR(50) DEFAULT 'pending', -- pending, sent, failed, delivered
           error_message NVARCHAR(MAX),
           sent_at DATETIME,
           response_data NVARCHAR(MAX),
           created_at DATETIME DEFAULT GETDATE(),
           FOREIGN KEY (monitoring_log_id) REFERENCES MonitoringLogs(id) ON DELETE CASCADE,
           FOREIGN KEY (notification_rule_id) REFERENCES NotificationRules(id) ON DELETE CASCADE
       )`,
      
      // System Settings
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemSettings' AND xtype='U')
       CREATE TABLE SystemSettings (
           id NVARCHAR(50) PRIMARY KEY,
           [key] NVARCHAR(100) UNIQUE NOT NULL,
           [value] NVARCHAR(MAX),
           type NVARCHAR(50) DEFAULT 'string', -- string, integer, boolean, json
           category NVARCHAR(50) DEFAULT 'general',
           description NVARCHAR(MAX),
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE()
       )`
    ];

    // Create tables
    for (const query of tables) {
      await pool.request().query(query);
    }

    // Add indexes for performance
    const indexes = [
      // Devices indexes
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Devices_IP_Port") CREATE INDEX IX_Devices_IP_Port ON Devices(ip_address, port)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Devices_Status") CREATE INDEX IX_Devices_Status ON Devices(status, is_active)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Devices_Location") CREATE INDEX IX_Devices_Location ON Devices(location_id, is_active)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Devices_Vendor_Type") CREATE INDEX IX_Devices_Vendor_Type ON Devices(vendor, device_type)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Devices_LastPoll") CREATE INDEX IX_Devices_LastPoll ON Devices(last_poll)',
      
      // Channels indexes
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Channels_Device_Status") CREATE INDEX IX_Channels_Device_Status ON DeviceChannels(device_id, status)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Channels_Status") CREATE INDEX IX_Channels_Status ON DeviceChannels(status, is_enabled)',
      
      // Storage indexes
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Storage_Device") CREATE INDEX IX_Storage_Device ON DeviceStorage(device_id, status)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Storage_Status") CREATE INDEX IX_Storage_Status ON DeviceStorage(status)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Storage_Usage") CREATE INDEX IX_Storage_Usage ON DeviceStorage(usage_percentage)',
      
      // Logs indexes
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Logs_Device_Time") CREATE INDEX IX_Logs_Device_Time ON MonitoringLogs(device_id, created_at)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Logs_Type_Event") CREATE INDEX IX_Logs_Type_Event ON MonitoringLogs(log_type, event_type)',
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Logs_Severity") CREATE INDEX IX_Logs_Severity ON MonitoringLogs(severity, is_resolved)',
      
      // Notifications indexes
      'IF NOT EXISTS (SELECT * FROM sysindexes WHERE name = "IX_Notif_Channel") CREATE INDEX IX_Notif_Channel ON NotificationChannels(type, is_active)'
    ];

    for (const indexQuery of indexes) {
      try {
        await pool.request().query(indexQuery);
      } catch (err) {
        console.warn(`Index creation skipped (may already exist): ${err.message}`);
      }
    }

    // Seed initial settings
    await seedData(pool);

    console.log('✅ CCTV Database fully initialized');
  } catch (err) {
    console.error('❌ CCTV Database Connection Failed!', err.message);
  }
}

async function seedData(pool) {
  // Check if locations exist
  const locationsRes = await pool.request().query('SELECT COUNT(*) as count FROM Locations');
  if (locationsRes.recordset[0].count === 0) {
    console.log('Seeding Locations...');
    await pool.request().query(`
      INSERT INTO Locations (id, name, address, latitude, longitude, description, is_active)
      VALUES 
      ('loc-001', 'Head Office', 'Jl. Merdeka No. 1, Jakarta', -6.200000, 106.816666, 'Main Office Building', 1),
      ('loc-002', 'Branch A', 'Jl. Sudirman No. 50, Jakarta', -6.189756, 106.824650, 'Branch Office A', 1),
      ('loc-003', 'Warehouse', 'Jl. Industri No. 12, Bekasi', -6.234567, 106.987654, 'Main Warehouse', 1)
    `);
  }

  // Check if roles exist
  const rolesRes = await pool.request().query('SELECT COUNT(*) as count FROM Roles');
  if (rolesRes.recordset[0].count === 0) {
    console.log('Seeding Roles...');
    await pool.request().query(`
      INSERT INTO Roles (id, name, display_name, description, permissions)
      VALUES 
      ('role-admin', 'admin', 'Administrator', 'Full system access', '["devices:read", "devices:write", "devices:delete", "monitoring:read", "notifications:manage", "settings:manage"]'),
      ('role-operator', 'operator', 'Operator', 'Device monitoring and basic operations', '["devices:read", "monitoring:read", "notifications:read"]'),
      ('role-viewer', 'viewer', 'Viewer', 'Read-only access to monitoring', '["devices:read", "monitoring:read"]')
    `);
  }

  // Check if system settings exist
  const settingsRes = await pool.request().query('SELECT COUNT(*) as count FROM SystemSettings');
  if (settingsRes.recordset[0].count === 0) {
    console.log('Seeding System Settings...');
    const now = new Date().toISOString();
    await pool.request().query(`
      INSERT INTO SystemSettings (id, [key], [value], type, category, description)
      VALUES 
      (NEWID(), 'default_poll_interval', '300', 'integer', 'monitoring', 'Default polling interval in seconds'),
      (NEWID(), 'max_concurrent_polls', '10', 'integer', 'monitoring', 'Maximum concurrent device polls'),
      (NEWID(), 'storage_warning_threshold', '80', 'integer', 'alerts', 'Storage usage warning threshold percentage'),
      (NEWID(), 'storage_critical_threshold', '95', 'integer', 'alerts', 'Storage usage critical threshold percentage'),
      (NEWID(), 'notification_cooldown_minutes', '15', 'integer', 'notifications', 'Cooldown period between notifications')
    `);
  }
}