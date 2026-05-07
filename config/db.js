import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

export const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false, // For local dev, usually false
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

export let poolPromise;

export async function initDb() {
  try {
    poolPromise = sql.connect(dbConfig);
    const pool = await poolPromise;

    // Connectivity Event listener
    pool.on('error', err => {
      console.error('⚠️ [SQL POOL ERROR]:', err.message);
      if (err.message.includes('broken') || err.message.includes('Connection loss')) {
        console.warn('-- Possible Network Instability detected with ' + dbConfig.server + ' --');
      }
    });

    console.log('✅ Connected to SQL Server:', dbConfig.server);

    const tables = [
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Devices' AND xtype='U')
       CREATE TABLE Devices (
           id NVARCHAR(50) PRIMARY KEY,
           hostname NVARCHAR(100) NOT NULL,
           ip NVARCHAR(50) NOT NULL,
           os_version NVARCHAR(100),
           cpu NVARCHAR(100),
           ram NVARCHAR(50),
           disk NVARCHAR(50),
           agent_version NVARCHAR(50),
           status NVARCHAR(50),
           last_seen NVARCHAR(50),
           group_ids NVARCHAR(500),
           location NVARCHAR(200),
           latitude FLOAT,
           longitude FLOAT
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeviceGroups' AND xtype='U')
       CREATE TABLE DeviceGroups (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(100) NOT NULL,
           device_count INT DEFAULT 0,
           color NVARCHAR(50)
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Packages' AND xtype='U')
       CREATE TABLE Packages (
           id NVARCHAR(50) PRIMARY KEY,
           name NVARCHAR(100) NOT NULL,
           version NVARCHAR(50),
           checksum NVARCHAR(255),
           file_path NVARCHAR(500),
           size NVARCHAR(50),
           type NVARCHAR(20),
           uploaded_at NVARCHAR(50),
           uploaded_by NVARCHAR(100)
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Deployments' AND xtype='U')
       CREATE TABLE Deployments (
           id NVARCHAR(50) PRIMARY KEY,
           package_id NVARCHAR(50),
           package_name NVARCHAR(100),
           package_version NVARCHAR(50),
           target_path NVARCHAR(500),
           schedule_time NVARCHAR(100),
           created_by NVARCHAR(100),
           created_at NVARCHAR(50),
           status NVARCHAR(50),
           total_targets INT DEFAULT 0,
           success_count INT DEFAULT 0,
           failed_count INT DEFAULT 0,
           pending_count INT DEFAULT 0
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeploymentTargets' AND xtype='U')
       CREATE TABLE DeploymentTargets (
           deployment_id NVARCHAR(50),
           device_id NVARCHAR(50),
           hostname NVARCHAR(100),
           ip NVARCHAR(50),
           status NVARCHAR(50),
           log NVARCHAR(MAX),
           updated_at NVARCHAR(50),
           progress INT DEFAULT 0,
           PRIMARY KEY (deployment_id, device_id)
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AgentJobs' AND xtype='U')
       CREATE TABLE AgentJobs (
           id NVARCHAR(50) PRIMARY KEY,
           created_at NVARCHAR(50),
           created_by NVARCHAR(100),
           ip_range NVARCHAR(MAX),
           total INT DEFAULT 0,
           success_count INT DEFAULT 0,
           failed_count INT DEFAULT 0,
           pending_count INT DEFAULT 0
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AgentInstallTargets' AND xtype='U')
       CREATE TABLE AgentInstallTargets (
           job_id NVARCHAR(50),
           device_ip NVARCHAR(50),
           hostname NVARCHAR(100),
           status NVARCHAR(50),
           log NVARCHAR(MAX),
           updated_at NVARCHAR(50),
           PRIMARY KEY (job_id, device_ip)
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ActivityLog' AND xtype='U')
       CREATE TABLE ActivityLog (
           id INT IDENTITY(1,1) PRIMARY KEY,
           time NVARCHAR(50),
           [user] NVARCHAR(100),
           action NVARCHAR(MAX),
           created_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeviceDbConnections' AND xtype='U')
       CREATE TABLE DeviceDbConnections (
           device_id NVARCHAR(50) PRIMARY KEY,
           db_name NVARCHAR(100),
           db_user NVARCHAR(100),
           db_password NVARCHAR(100),
           updated_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Roles' AND xtype='U')
        CREATE TABLE Roles (
            id NVARCHAR(50) PRIMARY KEY,
            name NVARCHAR(100) NOT NULL,
            menu_permissions NVARCHAR(MAX),
            is_admin BIT DEFAULT 0
        )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
        CREATE TABLE Users (
            id NVARCHAR(50) PRIMARY KEY,
            username NVARCHAR(100) UNIQUE NOT NULL,
            password_hash NVARCHAR(MAX) NOT NULL,
            full_name NVARCHAR(200),
            role_id NVARCHAR(50),
            created_at DATETIME DEFAULT GETDATE()
        )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NotificationSettings' AND xtype='U')
      CREATE TABLE NotificationSettings (
        id NVARCHAR(50) PRIMARY KEY,
        webhook_url NVARCHAR(500),
        whatsapp_token NVARCHAR(500),
        whatsapp_target NVARCHAR(200),
        whatsapp_group NVARCHAR(200),
        alert_offline BIT DEFAULT 1,
        alert_deployment_success BIT DEFAULT 1,
        alert_deployment_failed BIT DEFAULT 1,
        offline_timeout_mins INT DEFAULT 10
      )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ThemeSettings' AND xtype='U')
      CREATE TABLE ThemeSettings (
        id NVARCHAR(50) PRIMARY KEY,
        sidebarBg NVARCHAR(20),
        sidebarText NVARCHAR(20),
        sidebarAccent NVARCHAR(20),
        mainBg NVARCHAR(20),
        contentText NVARCHAR(20),
        cardBg NVARCHAR(20),
        primaryBrand NVARCHAR(20),
        appLogo NVARCHAR(MAX),
        logoSize INT,
        appName NVARCHAR(200),
        updated_at DATETIME DEFAULT GETDATE()
      )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AssistantKeywords' AND xtype='U')
      CREATE TABLE AssistantKeywords (
        id NVARCHAR(50) PRIMARY KEY,
        keyword NVARCHAR(200) NOT NULL,
        description NVARCHAR(500),
        action_type NVARCHAR(50) NOT NULL,
        target_host NVARCHAR(100),
        script_text NVARCHAR(MAX) NOT NULL,
        parameter_keys NVARCHAR(MAX),
        requires_admin BIT DEFAULT 0,
        requires_confirmation BIT DEFAULT 0,
        is_enabled BIT DEFAULT 1,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SqlTemplates' AND xtype='U')
      CREATE TABLE SqlTemplates (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        description NVARCHAR(500),
        script NVARCHAR(MAX),
        created_by NVARCHAR(100),
        created_at DATETIME DEFAULT GETDATE()
      )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RemoteCommandScripts' AND xtype='U')
      CREATE TABLE RemoteCommandScripts (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        description NVARCHAR(500),
        script NVARCHAR(MAX),
        created_by NVARCHAR(100),
        created_at DATETIME DEFAULT GETDATE()
      )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RemoteSqlSchedules' AND xtype='U')
      CREATE TABLE RemoteSqlSchedules (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        script NVARCHAR(MAX),
        target_device_ids NVARCHAR(MAX),
        next_run_at DATETIME,
        status NVARCHAR(50) DEFAULT 'pending',
        created_at DATETIME DEFAULT GETDATE()
      )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='RemoteCommandSchedules' AND xtype='U')
      CREATE TABLE RemoteCommandSchedules (
        id NVARCHAR(50) PRIMARY KEY,
        name NVARCHAR(200) NOT NULL,
        script NVARCHAR(MAX),
        target_device_ids NVARCHAR(MAX),
        next_run_at DATETIME,
        status NVARCHAR(50) DEFAULT 'pending',
        created_at DATETIME DEFAULT GETDATE()
      )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Workflows' AND xtype='U')
       CREATE TABLE Workflows (
         id NVARCHAR(50) PRIMARY KEY,
         title NVARCHAR(200) NOT NULL,
         content NVARCHAR(MAX) NOT NULL,
         category NVARCHAR(100),
         file_name NVARCHAR(255),
         file_path NVARCHAR(MAX),
         created_by NVARCHAR(100),
         created_at DATETIME DEFAULT GETDATE(),
         updated_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PendingCommands' AND xtype='U')
       CREATE TABLE PendingCommands (
         id NVARCHAR(50) PRIMARY KEY,
         exec_id NVARCHAR(50) NOT NULL,
         device_id NVARCHAR(50) NOT NULL,
         hostname NVARCHAR(100),
         ip NVARCHAR(50),
         command NVARCHAR(MAX) NOT NULL,
         status NVARCHAR(20) DEFAULT 'pending',
         result_log NVARCHAR(MAX),
         created_at DATETIME DEFAULT GETDATE(),
         executed_at DATETIME NULL
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeviceSoftware' AND xtype='U')
       CREATE TABLE DeviceSoftware (
         id INT IDENTITY(1,1) PRIMARY KEY,
         device_id NVARCHAR(50) NOT NULL,
         name NVARCHAR(500) NOT NULL,
         version NVARCHAR(100),
         publisher NVARCHAR(200),
         updated_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TroubleTickets' AND xtype='U')
       CREATE TABLE TroubleTickets (
         id NVARCHAR(50) PRIMARY KEY,
         title NVARCHAR(200) NOT NULL,
         description NVARCHAR(MAX) NOT NULL,
         category NVARCHAR(100),
         priority NVARCHAR(50),
         status NVARCHAR(50),
         outlet_name NVARCHAR(150),
         hostname NVARCHAR(100),
         created_by NVARCHAR(100),
         created_at DATETIME DEFAULT GETDATE(),
         resolved_by NVARCHAR(100),
         resolved_at DATETIME,
         resolution_note NVARCHAR(MAX),
         closed_by NVARCHAR(100),
         closed_at DATETIME,
         updated_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TicketLogs' AND xtype='U')
       CREATE TABLE TicketLogs (
         id INT IDENTITY(1,1) PRIMARY KEY,
         ticket_id NVARCHAR(50) NOT NULL,
         action NVARCHAR(MAX) NOT NULL,
         performed_by NVARCHAR(100) NOT NULL,
         created_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TicketGroups' AND xtype='U')
       CREATE TABLE TicketGroups (
         id INT IDENTITY(1,1) PRIMARY KEY,
         ticket_id NVARCHAR(50) NOT NULL,
         group_id NVARCHAR(50) NOT NULL,
         created_at DATETIME DEFAULT GETDATE()
       )`,
      `IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TicketTargets' AND xtype='U')
       CREATE TABLE TicketTargets (
         id INT IDENTITY(1,1) PRIMARY KEY,
         ticket_id NVARCHAR(50) NOT NULL,
         hostname NVARCHAR(100) NOT NULL,
         status NVARCHAR(50) DEFAULT 'Pending',
         remark NVARCHAR(MAX),
         updated_at DATETIME DEFAULT GETDATE()
       )`
    ];

    for (let query of tables) {
      await pool.request().query(query);
    }

    // Ensure SystemConfigs table exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SystemConfigs' AND xtype='U')
      CREATE TABLE SystemConfigs (
        [key] NVARCHAR(100) PRIMARY KEY,
        [value] NVARCHAR(MAX),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);


    // Add retry_count and last_error to DeploymentTargets if they don't exist
    const checkColumns = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'DeploymentTargets' AND COLUMN_NAME IN ('retry_count', 'last_error')
    `);

    if (!checkColumns.recordset.find(c => c.COLUMN_NAME === 'retry_count')) {
      await pool.request().query('ALTER TABLE DeploymentTargets ADD retry_count INT DEFAULT 0');
    }
    if (!checkColumns.recordset.find(c => c.COLUMN_NAME === 'last_error')) {
      await pool.request().query('ALTER TABLE DeploymentTargets ADD last_error NVARCHAR(MAX)');
    }

    // DeviceGroups expansion
    const checkGroupCols = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'DeviceGroups' AND COLUMN_NAME = 'description'
    `);
    if (checkGroupCols.recordset.length === 0) {
      await pool.request().query('ALTER TABLE DeviceGroups ADD description NVARCHAR(500)');
    }

    // Workflows table extra columns expansion
    const checkWfCols = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Workflows' AND COLUMN_NAME IN ('file_name', 'file_path')
    `);
    if (!checkWfCols.recordset.find(c => c.COLUMN_NAME === 'file_name')) {
      await pool.request().query('ALTER TABLE Workflows ADD file_name NVARCHAR(255)');
    }
    if (!checkWfCols.recordset.find(c => c.COLUMN_NAME === 'file_path')) {
      await pool.request().query('ALTER TABLE Workflows ADD file_path NVARCHAR(MAX)');
    }

    // Devices table expansion for Network Monitors
    const checkDevCols = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Devices' AND COLUMN_NAME IN ('device_type', 'network_ports', 'location', 'latitude', 'longitude')
    `);
    if (!checkDevCols.recordset.find(c => c.COLUMN_NAME === 'device_type')) {
      await pool.request().query("ALTER TABLE Devices ADD device_type NVARCHAR(50) DEFAULT 'PC'");
    }
    if (!checkDevCols.recordset.find(c => c.COLUMN_NAME === 'network_ports')) {
      await pool.request().query("ALTER TABLE Devices ADD network_ports NVARCHAR(MAX)");
    }

    // Devices table expansion for Location and Coordinates
    if (!checkDevCols.recordset.find(c => c.COLUMN_NAME === 'location')) {
      await pool.request().query("ALTER TABLE Devices ADD location NVARCHAR(200)");
    }
    if (!checkDevCols.recordset.find(c => c.COLUMN_NAME === 'latitude')) {
      await pool.request().query("ALTER TABLE Devices ADD latitude FLOAT");
    }
    if (!checkDevCols.recordset.find(c => c.COLUMN_NAME === 'longitude')) {
      await pool.request().query("ALTER TABLE Devices ADD longitude FLOAT");
    }

    await pool.request().query('ALTER TABLE AgentJobs ALTER COLUMN ip_range NVARCHAR(MAX)').catch(() => { });

    // Add sql_safe_mode to NotificationSettings if it doesn't exist
    const checkSqlModeCol = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'NotificationSettings' AND COLUMN_NAME = 'sql_safe_mode'
    `);
    if (checkSqlModeCol.recordset.length === 0) {
      await pool.request().query('ALTER TABLE NotificationSettings ADD sql_safe_mode BIT DEFAULT 1');
    }

    // Seed initial mock data if tables are empty
    await seedData(pool);

    // TicketTargets expansion
    const checkTargetCols = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'TicketTargets' AND COLUMN_NAME = 'solved_by'
    `);
    if (checkTargetCols.recordset.length === 0) {
      await pool.request().query('ALTER TABLE TicketTargets ADD solved_by NVARCHAR(100)');
    }

    console.log('✅ Database fully initialized (DBWH_8529)');
  } catch (err) {
    console.error('❌ Database Connection Failed! Bad Config: ', err);
  }
}

async function seedData(pool) {
  // Check if Groups exists
  const groupsRes = await pool.request().query('SELECT COUNT(*) as count FROM DeviceGroups');
  if (groupsRes.recordset[0].count === 0) {
    console.log('Seeding DeviceGroups...');
    await pool.request().query(`
      INSERT INTO DeviceGroups (id, name, device_count, color) VALUES 
      ('g1', 'Workstations', 5, 'primary'),
      ('g2', 'Servers', 3, 'info'),
      ('g3', 'Dev Laptops', 2, 'success'),
      ('g4', 'Kiosk Devices', 2, 'warning')
    `);
  }

  // Devices
  const devRes = await pool.request().query('SELECT COUNT(*) as count FROM Devices');
  if (devRes.recordset[0].count === 0) {
    console.log('Seeding Devices with starter inventory...');
    await pool.request().query(`
     --NSERT INTO Devices (id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, group_ids, last_seen)
      --LUES
      --dev-1', 'WORKSTATION-01', '192.168.1.11', 'Windows 10', 'Intel i5', '16GB', '512GB', '2.6.0', 'online', 'g1', GETDATE()),
      --dev-2', 'WORKSTATION-02', '192.168.1.12', 'Windows 10', 'Intel i7', '16GB', '1TB', '2.6.0', 'offline', 'g1', GETDATE()),
      --dev-3', 'SERVER-01', '192.168.1.20', 'Windows Server 2019', 'Xeon', '32GB', '2TB', '2.5.8', 'online', 'g2', GETDATE())
    `);
  }

  // Packages
  const pkgRes = await pool.request().query('SELECT COUNT(*) as count FROM Packages');
  if (pkgRes.recordset[0].count === 0) {
    console.log('Seeding Packages with starter entries...');
    await pool.request().query(`
      INSERT INTO Packages (id, name, version, checksum, file_path, size, type, uploaded_at, uploaded_by)
      VALUES
      ('pkg-1', 'Centaur Agent', '2.6.0', 'abc123', 'CentaurAgent-2.6.0.msi', '40MB', 'msi', GETDATE(), 'admin'),
      ('pkg-2', 'Database Patch', '1.2.3', 'def456', 'DBPatch-1.2.3.zip', '120MB', 'zip', GETDATE(), 'admin')
    `);
  }

  // Deployments
  const depRes = await pool.request().query('SELECT COUNT(*) as count FROM Deployments');
  if (depRes.recordset[0].count === 0) {
    console.log('Seeding Deployments with starter tasks...');
    await pool.request().query(`
      INSERT INTO Deployments (id, package_id, package_name, package_version, target_path, schedule_time, created_by, created_at, status, total_targets, success_count, failed_count, pending_count)
      VALUES
      ('dep-1', 'pkg-1', 'Centaur Agent', '2.6.0', 'C:\\Deployments', '2025-01-01 09:00', 'admin', GETDATE(), 'running', 3, 2, 0, 1)
    `);
    await pool.request().query(`
      INSERT INTO DeploymentTargets (deployment_id, device_id, hostname, ip, status, log, updated_at, progress)
      VALUES
      ('dep-1', 'dev-1', 'WORKSTATION-01', '192.168.1.11', 'success', 'Installed successfully', GETDATE(), 100),
      ('dep-1', 'dev-2', 'WORKSTATION-02', '192.168.1.12', 'pending', 'Waiting for agent', GETDATE(), 0),
      ('dep-1', 'dev-3', 'SERVER-01', '192.168.1.20', 'success', 'Installed successfully', GETDATE(), 100)
    `);
  }


  // DeploymentTargets
  const dptRes = await pool.request().query('SELECT COUNT(*) as count FROM DeploymentTargets');
  if (dptRes.recordset[0].count === 0) {
    console.log('Seeding DeploymentTargets (No default items)...');
  }

  // Workflows (Knowledge Base)
  const wfRes = await pool.request().query('SELECT COUNT(*) as count FROM Workflows');
  if (wfRes.recordset[0].count === 0) {
    console.log('Seeding Workflows with starter knowledge base entries...');
    await pool.request().query(`
      INSERT INTO Workflows (id, title, content, category, file_name, file_path, created_by, created_at, updated_at)
      VALUES
      ('wf-1', 'Cara Tambah Device', '1. Masuk ke halaman Devices\n2. Klik Add Device\n3. Isi informasi lalu Save', 'Setup', NULL, NULL, 'admin', GETDATE(), GETDATE()),
      ('wf-2', 'Buat Deployment', '1. Buka halaman Deployments\n2. Pilih paket\n3. Pilih target\n4. Klik Submit', 'Deploy', NULL, NULL, 'admin', GETDATE(), GETDATE())
    `);
  }

  // AgentJobs
  const ajRes = await pool.request().query('SELECT COUNT(*) as count FROM AgentJobs');
  if (ajRes.recordset[0].count === 0) {
    console.log('Seeding AgentJobs...');
    await pool.request().query(`
      INSERT INTO AgentJobs (id, created_at, created_by, ip_range, total, success_count, failed_count, pending_count) VALUES 
      ('aj1', '2025-03-09 08:30', 'admin', '192.168.1.1–254', 24, 20, 2, 2)
    `);
  }

  // AgentInstallTargets
  const aitRes = await pool.request().query('SELECT COUNT(*) as count FROM AgentInstallTargets');
  if (aitRes.recordset[0].count === 0) {
    console.log('Seeding AgentInstallTargets...');
    await pool.request().query(`
      INSERT INTO AgentInstallTargets (job_id, device_ip, hostname, status, log, updated_at) VALUES 
      ('aj1', '192.168.1.11', 'WORKSTATION-01', 'success', 'Connected via WMI. MSI pushed.', '08:34'),
      ('aj1', '192.168.1.14', 'WORKSTATION-04', 'failed', 'ERROR: WMI access denied.', '08:36')
    `);
  }

  // ActivityLog
  const actRes = await pool.request().query('SELECT COUNT(*) as count FROM ActivityLog');
  if (actRes.recordset[0].count === 0) {
    console.log('Seeding ActivityLog...');
    await pool.request().query(`
      INSERT INTO ActivityLog (time, [user], action) VALUES 
      ('08:42', 'admin', 'System initialization complete')
    `);
  }


  // Roles & Admin User
  const roleRes = await pool.request().query('SELECT COUNT(*) as count FROM Roles');
  if (roleRes.recordset[0].count === 0) {
    console.log('Seeding Roles & Admin User...');
    await pool.request().query(`
      INSERT INTO Roles (id, name, menu_permissions, is_admin) VALUES 
      ('role-admin', 'Administrator', '*', 1),
      ('role-user', 'Standard User', '["overview", "devices"]', 0)
    `);

    await pool.request().query(`
      INSERT INTO Users (id, username, password_hash, full_name, role_id) VALUES 
      ('user-admin', 'admin', 'admin123', 'System Administrator', 'role-admin')
    `);
  }

  // SystemConfigs Default
  const configRes = await pool.request().query('SELECT COUNT(*) as count FROM SystemConfigs');
  if (configRes.recordset[0].count === 0) {
    console.log('Seeding SystemConfigs (Latest Agent Version)...');
    await pool.request().query(`
      INSERT INTO SystemConfigs ([key], [value]) VALUES 
      ('LATEST_AGENT_VERSION', '1.0.0'),
      ('AGENT_UPDATE_URL', 'http://localhost:3001/public/CentaurAgent_v2.0.0.msi')
    `);
  }
  // Purge any orphaned logs/targets before starting
  console.log('Purging orphaned data...');
  try {
    const pool = await poolPromise;
    await pool.request().query(`
      DELETE FROM ActivityLog 
      WHERE action LIKE 'Command %' AND user = 'system'
    `);

    // Note: AgentInstallTargets are NOT purged based on Devices 
    // because they represent new installations that aren't devices yet.

    await pool.request().query(`
      DELETE FROM DeploymentTargets 
      WHERE device_id NOT IN (SELECT id FROM Devices)
    `);
  } catch (err) {
    console.error("Purging error:", err.message);
  }
}
