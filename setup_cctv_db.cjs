// Setup CCTV Monitoring Tables in existing Centaur database
const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');

// Load .env from correct path
const envPath = path.resolve(__dirname, '.env');
console.log('📂 Loading .env from:', envPath);
dotenv.config({ path: envPath });

const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASS || '',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'DBWH_8529',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 15000,
  requestTimeout: 30000
};

console.log('📊 Database Config:', {
  server: dbConfig.server,
  database: dbConfig.database,
  user: dbConfig.user,
  hasPassword: !!dbConfig.password
});

async function setupCCTVTables() {
  try {
    console.log('🔧 Setting up CCTV Monitoring tables...');
    const pool = await sql.connect(dbConfig);

    const tables = [
      // CCTV Locations
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CCTVLocations' AND xtype='U')
       CREATE TABLE CCTVLocations (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(200) NOT NULL,
           address NVARCHAR(500),
           latitude DECIMAL(10, 8),
           longitude DECIMAL(11, 8),
           description NVARCHAR(MAX),
           is_active BIT DEFAULT 1,
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE()
       )`,
      
      // CCTV Devices
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CCTVDevices' AND xtype='U')
       CREATE TABLE CCTVDevices (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(200) NOT NULL,
           device_type NVARCHAR(50) NOT NULL,
           vendor NVARCHAR(50) NOT NULL,
           model NVARCHAR(200),
           firmware_version NVARCHAR(100),
           serial_number NVARCHAR(100),
           ip_address NVARCHAR(50) NOT NULL,
           port INT DEFAULT 80,
           username NVARCHAR(100) NOT NULL,
           password_hash NVARCHAR(500) NOT NULL,
           is_https BIT DEFAULT 0,
           location_id NVARCHAR(50),
           status NVARCHAR(50) DEFAULT 'offline',
           last_seen DATETIME,
           last_poll DATETIME,
           device_info NVARCHAR(MAX),
           connection_settings NVARCHAR(MAX),
           is_active BIT DEFAULT 1,
           poll_interval INT DEFAULT 300,
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE()
       )`,
      
      // CCTV Channels
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CCTVChannels' AND xtype='U')
       CREATE TABLE CCTVChannels (
           id NVARCHAR(50) PRIMARY KEY,
           device_id NVARCHAR(50) NOT NULL,
           channel_number INT NOT NULL,
           channel_name NVARCHAR(200),
           channel_type NVARCHAR(20) DEFAULT 'ip',
           status NVARCHAR(50) DEFAULT 'offline',
           is_recording BIT DEFAULT 0,
           resolution NVARCHAR(50),
           fps DECIMAL(5, 2),
           bitrate INT,
           channel_settings NVARCHAR(MAX),
           is_enabled BIT DEFAULT 1,
           last_seen DATETIME,
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE(),
           CONSTRAINT UQ_CCTV_Device_Channel UNIQUE (device_id, channel_number)
       )`,
      
      // CCTV Storage
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CCTVStorage' AND xtype='U')
       CREATE TABLE CCTVStorage (
           id NVARCHAR(50) PRIMARY KEY,
           device_id NVARCHAR(50) NOT NULL,
           disk_number INT NOT NULL,
           disk_name NVARCHAR(200),
           status NVARCHAR(50) DEFAULT 'normal',
           total_space BIGINT,
           used_space BIGINT,
           free_space BIGINT,
           usage_percentage DECIMAL(5, 2),
           disk_type NVARCHAR(50),
           disk_info NVARCHAR(MAX),
           last_checked DATETIME,
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE(),
           CONSTRAINT UQ_CCTV_Device_Disk UNIQUE (device_id, disk_number)
       )`,
      
      // CCTV Monitoring Logs
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CCTVMonitoringLogs' AND xtype='U')
       CREATE TABLE CCTVMonitoringLogs (
           id NVARCHAR(50) PRIMARY KEY,
           device_id NVARCHAR(50) NOT NULL,
           log_type NVARCHAR(50) NOT NULL,
           event_type NVARCHAR(50) NOT NULL,
           object_type NVARCHAR(50),
           object_id NVARCHAR(50),
           old_value NVARCHAR(200),
           new_value NVARCHAR(200),
           message NVARCHAR(MAX),
           metadata NVARCHAR(MAX),
           severity NVARCHAR(20) DEFAULT 'info',
           is_resolved BIT DEFAULT 0,
           resolved_at DATETIME,
           created_at DATETIME DEFAULT GETDATE()
       )`,
      
      // CCTV Notification Settings
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CCTVNotificationSettings' AND xtype='U')
       CREATE TABLE CCTVNotificationSettings (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(200) NOT NULL,
           type NVARCHAR(50) NOT NULL,
           settings NVARCHAR(MAX),
           is_active BIT DEFAULT 1,
           created_at DATETIME DEFAULT GETDATE(),
           updated_at DATETIME DEFAULT GETDATE()
       )`
    ];

    for (const query of tables) {
      await pool.request().query(query);
      console.log('✅ Table created/verified');
    }

    // Add indexes
    const indexes = [
      'IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = \'IX_CCTVDevices_Status\') CREATE INDEX IX_CCTVDevices_Status ON CCTVDevices(status, is_active)',
      'IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = \'IX_CCTVDevices_Location\') CREATE INDEX IX_CCTVDevices_Location ON CCTVDevices(location_id)',
      'IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = \'IX_CCTVChannels_Device\') CREATE INDEX IX_CCTVChannels_Device ON CCTVChannels(device_id, status)',
      'IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = \'IX_CCTVStorage_Device\') CREATE INDEX IX_CCTVStorage_Device ON CCTVStorage(device_id)',
      'IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = \'IX_CCTVLogs_Device\') CREATE INDEX IX_CCTVLogs_Device ON CCTVMonitoringLogs(device_id, created_at)',
      'IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = \'IX_CCTVLogs_Severity\') CREATE INDEX IX_CCTVLogs_Severity ON CCTVMonitoringLogs(severity, is_resolved)'
    ];

    for (const indexQuery of indexes) {
      try {
        await pool.request().query(indexQuery);
        console.log('✅ Index created/verified');
      } catch (err) {
        console.warn('⚠️ Index may already exist:', err.message);
      }
    }

    // Seed initial locations
    const locCount = await pool.request().query('SELECT COUNT(*) as count FROM CCTVLocations');
    if (locCount.recordset[0].count === 0) {
      console.log('📍 Seeding CCTV Locations...');
      await pool.request().query(`
        INSERT INTO CCTVLocations (id, name, address, latitude, longitude, description, is_active)
        VALUES 
        (NEWID(), 'Head Office', 'Jl. Merdeka No. 1, Jakarta', -6.200000, 106.816666, 'Kantor Pusat', 1),
        (NEWID(), 'Branch A', 'Jl. Sudirman No. 50, Jakarta', -6.189756, 106.824650, 'Cabang A', 1),
        (NEWID(), 'Warehouse', 'Jl. Industri No. 12, Bekasi', -6.234567, 106.987654, 'Gudang', 1)
      `);
    }

    console.log('✅ CCTV Monitoring tables setup complete!');
    await pool.close();
  } catch (err) {
    console.error('❌ Setup error:', err.message);
    process.exit(1);
  }
}

setupCCTVTables();