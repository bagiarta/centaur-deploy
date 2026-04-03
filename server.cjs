const express = require('express');
const fs = require('fs');
const cors = require('cors');
const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const { exec } = require('child_process');
const util = require('util');
const https = require('https');
const OpenAI = require('openai');
const mammoth = require('mammoth');
const PDFDocument = require('pdfkit');
const cron = require('node-cron');

// ── TIMEZONE HELPER FUNCTIONS ──────────────────────────────
function getCurrentTimestamp() {
  // Return timestamp in configured timezone
  return new Date().toLocaleString('id-ID', {
    timeZone: process.env.TZ || 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getCurrentTimeHHMM() {
  // Return HH:MM format in configured timezone
  return new Date().toLocaleString('id-ID', {
    timeZone: process.env.TZ || 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function getISOTimestamp() {
  // Return ISO string but adjusted to configured timezone
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000; // offset in milliseconds
  const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, -1);
  return localISOTime;
}

// Multer Config for Workflows
const workflowStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/workflows/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const workflowUpload = multer({ storage: workflowStorage });
const execPromise = (cmd, options = {}) => {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
};


dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const port = process.env.PORT || 3001;
const REPO_PATH = path.resolve('F:\\PepiUpdater\\Repo');

// Ensure Repo path exists
if (!fs.existsSync(REPO_PATH)) {
  fs.mkdirSync(REPO_PATH, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));


// Configure Multer for package uploads
const packageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, REPO_PATH);
  },
  filename: (req, file, cb) => {
    // Preserve original filename but ensure it's safe
    cb(null, file.originalname);
  }
});
const packageUpload = multer({ storage: packageStorage });

// SQL Server configuration
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false, // For local dev, usually false
    trustServerCertificate: true,
  },
};

// Application State
let poolPromise;

// Attempt to initialize database connection and create table
async function initDb() {
  try {
    poolPromise = sql.connect(dbConfig);
    const pool = await poolPromise;
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
           group_ids NVARCHAR(500)
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
        offline_timeout_mins INT DEFAULT 30
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

    await pool.request().query('ALTER TABLE AgentJobs ALTER COLUMN ip_range NVARCHAR(MAX)').catch(() => {});
    
    // Seed initial mock data if tables are empty
    await seedData(pool);
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

// ── POST /api/deployments/:id/targets ──────────────────────
app.post('/api/deployments/:id/targets', async (req, res) => {
  const { id } = req.params;
  const { targets } = req.body;

  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: "No targets provided" });
  }

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Insert New Targets
      for (const t of targets) {
        // Check if device already exists for this deployment to avoid duplicates
        const check = await transaction.request()
          .input('deployment_id', sql.NVarChar, id)
          .input('device_id', sql.NVarChar, t.device_id)
          .query('SELECT 1 FROM DeploymentTargets WHERE deployment_id = @deployment_id AND device_id = @device_id');
        
        if (check.recordset.length > 0) continue;

        await transaction.request()
          .input('deployment_id', sql.NVarChar, id)
          .input('device_id', sql.NVarChar, t.device_id)
          .input('hostname', sql.NVarChar, t.hostname)
          .input('ip', sql.NVarChar, t.ip)
          .input('status', sql.NVarChar, 'pending')
          .input('log', sql.NVarChar, 'Waiting for agent...')
          .input('updated_at', sql.NVarChar, new Date().toISOString())
          .input('progress', sql.Int, 0)
          .query(`
            INSERT INTO DeploymentTargets 
            (deployment_id, device_id, hostname, ip, status, log, updated_at, progress)
            VALUES 
            (@deployment_id, @device_id, @hostname, @ip, @status, @log, @updated_at, @progress)
          `);
      }

      // 2. Update Deployment Counts
      await transaction.request()
        .input('id', sql.NVarChar, id)
        .input('new_count', sql.Int, targets.length)
        .query(`
          UPDATE Deployments 
          SET total_targets = total_targets + @new_count,
              pending_count = pending_count + @new_count,
              status = 'running' -- Force status back to running if it was success/failed
          WHERE id = @id
        `);

      await transaction.commit();
      res.json({ success: true, message: 'Targets added successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Add targets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/devices/:id/db-connection ──────────────────
app.get('/api/devices/:id/db-connection', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('device_id', sql.NVarChar, id)
      .query('SELECT * FROM DeviceDbConnections WHERE device_id = @device_id');
    
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.json(null);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/devices/:id/db-connection ─────────────────
app.post('/api/devices/:id/db-connection', async (req, res) => {
  const { id } = req.params;
  const { db_name, db_user, db_password } = req.body;
  
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('device_id', sql.NVarChar, id)
      .input('db_name', sql.NVarChar, db_name)
      .input('db_user', sql.NVarChar, db_user)
      .input('db_password', sql.NVarChar, db_password)
      .query(`
        IF EXISTS (SELECT 1 FROM DeviceDbConnections WHERE device_id = @device_id)
        BEGIN
          UPDATE DeviceDbConnections 
          SET db_name = @db_name, db_user = @db_user, db_password = @db_password, updated_at = GETDATE()
          WHERE device_id = @device_id
        END
        ELSE
        BEGIN
          INSERT INTO DeviceDbConnections (device_id, db_name, db_user, db_password)
          VALUES (@device_id, @db_name, @db_user, @db_password)
        END
      `);
    res.json({ message: 'Database connection settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/devices ──────────────────────────────────────
app.get('/api/devices', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Devices');
    
    // Parse the group_ids back into arrays and convert last_seen to local timezone
    const devices = result.recordset.map(row => {
      let lastSeenLocal = 'Never';
      if (row.last_seen) {
        try {
          // Parse UTC time and convert to local timezone
          const utcDate = new Date(row.last_seen);
          lastSeenLocal = utcDate.toLocaleString('id-ID', {
            timeZone: process.env.TZ || 'Asia/Makassar',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        } catch (e) {
          lastSeenLocal = row.last_seen; // fallback to raw value
        }
      }
      
      return {
        ...row,
        group_ids: row.group_ids ? row.group_ids.split(',').filter(Boolean) : [],
        last_seen: lastSeenLocal
      };
    });
    
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/remote-commands ─────────────────────────────
app.post('/api/remote-commands', async (req, res) => {
  try {
    const { devices, command } = req.body;
    const pool = await poolPromise;
    
    if (!devices || !command || devices.length === 0) {
      return res.status(400).json({ error: 'Missing devices or command' });
    }

    // Log the execution in ActivityLog
    const timestamp = getCurrentTimeHHMM(); // HH:mm in configured timezone
    const actionDesc = `Command executed on ${devices.length} device(s): ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`;
    
    await pool.request()
      .input('time', sql.NVarChar, timestamp)
      .input('user', sql.NVarChar, 'admin')
      .input('action', sql.NVarChar, actionDesc)
      .query(`
        INSERT INTO ActivityLog (time, [user], action)
        VALUES (@time, @user, @action)
      `);

    // Simulate Output
    const output = [];
    devices.forEach((hostname, i) => {
      // Small simulated delay time strings
      const timeStr = new Date(Date.now() + i * 1000).toISOString().slice(11,19);
      output.push(`[${timeStr}] ${hostname.padEnd(15)} → OK`);
    });
    output.push(`[${new Date().toISOString().slice(11,19)}] ✓ Command completed on ${devices.length}/${devices.length} selected devices`);
    
    res.json({ success: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/devices ─────────────────────────────────────
app.post('/api/devices', async (req, res) => {
  try {
    const { id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, group_ids, last_seen } = req.body;
    const pool = await poolPromise;
    const gids = Array.isArray(group_ids) ? group_ids.join(',') : '';
    
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version || '')
      .input('cpu', sql.NVarChar, cpu || '')
      .input('ram', sql.NVarChar, ram || '')
      .input('disk', sql.NVarChar, disk || '')
      .input('agent_version', sql.NVarChar, agent_version || '')
      .input('status', sql.NVarChar, status || 'online')
      .input('group_ids', sql.NVarChar, gids)
      .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
      .query(`
        INSERT INTO Devices (id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, group_ids, last_seen)
        VALUES (@id, @hostname, @ip, @os_version, @cpu, @ram, @disk, @agent_version, @status, @group_ids, @last_seen)
      `);
      
    res.status(201).json({ message: 'Device created completely' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/devices/:id ──────────────────────────────────
app.put('/api/devices/:id', async (req, res) => {
  try {
    const { hostname, ip, os_version, cpu, ram, disk, agent_version, status, group_ids, last_seen } = req.body;
    const pool = await poolPromise;
    const gids = Array.isArray(group_ids) ? group_ids.join(',') : '';
    
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version || '')
      .input('cpu', sql.NVarChar, cpu || '')
      .input('ram', sql.NVarChar, ram || '')
      .input('disk', sql.NVarChar, disk || '')
      .input('agent_version', sql.NVarChar, agent_version || '')
      .input('status', sql.NVarChar, status || 'online')
      .input('group_ids', sql.NVarChar, gids)
      .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
      .query(`
        UPDATE Devices SET 
          hostname = @hostname, ip = @ip, os_version = @os_version, 
          cpu = @cpu, ram = @ram, disk = @disk, agent_version = @agent_version, 
          status = @status, group_ids = @group_ids, last_seen = @last_seen
        WHERE id = @id
      `);
      
    res.status(200).json({ message: 'Device updated completely' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/devices/:id ───────────────────────────────
app.delete('/api/devices/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const deviceId = req.params.id;
    
    // Get hostname before deleting
    const devRes = await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .query('SELECT hostname FROM Devices WHERE id = @id');
      
    const hostname = devRes.recordset[0]?.hostname;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input('id', sql.NVarChar, deviceId)
        .query('DELETE FROM DeploymentTargets WHERE device_id = @id');
        
      if (hostname) {
        await transaction.request()
          .input('hostname', sql.NVarChar, hostname)
          .query('DELETE FROM AgentInstallTargets WHERE hostname = @hostname');
          
        await transaction.request()
          .input('hostnamePattern', sql.NVarChar, '%' + hostname + '%')
          .query('DELETE FROM ActivityLog WHERE action LIKE @hostnamePattern');
      }

      await transaction.request()
        .input('id', sql.NVarChar, deviceId)
        .query('DELETE FROM Devices WHERE id = @id');

      await transaction.commit();
      res.json({ message: 'Device deleted successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/devices/register ────────────────────────────
// Endpoint for the manual powershell installer to hit
app.post('/api/devices/register', async (req, res) => {
  try {
    const { id, hostname, ip, os, status, last_seen } = req.body;
    const pool = await poolPromise;
    
    // Check if device already exists by hostname
    const existing = await pool.request()
      .input('hostname', sql.NVarChar, hostname)
      .query('SELECT * FROM Devices WHERE hostname = @hostname');
      
    if (existing.recordset.length > 0) {
      await pool.request()
        .input('hostname', sql.NVarChar, hostname)
        .input('ip', sql.NVarChar, ip || existing.recordset[0].ip)
        .input('os', sql.NVarChar, os || existing.recordset[0].os_version)
        .input('status', sql.NVarChar, status || 'online')
        .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
        .query(`
          UPDATE Devices SET ip = @ip, os_version = @os, status = @status, last_seen = @last_seen
          WHERE hostname = @hostname
        `);
    } else {
      await pool.request()
        .input('id', sql.NVarChar, id || `dev-${Date.now()}`)
        .input('hostname', sql.NVarChar, hostname)
        .input('ip', sql.NVarChar, ip || '')
        .input('os', sql.NVarChar, os || 'Windows')
        .input('status', sql.NVarChar, status || 'online')
        .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
        .query(`
          INSERT INTO Devices (id, hostname, ip, os_version, status, last_seen)
          VALUES (@id, @hostname, @ip, @os, @status, @last_seen)
        `);
    }
    
    res.status(200).json({ message: 'Device registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/groups ───────────────────────────────────────
app.get('/api/groups', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        g.id,
        g.name,
        g.description,
        g.color,
        COUNT(d.id) AS device_count
      FROM DeviceGroups g
      LEFT JOIN Devices d
        ON ',' + ISNULL(d.group_ids, '') + ',' LIKE '%,' + g.id + ',%'
      GROUP BY g.id, g.name, g.description, g.color
      ORDER BY g.name ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/groups ──────────────────────────────────────
app.post('/api/groups', async (req, res) => {
  try {
    const { id, name, description, color } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id || `group-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('color', sql.NVarChar, color || '#3b82f6')
      .query(`
        INSERT INTO DeviceGroups (id, name, description, color)
        VALUES (@id, @name, @description, @color)
      `);
    res.status(201).json({ message: 'Group created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/groups/:id ───────────────────────────────────
app.put('/api/groups/:id', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('color', sql.NVarChar, color || '#3b82f6')
      .query(`
        UPDATE DeviceGroups SET name = @name, description = @description, color = @color
        WHERE id = @id
      `);
    res.json({ message: 'Group updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/groups/:id ────────────────────────────────
app.delete('/api/groups/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const groupId = req.params.id;

    // Optional: Remove group association from devices instead of cascading?
    // For now, simple delete. If Devices table uses a comma-separated list, 
    // we might need more complex logic to clean up Devices.group_ids.
    
    await pool.request()
      .input('id', sql.NVarChar, groupId)
      .query('DELETE FROM DeviceGroups WHERE id = @id');
      
    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/packages ─────────────────────────────────────
app.get('/api/packages', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Packages');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/packages/download/:filename ──────────────────
app.get('/api/packages/download/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(REPO_PATH, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found in repository' });
  }
});

// ── POST /api/groups/:id/devices ─────────────────────────
app.post('/api/groups/:id/devices', async (req, res) => {
  const groupId = req.params.id;
  const { device_ids } = req.body; // Array of device IDs that should belong to this group

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Fetch all devices to process memberships
      const allDevicesRes = await transaction.request().query('SELECT id, group_ids FROM Devices');
      const allDevices = allDevicesRes.recordset;

      for (const device of allDevices) {
        let currentGroups = device.group_ids ? device.group_ids.split(',').filter(Boolean) : [];
        const shouldBeIn = device_ids.includes(device.id);
        const isIn = currentGroups.includes(groupId);

        let modified = false;
        if (shouldBeIn && !isIn) {
          currentGroups.push(groupId);
          modified = true;
        } else if (!shouldBeIn && isIn) {
          currentGroups = currentGroups.filter(id => id !== groupId);
          modified = true;
        }

        if (modified) {
          const newGroupIds = currentGroups.join(',');
          await transaction.request()
            .input('id', sql.NVarChar, device.id)
            .input('group_ids', sql.NVarChar, newGroupIds)
            .query('UPDATE Devices SET group_ids = @group_ids WHERE id = @id');
        }
      }

      await transaction.commit();
      res.json({ message: 'Group memberships updated successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/sql/test-connection ──────────────────────
app.post('/api/sql/test-connection', async (req, res) => {
  const { server, database, user, password } = req.body;
  const config = {
    user,
    password,
    server,
    database,
    options: {
      encrypt: false, // Usually false for local/internal MS SQL
      trustServerCertificate: true,
      connectTimeout: 5000
    },
    pool: { max: 1, min: 0, idleTimeoutMillis: 5000 }
  };

  try {
    const testPool = new sql.ConnectionPool(config);
    await testPool.connect();
    await testPool.close();
    res.json({ message: 'Connection successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/sql/execute ──────────────────────────────
app.post('/api/sql/execute', async (req, res) => {
  const { script, target_device_ids } = req.body;
  
  try {
    const pool = await poolPromise;
    // 1. Fetch connection details for all targets
    const connRes = await pool.request().query('SELECT * FROM DeviceDbConnections');
    const allConns = connRes.recordset;
    
    // 2. Fetch device IPs (Server addresses)
    const devRes = await pool.request().query('SELECT id, ip, hostname FROM Devices');
    const allDevs = devRes.recordset;

    const results = {};
    const executionPromises = target_device_ids.map(async (deviceId) => {
      const dev = allDevs.find(d => d.id === deviceId);
      const conn = allConns.find(c => c.device_id === deviceId);

      if (!dev) {
        results[deviceId] = { status: 'error', error: 'Device not found' };
        return;
      }
      if (!conn) {
        results[deviceId] = { status: 'error', error: 'Database connection not configured for this device' };
        return;
      }

      const config = {
        user: conn.db_user,
        password: conn.db_password,
        server: dev.ip,
        database: conn.db_name,
        options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
        pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
      };

      try {
        const remotePool = new sql.ConnectionPool(config);
        await remotePool.connect();
        const result = await remotePool.request().query(script);
        await remotePool.close();
        results[deviceId] = { 
          status: 'success', 
          hostname: dev.hostname,
          ip: dev.ip,
          recordset: result.recordset,
          rowsAffected: result.rowsAffected 
        };
      } catch (err) {
        results[deviceId] = { 
          status: 'error', 
          hostname: dev.hostname,
          ip: dev.ip,
          error: err.message 
        };
      }
    });

    await Promise.all(executionPromises);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deployments ──────────────────────────────────
app.get('/api/deployments', async (req, res) => {
  try {
    console.log('GET /api/deployments called');
    const pool = await poolPromise;
    console.log('Pool obtained');
    const result = await pool.request().query('SELECT * FROM Deployments');
    console.log('Query executed, records:', result.recordset.length);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error in /api/deployments:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/deployment-targets ───────────────────────────
app.get('/api/deployment-targets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT t.* 
      FROM DeploymentTargets t
      INNER JOIN Devices d ON t.device_id = d.id
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to expand IP ranges (e.g. "192.168.1.1-50" or "192.168.1.1 - 192.168.1.50")
function parseIPRange(input) {
  if (!input) return [];
  const allIps = [];
  const normalized = input.replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-');
  const parts = normalized.split(/[,;\s]+/).filter(Boolean);
  for (const part of parts) {
    let m = part.match(/^(\d+\.\d+\.\d+\.\d+)-(\d+\.\d+\.\d+\.\d+)$/);
    if (m) {
      const start = m[1].split('.').map(Number);
      const end = m[2].split('.').map(Number);
      if (start[0] === end[0] && start[1] === end[1] && start[2] === end[2]) {
        for (let j = Math.min(start[3], end[3]); j <= Math.max(start[3], end[3]); j++) {
          allIps.push(`${start[0]}.${start[1]}.${start[2]}.${j}`);
        }
      }
      continue;
    }
    m = part.match(/^(\d+\.\d+\.\d+)\.(\d+)-(\d+)$/);
    if (m) {
      const base = m[1];
      const start = parseInt(m[2]);
      const end = parseInt(m[3]);
      for (let j = Math.min(start, end); j <= Math.max(start, end); j++) {
        allIps.push(`${base}.${j}`);
      }
      continue;
    }
    if (part.match(/^(\d{1,3}\.){3}\d{1,3}$/)) {
      allIps.push(part);
    }
  }
  return [...new Set(allIps)];
}

// ── GET /api/agent-jobs ───────────────────────────────────
app.get('/api/agent-jobs', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM AgentJobs ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent-jobs ──────────────────────────────────
app.post('/api/agent-jobs', async (req, res) => {
  try {
    const { id, ip_range, created_by, username, password, device_targets } = req.body;
    const pool = await poolPromise;

    let serverUrl = `${req.protocol}://${req.get('host')}`;
    if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) serverUrl = "http://192.168.85.30:3001";
    const psScript      = path.resolve(__dirname, 'scripts', 'push_agent.ps1');
    const installerPath = path.resolve(__dirname, 'public', 'Manual-Agent-Installer-v25.ps1');

    // ── MODE A: device_targets (per-device, from device list) ──
    if (device_targets && Array.isArray(device_targets) && device_targets.length > 0) {
      const total = device_targets.length;

      await pool.request()
        .input('id', sql.NVarChar, id)
        .input('created_at', sql.NVarChar, new Date().toISOString())
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .input('ip_range', sql.NVarChar(sql.MAX), ip_range || device_targets.map(d => d.hostname).join(', ').substring(0, 500))
        .input('total', sql.Int, total)
        .query(`INSERT INTO AgentJobs (id, created_at, created_by, ip_range, total, success_count, failed_count, pending_count) VALUES (@id, @created_at, @created_by, @ip_range, @total, 0, 0, @total)`);

      res.status(201).json({ message: 'Job started', total_targets: total });

      // Background sequential execution per device
      (async () => {
        for (const target of device_targets) {
          const tIp   = target.ip   || '0.0.0.0';
          const tHost = target.hostname || `UNKNOWN-${tIp.split('.').pop()}`;
          const tUser = target.username || username || 'Administrator';
          const tPass = target.password || password || '';

          try {
            await pool.request()
              .input('job_id', sql.NVarChar, id)
              .input('device_ip', sql.NVarChar, tIp)
              .input('hostname', sql.NVarChar, tHost)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM AgentInstallTargets WHERE job_id=@job_id AND device_ip=@device_ip)
                  INSERT INTO AgentInstallTargets (job_id, device_ip, hostname, status, log, updated_at)
                  VALUES (@job_id, @device_ip, @hostname, 'running', 'Starting...', LEFT(CONVERT(VARCHAR, GETDATE(), 108), 5))
              `);
          } catch (e) { /* ignore */ }

          let statusResult = 'failed';
          let logMsg = '';
          try {
            const cmd = `powershell.exe -ExecutionPolicy Bypass -File "${psScript}" -TargetIP "${tIp}" -Username "${tUser}" -Password "${tPass}" -InstallerPath "${installerPath}" -ServerUrl "${serverUrl}"`;
            const { stdout, stderr } = await execPromise(cmd, { timeout: 60000 }).catch(e => ({ stdout: '', stderr: e.message }));
            logMsg = (stdout + '\n' + stderr).trim();
            if (stdout.includes('STATUS:SUCCESS')) {
              statusResult = 'success';
              logMsg = stdout.split('|LOG:')[1]?.trim() || 'Success';
            } else {
              logMsg = stdout.split('|LOG:')[1]?.trim() || logMsg.substring(0, 500) || 'Timeout or error';
            }
          } catch (err) {
            logMsg = err.message || 'Execution error';
          }

          await pool.request()
            .input('job_id', sql.NVarChar, id).input('ip', sql.NVarChar, tIp)
            .input('status', sql.NVarChar, statusResult).input('log', sql.NVarChar, logMsg.substring(0, 500))
            .query(`UPDATE AgentInstallTargets SET status=@status, log=@log, updated_at=LEFT(CONVERT(VARCHAR,GETDATE(),108),5) WHERE job_id=@job_id AND device_ip=@ip`);

          await pool.request()
            .input('id', sql.NVarChar, id)
            .input('s', sql.Int, statusResult === 'success' ? 1 : 0)
            .input('f', sql.Int, statusResult === 'failed'  ? 1 : 0)
            .query(`UPDATE AgentJobs SET success_count=success_count+@s, failed_count=failed_count+@f, pending_count=pending_count-1 WHERE id=@id`);
        }
      })();
      return;
    }

    // ── MODE B: IP Range (legacy) ──────────────────────────
    const ips = parseIPRange(ip_range);
    const total = ips.length;
    if (total === 0) return res.status(400).json({ error: "No valid IPs found." });

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('created_at', sql.NVarChar, new Date().toISOString())
      .input('created_by', sql.NVarChar, created_by || 'admin')
      .input('ip_range', sql.NVarChar, ip_range)
      .input('total', sql.Int, total)
      .query(`INSERT INTO AgentJobs (id, created_at, created_by, ip_range, total, success_count, failed_count, pending_count) VALUES (@id, @created_at, @created_by, @ip_range, @total, 0, 0, @total)`);

    res.status(201).json({ message: 'Job started', total_targets: total });

    (async () => {
      let currentIdx = 0;
      const worker = async () => {
        while (currentIdx < total) {
          const ip = ips[currentIdx++];
          if (!ip) break;
          try {
            await pool.request()
              .input('job_id', sql.NVarChar, id)
              .input('device_ip', sql.NVarChar, ip)
              .input('hostname', sql.NVarChar, `UNKNOWN-${ip.split('.')[3]}`)
              .input('status', sql.NVarChar, 'running')
              .query(`INSERT INTO AgentInstallTargets (job_id, device_ip, hostname, status, log, updated_at) VALUES (@job_id, @device_ip, @hostname, @status, 'Starting...', LEFT(CONVERT(VARCHAR, GETDATE(), 108), 5))`);

            const command = `powershell.exe -ExecutionPolicy Bypass -File "${psScript}" -TargetIP "${ip}" -Username "${username}" -Password "${password}" -InstallerPath "${installerPath}" -ServerUrl "${serverUrl}"`;
            const { stdout, stderr } = await execPromise(command, { timeout: 45000 }).catch(e => ({ stdout: '', stderr: e.message }));
            let statusResult = 'failed';
            let logMsg = (stdout + "\n" + stderr).trim();
            if (stdout.includes('STATUS:SUCCESS')) {
              statusResult = 'success';
              logMsg = stdout.split('|LOG:')[1]?.trim() || 'Success';
            } else {
              logMsg = stdout.split('|LOG:')[1]?.trim() || logMsg.substring(0, 500) || 'Timeout';
            }

            await pool.request()
              .input('job_id', sql.NVarChar, id).input('ip', sql.NVarChar, ip)
              .input('status', sql.NVarChar, statusResult).input('log', sql.NVarChar, logMsg.substring(0, 500))
              .query(`UPDATE AgentInstallTargets SET status=@status, log=@log, updated_at=LEFT(CONVERT(VARCHAR,GETDATE(),108),5) WHERE job_id=@job_id AND device_ip=@ip`);

            await pool.request()
              .input('id', sql.NVarChar, id)
              .input('s', sql.Int, statusResult === 'success' ? 1 : 0)
              .input('f', sql.Int, statusResult === 'failed'  ? 1 : 0)
              .query(`UPDATE AgentJobs SET success_count=success_count+@s, failed_count=failed_count+@f, pending_count=pending_count-1 WHERE id=@id`);
          } catch (err) {
            console.error(`Worker error for ${ip}:`, err.message);
          }
        }
      };
      const workers = Array(Math.min(8, total)).fill(null).map(() => worker());
      await Promise.all(workers);
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent-jobs/retry ──────────────────────────
app.post('/api/agent-jobs/retry', async (req, res) => {
  const { job_id, device_ip, username, password } = req.body;
  console.log(`[AGENT] Retry requested for Job: ${job_id}, IP: ${device_ip}, User: ${username}`);
  
  if (!job_id || !device_ip) return res.status(400).json({ error: "Missing job_id or device_ip" });

  try {
    const pool = await poolPromise;
    
    // 1. Get job and target info
    const jobRes = await pool.request().input('id', sql.NVarChar, job_id).query("SELECT * FROM AgentJobs WHERE id = @id");
    const tarRes = await pool.request()
      .input('jid', sql.NVarChar, job_id)
      .input('ip', sql.NVarChar, device_ip)
      .query("SELECT * FROM AgentInstallTargets WHERE job_id = @jid AND device_ip = @ip");

    const job = jobRes.recordset[0];
    const target = tarRes.recordset[0];

    if (!job) {
      console.warn(`[AGENT] Retry failed: Job ${job_id} not found.`);
      return res.status(404).json({ error: `Job ${job_id} not found.` });
    }
    if (!target) {
      console.warn(`[AGENT] Retry failed: Target ${device_ip} not found in job ${job_id}.`);
      return res.status(404).json({ error: `Target ${device_ip} not found in this job.` });
    }

    // 2. Set target back to running
    await pool.request()
      .input('jid', sql.NVarChar, job_id)
      .input('ip', sql.NVarChar, device_ip)
      .query("UPDATE AgentInstallTargets SET status = 'running', log = 'Retrying...', updated_at = LEFT(CONVERT(VARCHAR, GETDATE(), 108), 5) WHERE job_id = @jid AND device_ip = @ip");

    // 3. Adjust counts
    if (target.status === 'success') {
       await pool.request().input('id', sql.NVarChar, job_id).query("UPDATE AgentJobs SET success_count = success_count - 1, pending_count = pending_count + 1 WHERE id = @id");
    } else if (target.status === 'failed') {
       await pool.request().input('id', sql.NVarChar, job_id).query("UPDATE AgentJobs SET failed_count = failed_count - 1, pending_count = pending_count + 1 WHERE id = @id");
    }

    res.json({ success: true, message: "Retry initiated" });

    // 4. Run installation in background (reusing the logic from POST /api/agent-jobs)
    (async () => {
       const psScript      = path.resolve(__dirname, 'scripts', 'push_agent.ps1');
       const installerPath = path.resolve(__dirname, 'public', 'Manual-Agent-Installer-v25.ps1');
       let serverUrl = `${req.protocol}://${req.get('host')}`;
       if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) serverUrl = "http://192.168.85.30:3001";

       let statusResult = 'failed';
       let logMsg = '';
       try {
         // Using default credentials from job if available or relying on script defaults
         // Note: we don't store passwords, so we might need them passed in or use fallback
         // Using provided credentials
         const cmd = `powershell.exe -ExecutionPolicy Bypass -File "${psScript}" -TargetIP "${device_ip}" -Username "${username || 'Administrator'}" -Password "${password || ''}" -InstallerPath "${installerPath}" -ServerUrl "${serverUrl}"`;
         const { stdout, stderr } = await execPromise(cmd, { timeout: 60000 }).catch(e => ({ stdout: '', stderr: e.message }));
         
         logMsg = (stdout + '\n' + stderr).trim();
         if (stdout.includes('STATUS:SUCCESS')) {
           statusResult = 'success';
           logMsg = stdout.split('|LOG:')[1]?.trim() || 'Success';
         } else {
           logMsg = stdout.split('|LOG:')[1]?.trim() || logMsg.substring(0, 500) || 'Retry failed';
         }
       } catch (err) {
         logMsg = err.message || 'Execution error during retry';
       }

       await pool.request()
         .input('job_id', sql.NVarChar, job_id).input('ip', sql.NVarChar, device_ip)
         .input('status', sql.NVarChar, statusResult).input('log', sql.NVarChar, logMsg.substring(0, 500))
         .query(`UPDATE AgentInstallTargets SET status=@status, log=@log, updated_at=LEFT(CONVERT(VARCHAR,GETDATE(),108),5) WHERE job_id=@job_id AND device_ip=@ip`);

       await pool.request()
         .input('id', sql.NVarChar, job_id)
         .input('s', sql.Int, statusResult === 'success' ? 1 : 0)
         .input('f', sql.Int, statusResult === 'failed'  ? 1 : 0)
         .query(`UPDATE AgentJobs SET success_count=success_count+@s, failed_count=failed_count+@f, pending_count=pending_count-1 WHERE id=@id`);
    })();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/agent-jobs/:id ───────────────────────────
app.delete('/api/agent-jobs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, id).query(`
      DELETE FROM AgentInstallTargets WHERE job_id = @id;
      DELETE FROM AgentJobs WHERE id = @id;
    `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent-install-targets ────────────────────────
app.get('/api/agent-install-targets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT t.* 
      FROM AgentInstallTargets t
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/activity-log ─────────────────────────────────
app.get('/api/activity-log', async (req, res) => {
  try {
    const pool = await poolPromise;
    const requestUser = await getRequestUser(req, pool);
    if (!requestUser) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const logs = await fetchActivityLogs(pool, requestUser, { date: req.query.date });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/activity-log/export', async (req, res) => {
  try {
    const pool = await poolPromise;
    const requestUser = await getRequestUser(req, pool);
    if (!requestUser) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const dateFilter = normalizeDateFilter(req.query.date);
    const logs = await fetchActivityLogs(pool, requestUser, { date: dateFilter });
    const headers = ['Time', 'Level', 'User', 'Action', 'Created At'];
    const rows = logs.map((entry) => [
      entry.time,
      entry.level,
      entry.user,
      entry.action,
      entry.created_at instanceof Date ? entry.created_at.toISOString() : entry.created_at,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\r\n');

    const scopeLabel = requestUser.is_admin ? 'all-users' : requestUser.username;
    const dateLabel = dateFilter || 'all-dates';
    const filename = `activity-log-${scopeLabel}-${dateLabel}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/packages/:id ──────────────────────────────
app.delete('/api/packages/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM Packages WHERE id = @id');
    res.json({ message: 'Package deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/deployments/:id ───────────────────────────
app.delete('/api/deployments/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input('id', sql.NVarChar, req.params.id)
        .query('DELETE FROM DeploymentTargets WHERE deployment_id = @id');
        
      await transaction.request()
        .input('id', sql.NVarChar, req.params.id)
        .query('DELETE FROM Deployments WHERE id = @id');

      await transaction.commit();
      res.json({ message: 'Deployment deleted successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/packages ─────────────────────────────────────
app.post('/api/packages', packageUpload.single('file'), async (req, res) => {
  try {
    const { id, name, version, type, uploaded_by } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileName = file.originalname;
    const fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('version', sql.NVarChar, version || '')
      .input('checksum', sql.NVarChar, 'sha256:temp') 
      .input('file_path', sql.NVarChar, fileName) 
      .input('size', sql.NVarChar, fileSize)
      .input('type', sql.NVarChar, type || path.extname(fileName).replace('.', ''))
      .input('uploaded_at', sql.NVarChar, new Date().toISOString())
      .input('uploaded_by', sql.NVarChar, uploaded_by || 'admin')
      .query(`
        INSERT INTO Packages (id, name, version, checksum, file_path, size, type, uploaded_at, uploaded_by)
        VALUES (@id, @name, @version, @checksum, @file_path, @size, @type, @uploaded_at, @uploaded_by)
      `);
    
    res.json({ success: true, id, file_path: fileName });
  } catch (err) {
    console.error('Package upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/deployments ──────────────────────────────────
app.post('/api/deployments', async (req, res) => {
  try {
    const { 
      id, package_id, package_name, package_version, 
      target_path, schedule_time, created_by, created_at, 
      status, targets 
    } = req.body;
    
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Insert Deployment
      await transaction.request()
        .input('id', sql.NVarChar, id)
        .input('package_id', sql.NVarChar, package_id)
        .input('package_name', sql.NVarChar, package_name)
        .input('package_version', sql.NVarChar, package_version)
        .input('target_path', sql.NVarChar, target_path)
        .input('schedule_time', sql.NVarChar, schedule_time || null)
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .input('created_at', sql.NVarChar, created_at || new Date().toISOString())
        .input('status', sql.NVarChar, status || 'pending')
        .input('total_targets', sql.Int, targets ? targets.length : 0)
        .input('success_count', sql.Int, 0)
        .input('failed_count', sql.Int, 0)
        .input('pending_count', sql.Int, targets ? targets.length : 0)
        .query(`
          INSERT INTO Deployments 
          (id, package_id, package_name, package_version, target_path, schedule_time, created_by, created_at, status, total_targets, success_count, failed_count, pending_count)
          VALUES 
          (@id, @package_id, @package_name, @package_version, @target_path, @schedule_time, @created_by, @created_at, @status, @total_targets, @success_count, @failed_count, @pending_count)
        `);

      // 2. Insert Deployment Targets
      if (targets && targets.length > 0) {
        for (const t of targets) {
          await transaction.request()
            .input('deployment_id', sql.NVarChar, id)
            .input('device_id', sql.NVarChar, t.device_id)
            .input('hostname', sql.NVarChar, t.hostname)
            .input('ip', sql.NVarChar, t.ip)
            .input('status', sql.NVarChar, 'pending')
            .input('log', sql.NVarChar, 'Waiting for agent...')
            .input('updated_at', sql.NVarChar, new Date().toISOString())
            .input('progress', sql.Int, 0)
            .query(`
              INSERT INTO DeploymentTargets 
              (deployment_id, device_id, hostname, ip, status, log, updated_at, progress)
              VALUES 
              (@deployment_id, @device_id, @hostname, @ip, @status, @log, @updated_at, @progress)
            `);
        }
      }

      await transaction.commit();
      res.status(201).json({ message: 'Deployment created successfully', deployment: req.body });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/devices ─────────────────────────────────────
app.post('/api/devices', async (req, res) => {
  try {
    const { id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, last_seen, group_ids } = req.body;
    const groupsString = Array.isArray(group_ids) ? group_ids.join(',') : '';

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version)
      .input('cpu', sql.NVarChar, cpu)
      .input('ram', sql.NVarChar, ram)
      .input('disk', sql.NVarChar, disk)
      .input('agent_version', sql.NVarChar, agent_version)
      .input('status', sql.NVarChar, status)
      .input('last_seen', sql.NVarChar, last_seen)
      .input('group_ids', sql.NVarChar, groupsString)
      .query(`
        INSERT INTO Devices 
        (id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, last_seen, group_ids)
        VALUES 
        (@id, @hostname, @ip, @os_version, @cpu, @ram, @disk, @agent_version, @status, @last_seen, @group_ids)
      `);
      
    res.status(201).json({ message: 'Device created successfully', device: req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/devices/:id ──────────────────────────────────
app.put('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { hostname, ip, os_version, cpu, ram, disk, agent_version, status, last_seen, group_ids } = req.body;
    const groupsString = Array.isArray(group_ids) ? group_ids.join(',') : '';

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version)
      .input('cpu', sql.NVarChar, cpu)
      .input('ram', sql.NVarChar, ram)
      .input('disk', sql.NVarChar, disk)
      .input('agent_version', sql.NVarChar, agent_version)
      .input('status', sql.NVarChar, status)
      .input('last_seen', sql.NVarChar, last_seen)
      .input('group_ids', sql.NVarChar, groupsString)
      .query(`
        UPDATE Devices 
        SET hostname=@hostname, ip=@ip, os_version=@os_version, cpu=@cpu, 
            ram=@ram, disk=@disk, agent_version=@agent_version, status=@status, 
            last_seen=@last_seen, group_ids=@group_ids
        WHERE id=@id
      `);
      
    res.json({ message: 'Device updated successfully', device: { ...req.body, id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/devices/:id ───────────────────────────────
app.delete('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query('DELETE FROM Devices WHERE id=@id');
      
    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/heartbeat ──────────────────────────
app.post('/api/agent/heartbeat', async (req, res) => {
  try {
    const { hostname, ip, cpu, ram, disk, agent_version, os_version } = req.body;
    if (!hostname) return res.status(400).json({ error: "Hostname is required" });

    const pool = await poolPromise;
    const now = new Date().toISOString();
    
    // Deterministic ID based on hostname to avoid collisions
    const safeId = `dev-${hostname.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Atomic MERGE for registration and updates
    await pool.request()
      .input('id', sql.NVarChar, safeId)
      .input('h', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip || '0.0.0.0')
      .input('cpu', sql.NVarChar, cpu || 'N/A')
      .input('ram', sql.NVarChar, ram || 'N/A')
      .input('disk', sql.NVarChar, disk || 'N/A')
      .input('ver', sql.NVarChar, agent_version || '2.5.0')
      .input('os', sql.NVarChar, os_version || 'Windows')
      .input('seen', sql.NVarChar, now)
      .query(`
        MERGE INTO Devices WITH (HOLDLOCK) AS target
        USING (SELECT @h AS hostname) AS source
        ON target.hostname = source.hostname
        WHEN MATCHED THEN
          UPDATE SET 
            ip = @ip, cpu = @cpu, ram = @ram, disk = @disk, 
            agent_version = @ver, os_version = @os, 
            last_seen = @seen, status = 'online'
        WHEN NOT MATCHED THEN
          INSERT (id, hostname, ip, os_version, status, last_seen, cpu, ram, disk, agent_version)
          VALUES (@id, @h, @ip, @os, 'online', @seen, @cpu, @ram, @disk, @ver);
      `);

    // Fetch config for auto-update response
    const configRes = await pool.request().query("SELECT [key], [value] FROM SystemConfigs WHERE [key] IN ('LATEST_AGENT_VERSION', 'AGENT_UPDATE_URL')");
    const configs = {};
    configRes.recordset.forEach(r => configs[r.key] = r.value);

    res.json({
      status: 'ok',
      timestamp: now,
      latest_agent_version: configs.LATEST_AGENT_VERSION || '2.5.0',
      update_url: configs.AGENT_UPDATE_URL || ''
    });

  } catch (err) {
    console.error(`[AGENT] Heartbeat error for ${hostname}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent/config ──────────────────────────────
app.get('/api/agent/config', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT [key], [value] FROM SystemConfigs WHERE [key] IN ('LATEST_AGENT_VERSION', 'AGENT_UPDATE_URL')");
    const configs = {};
    result.recordset.forEach(r => configs[r.key] = r.value);
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/config ─────────────────────────────
app.post('/api/agent/config', async (req, res) => {
  const { LATEST_AGENT_VERSION, AGENT_UPDATE_URL } = req.body;
  try {
    const pool = await poolPromise;
    
    if (LATEST_AGENT_VERSION !== undefined) {
      await pool.request()
        .input('key', sql.NVarChar, 'LATEST_AGENT_VERSION')
        .input('val', sql.NVarChar, LATEST_AGENT_VERSION)
        .query(`
          MERGE INTO SystemConfigs WITH (HOLDLOCK) AS target
          USING (SELECT @key AS [key]) AS source
          ON target.[key] = source.[key]
          WHEN MATCHED THEN UPDATE SET [value] = @val, updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (@key, @val);
        `);
    }

    if (AGENT_UPDATE_URL !== undefined) {
      await pool.request()
        .input('key', sql.NVarChar, 'AGENT_UPDATE_URL')
        .input('val', sql.NVarChar, AGENT_UPDATE_URL)
        .query(`
          MERGE INTO SystemConfigs WITH (HOLDLOCK) AS target
          USING (SELECT @key AS [key]) AS source
          ON target.[key] = source.[key]
          WHEN MATCHED THEN UPDATE SET [value] = @val, updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (@key, @val);
        `);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Config save error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent/version ───────────────────────────────
app.get('/api/agent/version', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT [value] FROM SystemConfigs WHERE [key] = 'LATEST_AGENT_VERSION'");
    const version = result.recordset[0]?.value || '2.5.0';
    res.json({ version });
  } catch (err) {
    res.json({ version: '2.5.0' });
  }
});

// ── GET /api/agent/pending?hostname=... ──────────────────
app.get('/api/agent/pending', async (req, res) => {
  const { hostname } = req.query;
  if (!hostname) return res.json({ commands: [] });
  try {
    const pool = await poolPromise;
    // Find device_id by hostname
    const devRes = await pool.request()
      .input('h', sql.NVarChar, hostname)
      .query("SELECT id FROM Devices WHERE hostname = @h");
    if (!devRes.recordset[0]) return res.json({ commands: [] });
    const device_id = devRes.recordset[0].id;

    // Fetch pending commands for this device
    const cmdsRes = await pool.request()
      .input('device_id', sql.NVarChar, device_id)
      .query("SELECT id, exec_id, command FROM PendingCommands WHERE device_id = @device_id AND status = 'pending'");

    res.json({ commands: cmdsRes.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/agent/pending-deployments?hostname=... ──────
app.get('/api/agent/pending-deployments', async (req, res) => {
  const { hostname } = req.query;
  if (!hostname) return res.json({ deployments: [] });
  try {
    const pool = await poolPromise;
    const devRes = await pool.request()
      .input('h', sql.NVarChar, hostname)
      .query("SELECT id FROM Devices WHERE hostname = @h");
    if (!devRes.recordset[0]) return res.json({ deployments: [] });
    const device_id = devRes.recordset[0].id;

    const depRes = await pool.request()
      .input('dev_id', sql.NVarChar, device_id)
      .query(`
        SELECT 
          t.deployment_id, 
          t.device_id, 
          d.package_name, 
          d.target_path, 
          p.file_path as file_name
        FROM DeploymentTargets t
        INNER JOIN Deployments d ON t.deployment_id = d.id
        LEFT JOIN Packages p ON d.package_id = p.id
        WHERE t.device_id = @dev_id AND t.status IN ('pending', 'failed', 'running')
      `);

    res.json({ deployments: depRes.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/software-inventory ───────────────────
app.post('/api/agent/software-inventory', async (req, res) => {
  const { hostname, software } = req.body;
  if (!hostname || !Array.isArray(software)) return res.status(400).json({ error: 'Missing hostname or software list' });
  try {
    const pool = await poolPromise;
    const devRes = await pool.request()
      .input('h', sql.NVarChar, hostname)
      .query("SELECT id FROM Devices WHERE hostname = @h");
    if (!devRes.recordset[0]) return res.json({ status: 'device_not_found' });
    const device_id = devRes.recordset[0].id;

    // Clear old entries for this device then re-insert
    await pool.request()
      .input('device_id', sql.NVarChar, device_id)
      .query("DELETE FROM DeviceSoftware WHERE device_id = @device_id");

    for (const sw of software.slice(0, 300)) {
      if (!sw.name) continue;
      await pool.request()
        .input('device_id', sql.NVarChar, device_id)
        .input('name', sql.NVarChar(500), (sw.name || '').substring(0, 500))
        .input('version', sql.NVarChar(100), (sw.version || '').substring(0, 100))
        .input('publisher', sql.NVarChar(200), (sw.publisher || '').substring(0, 200))
        .query(`
          IF NOT EXISTS (SELECT 1 FROM DeviceSoftware WHERE device_id=@device_id AND name=@name)
            INSERT INTO DeviceSoftware (device_id, name, version, publisher)
            VALUES (@device_id, @name, @version, @publisher)
        `);
    }
    res.json({ status: 'ok', count: software.length });
  } catch (err) {
    console.error('Software inventory error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/command-result ───────────────────────
app.post('/api/agent/command-result', async (req, res) => {
  const { command_id, exec_id, hostname, status, result_log } = req.body;
  if (!command_id) return res.status(400).json({ error: 'Missing command_id' });
  try {
    const pool = await poolPromise;

    // 1. Update PendingCommands row
    await pool.request()
      .input('id', sql.NVarChar, command_id)
      .input('status', sql.NVarChar, status === 'success' ? 'done' : 'failed')
      .input('log', sql.NVarChar, result_log || '')
      .query("UPDATE PendingCommands SET status = @status, result_log = @log, executed_at = GETDATE() WHERE id = @id");

    // 2. Update in-memory commandExecutions map so frontend polling works
    if (exec_id && commandExecutions.has(exec_id)) {
      const execData = commandExecutions.get(exec_id);
      const existing = execData.logs.find(l => l.hostname === hostname);
      const logEntry = {
        hostname: hostname,
        ip: existing?.ip || '',
        status: status,
        log: result_log || 'Command executed.',
        updated_at: new Date().toISOString()
      };
      if (existing) {
        Object.assign(existing, logEntry);
      } else {
        execData.logs.push(logEntry);
      }

      // Check if all commands for this exec are done
      const allCmds = await pool.request()
        .input('exec_id', sql.NVarChar, exec_id)
        .query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending FROM PendingCommands WHERE exec_id = @exec_id");
      const { total, pending } = allCmds.recordset[0];
      if (pending === 0) execData.is_complete = true;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/agent/deploy-status ─────────────────────────
app.post('/api/agent/deploy-status', async (req, res) => {
  const { deployment_id, device_id, status, progress, log } = req.body;
  try {
    const pool = await poolPromise;
    
    // 1. Update target
    const currentStatusRes = await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .input('dev_id', sql.NVarChar, device_id)
      .query('SELECT status, retry_count FROM DeploymentTargets WHERE deployment_id = @dep_id AND device_id = @dev_id');
    
    const currentTarget = currentStatusRes.recordset[0];
    let newRetryCount = currentTarget ? (currentTarget.retry_count || 0) : 0;
    
    if (status === 'failed') {
      newRetryCount += 1;
    } else if (status === 'success') {
      newRetryCount = 0; // reset on success if needed
    }

    await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .input('dev_id', sql.NVarChar, device_id)
      .input('status', sql.NVarChar, status)
      .input('progress', sql.Int, progress)
      .input('log', sql.NVarChar, log)
      .input('retry_count', sql.Int, newRetryCount)
      .input('updated_at', sql.NVarChar, new Date().toISOString())
      .query(`
        UPDATE DeploymentTargets 
        SET status = @status, progress = @progress, log = @log, 
            retry_count = @retry_count, last_error = (CASE WHEN @status = 'failed' THEN @log ELSE last_error END),
            updated_at = @updated_at
        WHERE deployment_id = @dep_id AND device_id = @dev_id
      `);

    // 2. Recalculate deployment overall status
    const statsResult = await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status NOT IN ('success', 'failed') THEN 1 ELSE 0 END) as pending
        FROM DeploymentTargets
        WHERE deployment_id = @dep_id
      `);
    
    const stats = statsResult.recordset[0];
    const overallStatus = stats.pending === 0 ? (stats.failed > 0 ? 'failed' : 'success') : 'running';

    await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .input('success', sql.Int, stats.success)
      .input('failed', sql.Int, stats.failed)
      .input('pending', sql.Int, stats.pending)
      .input('status', sql.NVarChar, overallStatus)
      .query(`
        UPDATE Deployments 
        SET success_count = @success, failed_count = @failed, pending_count = @pending, status = @status
        WHERE id = @dep_id
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AUTHENTICATION ────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT u.id, u.username, u.full_name, u.role_id, u.password_hash,
               r.name as role_name, r.menu_permissions, r.is_admin 
        FROM Users u
        JOIN Roles r ON u.role_id = r.id
        WHERE u.username = @username
      `);
    
    const user = result.recordset[0];
    if (user && user.password_hash === password) {
      const { password_hash, ...userSafe } = user;
      // Ensure ID is present in userSafe
      userSafe.id = user.id; 
      console.log('[DEBUG] Login Success. User ID:', userSafe.id);
      res.json({ success: true, user: userSafe });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── USER MANAGEMENT ────────────────────────────────────────
async function getRequestUser(req, pool) {
  const headerUserId = req.headers['x-user-id'];
  const userId = (typeof headerUserId === 'string' && headerUserId) || req.body?.userId || req.query?.userId;
  if (!userId) return null;

  const result = await pool.request()
    .input('uid', sql.NVarChar, userId)
    .query(`
      SELECT u.id, u.username, u.full_name, u.role_id, r.name as role_name, r.menu_permissions, r.is_admin
      FROM Users u
      JOIN Roles r ON u.role_id = r.id
      WHERE u.id = @uid OR u.username = @uid
    `);

  return result.recordset[0] || null;
}

async function requireAdminUser(req, res, pool) {
  const user = await getRequestUser(req, pool);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: user not found.' });
    return null;
  }
  if (!user.is_admin) {
    res.status(403).json({ error: 'Access denied: admin only.' });
    return null;
  }
  return user;
}

function normalizeDateFilter(value) {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function escapeCsvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchActivityLogs(pool, requestUser, options = {}) {
  const dateFilter = normalizeDateFilter(options.date);
  const request = pool.request();
  const filters = [];

  if (!requestUser.is_admin) {
    request.input('username', sql.NVarChar, requestUser.username);
    filters.push('[user] = @username');
  }

  if (dateFilter) {
    request.input('dateFilter', sql.Date, dateFilter);
    // Note: created_at column does not exist, date filter disabled
    filters.push('1=1');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await request.query(`
    SELECT
      id,
      time,
      [user],
      action,
      GETDATE() as created_at, -- Placeholder since column doesn't exist
      CASE
        WHEN LOWER(action) LIKE '%error%' OR LOWER(action) LIKE '%failed%' OR LOWER(action) LIKE '%denied%' THEN 'error'
        WHEN LOWER(action) LIKE '%warning%' OR LOWER(action) LIKE '%offline%' THEN 'warning'
        WHEN LOWER(action) LIKE '%success%' OR LOWER(action) LIKE '%completed%' OR LOWER(action) LIKE '%synced%' THEN 'success'
        ELSE 'info'
      END AS level
    FROM ActivityLog
    ${whereClause}
    ORDER BY id DESC
  `);

  return result.recordset;
}

app.get('/api/users', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT u.id, u.username, u.full_name, u.role_id, u.created_at, r.name as role_name 
      FROM Users u
      JOIN Roles r ON u.role_id = r.id
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, full_name, role_id } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, `user-${Date.now()}`)
      .input('username', sql.NVarChar, username)
      .input('password', sql.NVarChar, password)
      .input('full_name', sql.NVarChar, full_name)
      .input('role_id', sql.NVarChar, role_id)
      .query(`
        INSERT INTO Users (id, username, password_hash, full_name, role_id)
        VALUES (@id, @username, @password, @full_name, @role_id)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, full_name, role_id, password } = req.body;
  try {
    const pool = await poolPromise;
    let query = `
      UPDATE Users 
      SET username = @username, full_name = @full_name, role_id = @role_id
    `;
    if (password) {
      query += `, password_hash = @password`;
    }
    query += ` WHERE id = @id`;

    const request = pool.request()
      .input('id', sql.NVarChar, id)
      .input('username', sql.NVarChar, username)
      .input('full_name', sql.NVarChar, full_name)
      .input('role_id', sql.NVarChar, role_id);
    
    if (password) {
      request.input('password', sql.NVarChar, password);
    }

    await request.query(query);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, id).query('DELETE FROM Users WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ROLE MANAGEMENT ────────────────────────────────────────
app.get('/api/roles', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Roles');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/roles', async (req, res) => {
  const { name, menu_permissions, is_admin } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, `role-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('permissions', sql.NVarChar, menu_permissions)
      .input('is_admin', sql.Bit, is_admin ? 1 : 0)
      .query(`
        INSERT INTO Roles (id, name, menu_permissions, is_admin)
        VALUES (@id, @name, @permissions, @is_admin)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/roles/:id', async (req, res) => {
  const { id } = req.params;
  const { name, menu_permissions, is_admin } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('permissions', sql.NVarChar, menu_permissions)
      .input('is_admin', sql.Bit, is_admin ? 1 : 0)
      .query(`
        UPDATE Roles 
        SET name = @name, menu_permissions = @permissions, is_admin = @is_admin
        WHERE id = @id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/roles/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    // Check if role is used by any user
    const check = await pool.request().input('role_id', sql.NVarChar, id).query('SELECT COUNT(*) as count FROM Users WHERE role_id = @role_id');
    if (check.recordset[0].count > 0) {
      return res.status(400).json({ error: 'Cannot delete role that is assigned to users' });
    }
    await pool.request().input('id', sql.NVarChar, id).query('DELETE FROM Roles WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NOTIFICATION SETTINGS ────────────────────────────────────
app.get('/api/assistant-keywords', async (req, res) => {
  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;

    const result = await pool.request().query(`
      SELECT * FROM AssistantKeywords
      ORDER BY keyword ASC, created_at DESC
    `);

    res.json(result.recordset.map((row) => ({
      ...row,
      target_host: sanitizeKeywordTargetHost(row.target_host),
      parameter_keys: parseKeywordParameterKeys(row.parameter_keys)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assistant-keywords', async (req, res) => {
  const {
    keyword, description, action_type, target_host, script_text,
    parameter_keys, requires_admin, requires_confirmation, is_enabled
  } = req.body;

  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;
    if (!keyword?.trim() || !script_text?.trim() || !['query', 'procedure', 'workflow'].includes(action_type)) {
      return res.status(400).json({ error: 'Keyword, action type, and script are required.' });
    }

    await pool.request()
      .input('id', sql.NVarChar, `keyword-${Date.now()}`)
      .input('keyword', sql.NVarChar, keyword?.trim())
      .input('description', sql.NVarChar, description?.trim() || '')
      .input('action_type', sql.NVarChar, action_type)
      .input('target_host', sql.NVarChar, sanitizeKeywordTargetHost(target_host))
      .input('script_text', sql.NVarChar(sql.MAX), script_text || '')
      .input('parameter_keys', sql.NVarChar(sql.MAX), JSON.stringify(parseKeywordParameterKeys(parameter_keys)))
      .input('requires_admin', sql.Bit, requires_admin ? 1 : 0)
      .input('requires_confirmation', sql.Bit, requires_confirmation ? 1 : 0)
      .input('is_enabled', sql.Bit, is_enabled === false ? 0 : 1)
      .query(`
        INSERT INTO AssistantKeywords (
          id, keyword, description, action_type, target_host, script_text,
          parameter_keys, requires_admin, requires_confirmation, is_enabled
        )
        VALUES (
          @id, @keyword, @description, @action_type, @target_host, @script_text,
          @parameter_keys, @requires_admin, @requires_confirmation, @is_enabled
        )
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/assistant-keywords/:id', async (req, res) => {
  const {
    keyword, description, action_type, target_host, script_text,
    parameter_keys, requires_admin, requires_confirmation, is_enabled
  } = req.body;

  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;
    if (!keyword?.trim() || !script_text?.trim() || !['query', 'procedure', 'workflow'].includes(action_type)) {
      return res.status(400).json({ error: 'Keyword, action type, and script are required.' });
    }

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('keyword', sql.NVarChar, keyword?.trim())
      .input('description', sql.NVarChar, description?.trim() || '')
      .input('action_type', sql.NVarChar, action_type)
      .input('target_host', sql.NVarChar, sanitizeKeywordTargetHost(target_host))
      .input('script_text', sql.NVarChar(sql.MAX), script_text || '')
      .input('parameter_keys', sql.NVarChar(sql.MAX), JSON.stringify(parseKeywordParameterKeys(parameter_keys)))
      .input('requires_admin', sql.Bit, requires_admin ? 1 : 0)
      .input('requires_confirmation', sql.Bit, requires_confirmation ? 1 : 0)
      .input('is_enabled', sql.Bit, is_enabled === false ? 0 : 1)
      .query(`
        UPDATE AssistantKeywords
        SET keyword = @keyword,
            description = @description,
            action_type = @action_type,
            target_host = @target_host,
            script_text = @script_text,
            parameter_keys = @parameter_keys,
            requires_admin = @requires_admin,
            requires_confirmation = @requires_confirmation,
            is_enabled = @is_enabled,
            updated_at = GETDATE()
        WHERE id = @id
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/assistant-keywords/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query(`DELETE FROM AssistantKeywords WHERE id = @id`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assistant-keywords/test', async (req, res) => {
  const { keyword, test_input } = req.body;

  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;

    if (!keyword?.keyword || !keyword?.action_type || !keyword?.script_text) {
      return res.status(400).json({ error: 'Keyword, action type, and script are required for testing.' });
    }

    const runtimeKeyword = {
      ...keyword,
      target_host: sanitizeKeywordTargetHost(keyword.target_host),
      parameter_keys: parseKeywordParameterKeys(keyword.parameter_keys)
    };
    const args = parseAssistantKeywordArgs(test_input || '');

    const result = runtimeKeyword.action_type === 'workflow'
      ? await executeWorkflowKeyword(pool, runtimeKeyword, args)
      : await executeKeywordSql(pool, runtimeKeyword, args);

    res.json({
      success: true,
      text: result.text,
      sources: result.sources || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notification-settings', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notification-settings', async (req, res) => {
  const {
    webhook_url, whatsapp_token, whatsapp_target, whatsapp_group,
    alert_offline, alert_deployment_success, alert_deployment_failed,
    offline_timeout_mins
  } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('url', sql.NVarChar, webhook_url || '')
      .input('token', sql.NVarChar, whatsapp_token || '')
      .input('target', sql.NVarChar, whatsapp_target || '')
      .input('group', sql.NVarChar, whatsapp_group || '')
      .input('alert_offline', sql.Bit, alert_offline ? 1 : 0)
      .input('alert_dep_success', sql.Bit, alert_deployment_success ? 1 : 0)
      .input('alert_dep_failed', sql.Bit, alert_deployment_failed ? 1 : 0)
      .input('timeout_mins', sql.Int, offline_timeout_mins || 30)
      .query(`
        IF EXISTS (SELECT 1 FROM NotificationSettings WHERE id = 'global')
          UPDATE NotificationSettings SET
            webhook_url = @url, whatsapp_token = @token, whatsapp_target = @target,
            whatsapp_group = @group, alert_offline = @alert_offline,
            alert_deployment_success = @alert_dep_success,
            alert_deployment_failed = @alert_dep_failed,
            offline_timeout_mins = @timeout_mins
          WHERE id = 'global'
        ELSE
          INSERT INTO NotificationSettings (id, webhook_url, whatsapp_token, whatsapp_target, whatsapp_group, alert_offline, alert_deployment_success, alert_deployment_failed, offline_timeout_mins)
          VALUES ('global', @url, @token, @target, @group, @alert_offline, @alert_dep_success, @alert_dep_failed, @timeout_mins)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/test-notification (Discord/Webhook) ─────────────
const DEFAULT_THEME_SETTINGS = {
  sidebarBg: "#10331f",
  sidebarText: "#d1fae5",
  sidebarAccent: "#f59e0b",
  mainBg: "#0f172a",
  contentText: "#f1f5f9",
  cardBg: "#1e293b",
  primaryBrand: "#3b82f6",
  appLogo: "",
  logoSize: 32,
  appName: "pepinetupdater"
};

app.get('/api/theme', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT TOP 1 * FROM ThemeSettings WHERE id = 'global'");
    const row = result.recordset[0];

    if (!row) {
      return res.json(DEFAULT_THEME_SETTINGS);
    }

    res.json({
      sidebarBg: row.sidebarBg || DEFAULT_THEME_SETTINGS.sidebarBg,
      sidebarText: row.sidebarText || DEFAULT_THEME_SETTINGS.sidebarText,
      sidebarAccent: row.sidebarAccent || DEFAULT_THEME_SETTINGS.sidebarAccent,
      mainBg: row.mainBg || DEFAULT_THEME_SETTINGS.mainBg,
      contentText: row.contentText || DEFAULT_THEME_SETTINGS.contentText,
      cardBg: row.cardBg || DEFAULT_THEME_SETTINGS.cardBg,
      primaryBrand: row.primaryBrand || DEFAULT_THEME_SETTINGS.primaryBrand,
      appLogo: row.appLogo || "",
      logoSize: row.logoSize || DEFAULT_THEME_SETTINGS.logoSize,
      appName: row.appName || DEFAULT_THEME_SETTINGS.appName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/theme', async (req, res) => {
  const theme = {
    ...DEFAULT_THEME_SETTINGS,
    ...(req.body || {}),
    appLogo: req.body?.appLogo || '',
    logoSize: Number(req.body?.logoSize) || DEFAULT_THEME_SETTINGS.logoSize,
    appName: req.body?.appName || DEFAULT_THEME_SETTINGS.appName
  };

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('sidebarBg', sql.NVarChar(20), theme.sidebarBg)
      .input('sidebarText', sql.NVarChar(20), theme.sidebarText)
      .input('sidebarAccent', sql.NVarChar(20), theme.sidebarAccent)
      .input('mainBg', sql.NVarChar(20), theme.mainBg)
      .input('contentText', sql.NVarChar(20), theme.contentText)
      .input('cardBg', sql.NVarChar(20), theme.cardBg)
      .input('primaryBrand', sql.NVarChar(20), theme.primaryBrand)
      .input('appLogo', sql.NVarChar(sql.MAX), theme.appLogo)
      .input('logoSize', sql.Int, theme.logoSize)
      .input('appName', sql.NVarChar(200), theme.appName)
      .query(`
        IF EXISTS (SELECT 1 FROM ThemeSettings WHERE id = 'global')
          UPDATE ThemeSettings SET
            sidebarBg = @sidebarBg,
            sidebarText = @sidebarText,
            sidebarAccent = @sidebarAccent,
            mainBg = @mainBg,
            contentText = @contentText,
            cardBg = @cardBg,
            primaryBrand = @primaryBrand,
            appLogo = @appLogo,
            logoSize = @logoSize,
            appName = @appName,
            updated_at = GETDATE()
          WHERE id = 'global'
        ELSE
          INSERT INTO ThemeSettings (id, sidebarBg, sidebarText, sidebarAccent, mainBg, contentText, cardBg, primaryBrand, appLogo, logoSize, appName)
          VALUES ('global', @sidebarBg, @sidebarText, @sidebarAccent, @mainBg, @contentText, @cardBg, @primaryBrand, @appLogo, @logoSize, @appName)
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/test-notification', async (req, res) => {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];

    if (!settings || !settings.webhook_url) {
      return res.status(400).json({ success: false, error: 'Webhook URL not configured.' });
    }

    const payload = JSON.stringify({
      embeds: [{
        title: '🔔 Test Notification',
        description: 'This is a test notification from **Centaur Deploy**. Your webhook is working correctly!',
        color: 0x10b981,
        timestamp: getISOTimestamp(),
        footer: { text: 'Centaur Deploy Monitoring System' }
      }]
    });

    const url = new URL(settings.webhook_url);
    await new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const request = https.request(options, (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`HTTP ${response.statusCode}`));
      });
      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[TEST-NOTIF] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/test-whatsapp ───────────────────────────────────
app.post('/api/test-whatsapp', async (req, res) => {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];

    if (!settings || !settings.whatsapp_token) {
      return res.status(400).json({ success: false, error: 'WhatsApp token not configured.' });
    }

    const targets = [settings.whatsapp_target, settings.whatsapp_group].filter(Boolean).join(',');
    if (!targets) {
      return res.status(400).json({ success: false, error: 'No WhatsApp target or group configured.' });
    }

    const message = `🔔 *Test Notification*\n\nIni adalah pesan test dari *Centaur Deploy*.\nNotifikasi WhatsApp Anda berfungsi dengan benar!\n\n_${new Date().toLocaleString('id-ID')}_`;
    const payload = JSON.stringify({ token: settings.whatsapp_token, target: targets, message, countryCode: '62' });

    await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.fonnte.com',
        path: '/send',
        method: 'POST',
        headers: {
          'Authorization': settings.whatsapp_token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const request = https.request(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.status === true || response.statusCode < 300) resolve();
            else reject(new Error(parsed.reason || `HTTP ${response.statusCode}`));
          } catch { resolve(); }
        });
      });
      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[TEST-WA] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── SQL TEMPLATES ─────────────────────────────────────────────
app.get('/api/sql/templates', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM SqlTemplates ORDER BY name ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sql/templates', async (req, res) => {
  const { id, name, description, script, created_by } = req.body;
  try {
    const pool = await poolPromise;
    if (id) {
       // Update
       await pool.request()
        .input('id', sql.NVarChar, id)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .query(`UPDATE SqlTemplates SET name=@name, description=@description, script=@script WHERE id=@id`);
       res.json({ success: true, message: 'Template updated' });
    } else {
       // Create
       await pool.request()
        .input('id', sql.NVarChar, `tpl-${Date.now()}`)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .query(`INSERT INTO SqlTemplates (id, name, description, script, created_by) VALUES (@id, @name, @description, @script, @created_by)`);
       res.json({ success: true, message: 'Template created' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sql/templates/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, script } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('script', sql.NVarChar, script)
      .query(`UPDATE SqlTemplates SET name=@name, description=@description, script=@script WHERE id=@id`);
    res.json({ success: true, message: 'Template updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sql/templates/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, req.params.id).query('DELETE FROM SqlTemplates WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alias for older/other parts if needed
app.get('/api/sql-templates', (req, res) => res.redirect('/api/sql/templates'));

// ── REMOTE COMMAND SCRIPTS ──────────────────────────────────────
app.get('/api/remote-commands/scripts', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM RemoteCommandScripts ORDER BY name ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/remote-commands/scripts', async (req, res) => {
  const { id, name, description, script, created_by } = req.body;
  try {
    const pool = await poolPromise;
    if (id) {
       await pool.request()
        .input('id', sql.NVarChar, id)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .query(`UPDATE RemoteCommandScripts SET name=@name, description=@description, script=@script WHERE id=@id`);
       res.json({ success: true, message: 'Script updated' });
    } else {
       await pool.request()
        .input('id', sql.NVarChar, `rcs-${Date.now()}`)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .query(`INSERT INTO RemoteCommandScripts (id, name, description, script, created_by) VALUES (@id, @name, @description, @script, @created_by)`);
       res.json({ success: true, message: 'Script created' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/remote-commands/scripts/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, req.params.id).query('DELETE FROM RemoteCommandScripts WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for remote command execution (DB-based polling — no WinRM needed)
async function executeRemoteCommand(targets, command, res) {
  if (!targets || !command || targets.length === 0) {
    return res.status(400).json({ error: 'Missing targets or command' });
  }

  const exec_id = `exec-${Date.now()}`;
  // Pre-populate logs with 'pending' so frontend shows devices immediately
  const execData = {
    exec_id,
    is_complete: false,
    logs: targets.map(t => ({ hostname: t.hostname, ip: t.ip, status: 'pending', log: '', updated_at: new Date().toISOString() }))
  };
  commandExecutions.set(exec_id, execData);

  try {
    res.json({ success: true, exec_id });

    // Insert pending commands into DB — agent will pick these up on next poll (≤5 min)
    const pool = await poolPromise;
    for (const t of targets) {
      const cmdId = `cmd-${Date.now()}-${t.id}`;
      await pool.request()
        .input('id', sql.NVarChar, cmdId)
        .input('exec_id', sql.NVarChar, exec_id)
        .input('device_id', sql.NVarChar, t.id)
        .input('hostname', sql.NVarChar, t.hostname)
        .input('ip', sql.NVarChar, t.ip)
        .input('command', sql.NVarChar, command)
        .query(`
          INSERT INTO PendingCommands (id, exec_id, device_id, hostname, ip, command, status)
          VALUES (@id, @exec_id, @device_id, @hostname, @ip, @command, 'pending')
        `);
    }

    console.log(`[CMD] Queued ${targets.length} commands for exec_id=${exec_id}. Waiting for agents to poll.`);

    // Auto-cleanup after 30 minutes
    setTimeout(async () => {
      try {
        const p = await poolPromise;
        // Mark any still-pending commands as timed_out
        await p.request()
          .input('exec_id', sql.NVarChar, exec_id)
          .query("UPDATE PendingCommands SET status = 'timed_out' WHERE exec_id = @exec_id AND status = 'pending'");

        // Finalize execData for timed-out entries
        const execD = commandExecutions.get(exec_id);
        if (execD && !execD.is_complete) {
          execD.logs.forEach(l => { if (l.status === 'pending') { l.status = 'failed'; l.log = 'Timed out — agent did not respond within 30 minutes.'; } });
          execD.is_complete = true;
        }
      } catch (e) { /* silent */ }
    }, 30 * 60 * 1000);

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}

app.post('/api/remote-commands/run', async (req, res) => {
  const { device_ids, command, admin_user, admin_pass } = req.body;
  
  try {
    const pool = await poolPromise;
    // 1. Fetch devices to get IPs
    const result = await pool.request().query('SELECT id, hostname, ip FROM Devices');
    const allDevs = result.recordset;
    
    const targets = device_ids.map(id => {
      const dev = allDevs.find(d => d.id === id);
      return dev ? { id: dev.id, hostname: dev.hostname, ip: dev.ip } : null;
    }).filter(t => t !== null);

    if (targets.length === 0) return res.status(400).json({ error: 'No valid devices selected' });

    // 2. Execute directly
    await executeRemoteCommand(targets, command, res);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── AGENT REMOTE COMMANDS ─────────────────────────────────────
const commandExecutions = new Map();

// ── SQL EXPORT & SCHEDULES ────────────────────────────────────
app.post('/api/sql/export', (req, res) => {
  const { results } = req.body;
  if (!results) return res.status(400).json({ error: 'No results to export' });

  // Simple CSV generation
  let csv = "Device ID,Hostname,IP,Status,Log/Error,Recordset JSON\n";
  for (const [did, data] of Object.entries(results)) {
    const row = [
      did,
      data.hostname || "",
      data.ip || "",
      data.status || "",
      (data.error || "").replace(/,/g, ";"),
      JSON.stringify(data.recordset || []).replace(/,/g, ";")
    ].join(",");
    csv += row + "\n";
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sql_export.csv');
  res.send(csv);
});

app.post('/api/sql/schedules', async (req, res) => {
  const { name, script, target_device_ids, next_run_at } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, `sqls-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('script', sql.NVarChar, script)
      .input('targets', sql.NVarChar, JSON.stringify(target_device_ids))
      .input('next_run', sql.DateTime, new Date(next_run_at))
      .query(`INSERT INTO RemoteSqlSchedules (id, name, script, target_device_ids, next_run_at) VALUES (@id, @name, @script, @targets, @next_run)`);
    res.json({ success: true, message: 'SQL Job scheduled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/remote-commands/schedules', async (req, res) => {
  const { name, script, target_device_ids, next_run_at } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, `rcs-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('script', sql.NVarChar, script)
      .input('targets', sql.NVarChar, JSON.stringify(target_device_ids))
      .input('next_run', sql.DateTime, new Date(next_run_at))
      .query(`INSERT INTO RemoteCommandSchedules (id, name, script, target_device_ids, next_run_at) VALUES (@id, @name, @script, @targets, @next_run)`);
    res.json({ success: true, message: 'Command Job scheduled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remote pool manager to reuse connections
const remotePoolManager = {
  _pools: new Map(),
  async getPool(deviceId, config) {
    if (!this._pools.has(deviceId)) {
      const pool = new sql.ConnectionPool(config);
      await pool.connect();
      this._pools.set(deviceId, pool);
    }
    return this._pools.get(deviceId);
  }
};

app.post('/api/agent/commands/execute', async (req, res) => {
  const { targets, command } = req.body;
  await executeRemoteCommand(targets, command, res);
});

app.get('/api/agent/commands/results', (req, res) => {
  const { exec_id } = req.query;
  const data = commandExecutions.get(exec_id);
  if (!data) return res.status(404).json({ error: 'Exec ID not found' });
  res.json(data);
});

// ── OFFLINE DETECTOR (Background Loop) ──────────────────────

async function sendWebhook(title, description, color = 0x5865F2) {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.webhook_url) return;

    const payload = JSON.stringify({
      embeds: [{ title, description, color, timestamp: getISOTimestamp() }]
    });
    const url = new URL(settings.webhook_url);
    const options = {
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options);
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
  }
}

async function sendWhatsapp(message) {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.whatsapp_token) return;

    const targets = [settings.whatsapp_target, settings.whatsapp_group].filter(Boolean).join(',');
    if (!targets) return;

    const payload = JSON.stringify({ token: settings.whatsapp_token, target: targets, message, countryCode: '62' });
    const options = {
      hostname: 'api.fonnte.com', path: '/send', method: 'POST',
      headers: { 'Authorization': settings.whatsapp_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options);
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('[WHATSAPP] Error:', err.message);
  }
}

async function runOfflineDetector() {
  try {
    const pool = await poolPromise;
    if (!pool) return;

    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.alert_offline) return;

    const timeoutMins = settings.offline_timeout_mins || 30;

    // Ensure last_offline_alert_at column exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Devices' AND COLUMN_NAME='last_offline_alert_at')
        ALTER TABLE Devices ADD last_offline_alert_at DATETIME NULL
    `).catch(() => {});

    // 1. Get all Online devices to verify their status
    const devicesToCheckRes = await pool.request().query("SELECT id, hostname, ip, last_seen, last_offline_alert_at FROM Devices WHERE status = 'online'");
    const devicesToCheck = devicesToCheckRes.recordset || [];
    
    let newlyOffline = [];

    // 2. Perform Ping-Check and Heartbeat-Check (Sequential/Batch to avoid shell spam)
    for (const dev of devicesToCheck) {
      let isHeartbeatStale = false;
      const now = new Date();
      if (dev.last_seen) {
        const lastSeenDate = new Date(dev.last_seen);
        const diffMins = (now - lastSeenDate) / (1000 * 60);
        if (diffMins > timeoutMins) isHeartbeatStale = true;
      } else {
        isHeartbeatStale = true;
      }

      // Proactive Ping Check (Only if heartbeat is stale)
      let isPingFailing = false;
      if (isHeartbeatStale && dev.ip && dev.ip !== 'Unknown' && dev.ip !== '127.0.0.1' && !dev.ip.startsWith('169.')) {
        try {
          // Use -n 1 (one ping) and -w 1000 (standard timeout)
          const { stdout } = await execPromise(`ping -n 1 -w 1000 ${dev.ip}`);
          if (!stdout.includes("TTL=")) isPingFailing = true;
        } catch (e) {
          isPingFailing = true;
        }
      }


      if (isHeartbeatStale || isPingFailing) {
        if (!dev.last_offline_alert_at) {
          newlyOffline.push({ ...dev, alertNeeded: true, reason: isHeartbeatStale ? "Heartbeat Timeout" : "Ping Failed" });
        }
      }
      
      // Small pause to prevent terminal spamming
      await new Promise(resolve => setTimeout(resolve, 50)); 
    }

    // 3. Mark newly offline devices in DB
    for (const dev of newlyOffline) {
      await pool.request().input('id', sql.NVarChar, dev.id)
        .query("UPDATE Devices SET status = 'offline', last_offline_alert_at = GETDATE() WHERE id = @id");
      
      const ts = getCurrentTimeHHMM();
      await pool.request()
        .input('time', sql.NVarChar, ts).input('user', sql.NVarChar, 'system')
        .input('action', sql.NVarChar, `⚠️ Device offline (${dev.reason}): ${dev.hostname} (${dev.ip})`)
        .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @user, @action)")
        .catch(() => {});
    }

    // 4. Recovery Detection: Find devices that were offline but are now responding
    const recoveredRes = await pool.request().input('timeout', sql.Int, timeoutMins).query(`
      SELECT id, hostname, ip, last_offline_alert_at 
      FROM Devices 
      WHERE (status = 'offline' OR last_offline_alert_at IS NOT NULL)
        AND last_seen IS NOT NULL 
        AND ISDATE(last_seen) = 1
        AND DATEDIFF(MINUTE, CAST(last_seen AS DATETIME2), GETDATE()) <= @timeout
    `);
    
    const recovered = recoveredRes.recordset || [];
    if (recovered.length > 0) {
      let recoveryWA = `✅ *NET RECOVERY: ${recovered.length} DEVICES ONLINE*\n`;
      const now = new Date();
      
      for (const dev of recovered) {
        let durationStr = "";
        if (dev.last_offline_alert_at) {
          const diffMs = now - new Date(dev.last_offline_alert_at);
          const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          durationStr = ` (Down: ${diffHrs}h ${diffMins}m)`;
        }

        recoveryWA += `- *${dev.hostname}* (${dev.ip})${durationStr}\n`;
        
        await pool.request().input('id', sql.NVarChar, dev.id)
          .query("UPDATE Devices SET status = 'online', last_offline_alert_at = NULL WHERE id = @id");
        
        const ts = getCurrentTimeHHMM();
        await pool.request()
          .input('time', sql.NVarChar, ts).input('user', sql.NVarChar, 'system')
          .input('action', sql.NVarChar, `✅ Device recovered: ${dev.hostname} (${dev.ip})`)
          .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @user, @action)")
          .catch(() => {});
      }

      console.log(`[NOTIF] Sending recovery summary for ${recovered.length} devices.`);
      await sendWebhook(`✅ Network Recovery Report`, recoveryWA.replace(/\*/g, '**'), 0x22c55e);
      await sendWhatsapp(recoveryWA);
    }

    // 5. Send Notification if we caught NEW offline devices
    if (newlyOffline.length > 0) {
      // Fetch ALL currently offline devices to provide full context (the "7 devices" requested)
      const allOfflineRes = await pool.request().query("SELECT hostname, ip, last_seen FROM Devices WHERE status = 'offline'");
      const allOffline = allOfflineRes.recordset || [];

      let summaryWA = `🚨 *NETWORK ALERT: ${newlyOffline.length} NEW OFFLINE*\n`;
      summaryWA += `Total currently offline: *${allOffline.length} devices*\n\n`;
      
      summaryWA += `*Detected Just Now:*\n`;
      newlyOffline.forEach(d => {
        summaryWA += `- *${d.hostname}* (${d.ip}) | ${d.reason}\n`;
      });

      if (allOffline.length > newlyOffline.length) {
        summaryWA += `\n*Also Currently Offline:*\n`;
        const others = allOffline.filter(a => !newlyOffline.find(n => n.hostname === a.hostname));
        others.slice(0, 10).forEach(d => {
          summaryWA += `- ${d.hostname} (${d.ip})\n`;
        });
        if (others.length > 10) summaryWA += `...and ${others.length - 10} more.`;
      }

      const summaryDiscord = summaryWA.replace(/\*/g, '**');

      console.log(`[NOTIF] Sending summary alert for ${allOffline.length} total offline devices.`);
      await sendWebhook(`🚨 Network Connectivity Report`, summaryDiscord, 0xef4444);
      await sendWhatsapp(summaryWA);
    }
  } catch (err) {
    console.error('⚠️ Offline detector error:', err.message);
  }
}

app.get('/api/devices/offline-summary', async (req, res) => {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT offline_timeout_mins FROM NotificationSettings WHERE id = 'global'");
    const timeoutMins = settingsRes.recordset[0]?.offline_timeout_mins || 30;
    const result = await pool.request()
      .input('timeout', sql.Int, timeoutMins)
      .query(`
        SELECT id, hostname, ip, last_seen, status,
          DATEDIFF(MINUTE, CAST(last_seen AS DATETIME2), GETDATE()) AS minutes_since_seen
        FROM Devices WHERE last_seen IS NOT NULL AND ISDATE(last_seen) = 1
        ORDER BY minutes_since_seen DESC
      `);
    res.json(result.recordset.map(d => ({ ...d, is_offline: d.minutes_since_seen > timeoutMins })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── WEEKLY REPORT PDF GENERATOR ───────────────────────────────
async function generateWeeklyReportPDF() {
  console.log('[REPORT] V2 - Generating Automated Weekly Report PDF...');
  try {
    const pool = await poolPromise;
    if (!pool) return;

    // 1. Gather Stats
    const totalDevices = (await pool.request().query("SELECT COUNT(*) as count FROM Devices")).recordset[0].count;
    const offlineDevices = (await pool.request().query("SELECT COUNT(*) as count FROM Devices WHERE status = 'offline'")).recordset[0].count;
    const uptime = totalDevices > 0 ? (((totalDevices - offlineDevices) / totalDevices) * 100).toFixed(1) : 0;
    
    // Top problematic devices (from ActivityLog)
    const problematicRes = await pool.request().query(`
      SELECT TOP 5 action, COUNT(*) as fail_count 
      FROM ActivityLog 
      WHERE action LIKE '%offline%'
      GROUP BY action ORDER BY fail_count DESC
    `);

    // 2. Create PDF
    const reportsDir = path.join(__dirname, 'reports', 'weekly');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    
    const fileName = `weekly-report-${new Date().toISOString().split('T')[0]}.pdf`;
    const filePath = path.join(reportsDir, fileName);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('NETWORK WEEKLY SUMMARY', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Stats Section
    doc.fontSize(16).fillColor('#3b82f6').font('Helvetica-Bold').text('System Health Overview');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#000000').font('Helvetica');
    doc.text(`• Overall Uptime: ${uptime}%`);
    doc.text(`• Total Monitored Devices: ${totalDevices}`);
    doc.text(`• Currently Offline: ${offlineDevices}`);
    doc.moveDown();

    // Problematic Stores
    if (problematicRes.recordset.length > 0) {
      doc.fontSize(16).fillColor('#ef4444').font('Helvetica-Bold').text('Top 5 Problematic Assets (Last 7 Days)');
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#000000').font('Helvetica');
      problematicRes.recordset.forEach((row, i) => {
        doc.text(`${i + 1}. ${row.action.split(':')[1]?.trim() || row.action} (${row.fail_count} incidents)`);
      });
    }

    doc.end();

    stream.on('finish', async () => {
      console.log(`[REPORT] Weekly PDF saved: ${filePath}`);
      const summary = `📊 *WEEKLY SYSTEM REPORT IS READY*\n` +
                      `Period: Last 7 Days\n` +
                      `Avg Uptime: *${uptime}%*\n` +
                      `Total Devices: ${totalDevices}\n` +
                      `Critical Incidents: ${problematicRes.recordset.length}\n\n` +
                      `_Weekly PDF has been archived on the server._`;
      
      await sendWebhook(`📊 Weekly Performance Report`, summary.replace(/\*/g, '**'), 0x3b82f6);
      await sendWhatsapp(summary);
    });
  } catch (err) {
    console.error('⚠️ Weekly report error:', err.message);
  }
}

// Schedule Cron: Every Sunday at 00:00
cron.schedule('0 0 * * 0', () => {
    generateWeeklyReportPDF();
});

// Manual trigger API (for testing)
app.post('/api/reports/trigger-weekly', async (req, res) => {
    await generateWeeklyReportPDF();
    res.json({ message: "Weekly report generation triggered." });
});

// Serve Weekly Reports Folder
app.use('/reports/weekly', express.static(path.join(__dirname, 'reports', 'weekly')));

// ── WORKFLOW KNOWLEDGE BASE ──────────────────────────────────
app.get('/api/workflows', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT id, title, category, file_name, created_by, created_at, updated_at FROM Workflows ORDER BY category, title");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categories for UI filtering
app.get('/api/workflows/categories', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT DISTINCT category FROM Workflows WHERE category IS NOT NULL ORDER BY category");
    res.json(result.recordset.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific workflow details
app.get('/api/workflows/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query("SELECT * FROM Workflows WHERE id = @id");
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.status(404).json({ error: "Workflow not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download Workflow File
app.get('/api/workflows/:id/download', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.NVarChar, req.params.id).query("SELECT file_name, file_path FROM Workflows WHERE id = @id");
    if (!result.recordset[0] || !result.recordset[0].file_path) return res.status(404).send('File not found');
    
    const filePath = path.resolve(result.recordset[0].file_path);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found on disk');
    
    res.download(filePath, result.recordset[0].file_name);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/api/workflows/upload', workflowUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  try {
    let extractedText = "";
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: req.file.path });
      extractedText = result.value;
    } else if (ext === '.txt') {
      extractedText = fs.readFileSync(req.file.path, 'utf8');
    } else if (ext === '.pdf') {
       // PDF parsing would need another lib, for now just note it
       extractedText = "PDF Uploaded. (Text extraction for PDF not yet implemented)";
    } else {
      extractedText = `File ${req.file.originalname} uploaded, but auto-text extraction is not supported for this format.`;
    }
    
    res.json({ 
      text: extractedText, 
      fileName: req.file.originalname, 
      filePath: req.file.path.replace(/\\/g, '/') 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to parse file: " + err.message });
  }
});

app.post('/api/workflows', async (req, res) => {
  const { id, title, content, category, created_by, fileName, filePath, userId: bodyUid } = req.body;
  const uid = req.headers['x-user-id'] || bodyUid;

  try {
    const pool = await poolPromise;
    // Admin Check
    const userRes = await pool.request().input('uid', sql.NVarChar, uid).query("SELECT r.is_admin FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid");
    if (!userRes.recordset[0]?.is_admin) return res.status(403).json({ error: "Only admins can create instructions" });

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content)
      .input('category', sql.NVarChar, category)
      .input('fname', sql.NVarChar, fileName || null)
      .input('fpath', sql.NVarChar, filePath || null)
      .input('created_by', sql.NVarChar, created_by)
      .query(`
        INSERT INTO Workflows (id, title, content, category, file_name, file_path, created_by, created_at, updated_at)
        VALUES (@id, @title, @content, @category, @fname, @fpath, @created_by, GETDATE(), GETDATE())
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/workflows/:id', async (req, res) => {
  const { title, content, category, fileName, filePath, userId: bodyUid } = req.body;
  const uid = req.headers['x-user-id'] || bodyUid;

  try {
    const pool = await poolPromise;
    // Admin Check
    const userRes = await pool.request().input('uid', sql.NVarChar, uid).query("SELECT r.is_admin FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid");
    if (!userRes.recordset[0]?.is_admin) return res.status(403).json({ error: "Only admins can edit instructions" });

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content)
      .input('category', sql.NVarChar, category)
      .input('fname', sql.NVarChar, fileName || null)
      .input('fpath', sql.NVarChar, filePath || null)
      .query(`
        UPDATE Workflows 
        SET title = @title, content = @content, category = @category, 
            file_name = COALESCE(@fname, file_name), 
            file_path = COALESCE(@fpath, file_path),
            updated_at = GETDATE()
        WHERE id = @id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query("DELETE FROM Workflows WHERE id = @id");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI SMART ASSISTANT (Groq Llama) ──────────────────────────
function normalizeAssistantKeywordText(value = '') {
  return value.toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

const ASSISTANT_RESERVED_ARGS = ['host', 'hostname', 'target_host', 'confirm'];
const ASSISTANT_TARGET_HOST_PLACEHOLDER = 'isi host tetap, atau kosongkan lalu pakai host=HOST01 saat runtime';

function parseAssistantKeywordArgs(input = '') {
  const args = {};
  let remaining = input;
  const regex = /(\w+)=("([^"]*)"|'([^']*)'|[^\s]+)/g;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const key = match[1];
    const value = match[3] ?? match[4] ?? match[2] ?? '';
    args[key] = value.replace(/^['"]|['"]$/g, '');
    remaining = remaining.replace(match[0], ' ');
  }

  const freeText = remaining.trim().replace(/\s+/g, ' ');
  if (freeText && !args.query) {
    args.query = freeText;
  }

  return args;
}

function parseKeywordParameterKeys(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => item?.toString().trim()).filter((item) => item && !ASSISTANT_RESERVED_ARGS.includes(item.toLowerCase())))];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.map((item) => item?.toString().trim()).filter((item) => item && !ASSISTANT_RESERVED_ARGS.includes(item.toLowerCase())))]
      : [];
  } catch {
    return [];
  }
}

function sanitizeKeywordTargetHost(value) {
  const normalized = (value || '').toString().trim();
  if (!normalized) return '';
  if (normalized.toLowerCase() === ASSISTANT_TARGET_HOST_PLACEHOLDER.toLowerCase()) return '';
  return normalized;
}

function buildMissingParameterPrompt(keyword, missingParameters, args = {}) {
  const examples = missingParameters.map((key) => `${key}=...`).join(' ');
  const hostHint = !sanitizeKeywordTargetHost(keyword.target_host) && !args.host && !args.hostname && !args.target_host
    ? '\nJika keyword ini memakai database host tertentu, tambahkan juga `host=HOSTNAME` atau `hostname=HOSTNAME`.'
    : '';

  return `Keyword \`${keyword.keyword}\` membutuhkan parameter berikut: ${missingParameters.join(', ')}.\n\nSilakan kirim ulang dengan format seperti:\n\`${keyword.keyword} ${examples}\`${hostHint}`;
}

function applyKeywordParameters(request, args, parameterKeys) {
  parameterKeys.forEach((key) => {
    const rawValue = args[key];
    if (rawValue === undefined) return;

    if (/^(true|false)$/i.test(rawValue)) {
      request.input(key, sql.Bit, /^true$/i.test(rawValue) ? 1 : 0);
      return;
    }

    if (/^-?\d+$/.test(rawValue)) {
      request.input(key, sql.Int, parseInt(rawValue, 10));
      return;
    }

    if (/^-?\d+\.\d+$/.test(rawValue)) {
      request.input(key, sql.Float, parseFloat(rawValue));
      return;
    }

    request.input(key, sql.NVarChar, rawValue);
  });
}

function formatKeywordRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "Tidak ada data ditemukan untuk keyword ini.";
  }

  const sampleRows = rows.slice(0, 10);
  const columns = Object.keys(sampleRows[0] || {}).slice(0, 6);
  if (columns.length === 0) {
    return `Keyword berhasil dijalankan. Total ${rows.length} baris ditemukan.`;
  }

  const header = `| ${columns.join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = sampleRows.map((row) => `| ${columns.map((column) => String(row[column] ?? '-').replace(/\|/g, '\\|')).join(' | ')} |`);
  const note = rows.length > sampleRows.length ? `\n\nMenampilkan ${sampleRows.length} dari ${rows.length} baris.` : `\n\nTotal ${rows.length} baris.`;
  return [header, separator, ...body].join('\n') + note;
}

async function executeKeywordSql(pool, keyword, args) {
  const parameterKeys = parseKeywordParameterKeys(keyword.parameter_keys);
  const missingParameters = parameterKeys.filter((key) => args[key] === undefined);
  if (missingParameters.length > 0) {
    return {
      handled: true,
      text: buildMissingParameterPrompt(keyword, missingParameters, args),
      sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Missing required parameters' }]
    };
  }

  const isReadOnly = keyword.action_type === 'query'
    ? /^\s*select\b/i.test(keyword.script_text) && !/\b(delete|update|drop|truncate|alter|insert|merge|exec)\b/i.test(keyword.script_text)
    : true;

  if (keyword.action_type === 'query' && !isReadOnly) {
    return {
      handled: true,
      text: `Keyword \`${keyword.keyword}\` ditolak karena script query tidak terbaca sebagai SELECT read-only.`,
      sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Rejected non read-only query' }]
    };
  }

  const buildRequest = (request) => {
    applyKeywordParameters(request, args, parameterKeys);
    return request;
  };

  const runtimeHost = (args.target_host || args.hostname || args.host || '').toString().trim();
  const resolvedTargetHost = sanitizeKeywordTargetHost(keyword.target_host || runtimeHost || '');

  if (resolvedTargetHost) {
    const hostRes = await pool.request()
      .input('name', sql.NVarChar, resolvedTargetHost)
      .query("SELECT id, ip FROM Devices WHERE hostname = @name");
    const target = hostRes.recordset[0];
    if (!target) {
      return {
        handled: true,
        text: `Target host \`${resolvedTargetHost}\` untuk keyword \`${keyword.keyword}\` tidak ditemukan.`,
        sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Target host not found' }]
      };
    }

    const connRes = await pool.request()
      .input('did', sql.NVarChar, target.id)
      .query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
    const conn = connRes.recordset[0];
    if (!conn) {
      return {
        handled: true,
        text: `Kredensial database untuk host \`${resolvedTargetHost}\` belum dikonfigurasi.`,
        sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Missing remote DB credentials' }]
      };
    }

    const config = {
      user: conn.db_user,
      password: conn.db_password,
      server: target.ip,
      database: conn.db_name,
      options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
      pool: { max: 1, min: 0 }
    };
    const remotePool = await remotePoolManager.getPool(target.id, config);
    const result = await buildRequest(remotePool.request()).query(keyword.script_text);

    return {
      handled: true,
      text: keyword.action_type === 'procedure'
        ? `Procedure keyword \`${keyword.keyword}\` berhasil dijalankan pada host \`${resolvedTargetHost}\`.\n\n${formatKeywordRows(result.recordset || [])}`
        : formatKeywordRows(result.recordset || []),
      sources: [{ type: keyword.action_type, label: resolvedTargetHost, detail: `${keyword.action_type} keyword` }]
    };
  }

  const result = await buildRequest(pool.request()).query(keyword.script_text);
  return {
    handled: true,
    text: keyword.action_type === 'procedure'
      ? `Procedure keyword \`${keyword.keyword}\` berhasil dijalankan.\n\n${formatKeywordRows(result.recordset || [])}`
      : formatKeywordRows(result.recordset || []),
    sources: [{ type: keyword.action_type, label: keyword.keyword, detail: 'Local database keyword' }]
  };
}

async function executeWorkflowKeyword(pool, keyword, args) {
  const searchTerm = args.query || keyword.script_text;
  if (!searchTerm) {
    return {
      handled: true,
      text: `Keyword workflow \`${keyword.keyword}\` belum punya target pencarian.`,
      sources: [{ type: 'workflow', label: keyword.keyword, detail: 'Missing workflow target' }]
    };
  }

  if (searchTerm.startsWith('id:')) {
    const workflowId = searchTerm.slice(3).trim();
    const result = await pool.request()
      .input('id', sql.NVarChar, workflowId)
      .query("SELECT title, content FROM Workflows WHERE id = @id");
    if (!result.recordset[0]) {
      return {
        handled: true,
        text: `Workflow dengan id \`${workflowId}\` tidak ditemukan.`,
        sources: [{ type: 'workflow', label: keyword.keyword, detail: 'Workflow not found' }]
      };
    }

    return {
      handled: true,
      text: `### ${result.recordset[0].title}\n\n${result.recordset[0].content}`,
      sources: [{ type: 'workflow', label: result.recordset[0].title, detail: 'Knowledge base article' }]
    };
  }

  const result = await pool.request()
    .input('q', sql.NVarChar, `%${searchTerm}%`)
    .query("SELECT TOP 10 id, title, category FROM Workflows WHERE title LIKE @q OR category LIKE @q OR content LIKE @q");

  if (!result.recordset.length) {
    return {
      handled: true,
      text: `Tidak ada workflow yang cocok untuk keyword \`${keyword.keyword}\` dengan pencarian \`${searchTerm}\`.`,
      sources: [{ type: 'workflow', label: keyword.keyword, detail: 'No workflow match' }]
    };
  }

  return {
    handled: true,
    text: `Saya menemukan ${result.recordset.length} workflow untuk keyword \`${keyword.keyword}\`:\n\n${formatKeywordRows(result.recordset)}`,
    sources: [{ type: 'workflow', label: keyword.keyword, detail: `${result.recordset.length} workflow match(es)` }]
  };
}

function formatKeywordHelpList(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return "Belum ada keyword assistant yang aktif.";
  }

  const lines = keywords.map((keyword) => {
    const params = parseKeywordParameterKeys(keyword.parameter_keys);
    const hostMode = sanitizeKeywordTargetHost(keyword.target_host) ? `host tetap: ${sanitizeKeywordTargetHost(keyword.target_host)}` : 'host dinamis: pakai host=HOSTNAME';
    const paramLabel = params.length > 0 ? ` | params: ${params.join(', ')}` : '';
    const flags = [
      keyword.requires_admin ? 'admin' : null,
      keyword.requires_confirmation ? 'confirm=yes' : null,
    ].filter(Boolean).join(', ');

    return `- \`${keyword.keyword}\` (${keyword.action_type})${paramLabel} | ${hostMode}${flags ? ` | ${flags}` : ''}\n  ${keyword.description || 'Tanpa deskripsi.'}`;
  });

  return `Berikut keyword yang tersedia:\n\n${lines.join('\n\n')}\n\nKetik \`help nama-keyword\` untuk melihat detail satu keyword.`;
}

function formatKeywordHelpDetail(keyword) {
  const params = parseKeywordParameterKeys(keyword.parameter_keys);
  const hostMode = sanitizeKeywordTargetHost(keyword.target_host) ? `Host tetap: \`${sanitizeKeywordTargetHost(keyword.target_host)}\`` : 'Host dinamis: gunakan `host=HOSTNAME` atau `hostname=HOSTNAME` saat runtime.';
  const exampleArgs = [];

  if (!sanitizeKeywordTargetHost(keyword.target_host)) {
    exampleArgs.push('host=HOSTNAME');
  }
  params.forEach((param) => exampleArgs.push(`${param}=...`));
  if (keyword.requires_confirmation) {
    exampleArgs.push('confirm=yes');
  }

  return [
    `Keyword: \`${keyword.keyword}\``,
    `Tipe: ${keyword.action_type}`,
    keyword.description ? `Deskripsi: ${keyword.description}` : null,
    hostMode,
    params.length > 0 ? `Parameter SQL: ${params.join(', ')}` : 'Parameter SQL: tidak ada',
    keyword.requires_admin ? 'Akses: admin only' : 'Akses: sesuai izin assistant',
    keyword.requires_confirmation ? 'Konfirmasi: wajib `confirm=yes`' : 'Konfirmasi: tidak wajib',
    '',
    'Contoh pakai:',
    `\`${keyword.keyword}${exampleArgs.length ? ` ${exampleArgs.join(' ')}` : ''}\``,
  ].filter(Boolean).join('\n');
}

async function resolveAssistantKeyword(pool, currUser, prompt) {
  const normalizedPrompt = normalizeAssistantKeywordText(prompt);
  const result = await pool.request().query("SELECT * FROM AssistantKeywords WHERE is_enabled = 1");
  const enabledKeywords = result.recordset || [];

  if (normalizedPrompt === 'help' || normalizedPrompt === 'help keyword' || normalizedPrompt === 'help keywords') {
    return {
      handled: true,
      text: formatKeywordHelpList(enabledKeywords),
      sources: [{ type: 'keyword-help', label: 'Assistant Keywords', detail: `${enabledKeywords.length} keyword aktif` }]
    };
  }

  if (normalizedPrompt.startsWith('help ')) {
    const requestedKeyword = normalizedPrompt.slice(5).trim();
    const helpKeyword = enabledKeywords.find((row) => normalizeAssistantKeywordText(row.keyword) === requestedKeyword);
    if (helpKeyword) {
      return {
        handled: true,
        text: formatKeywordHelpDetail(helpKeyword),
        sources: [{ type: 'keyword-help', label: helpKeyword.keyword, detail: 'Keyword detail' }]
      };
    }
  }

  const matchedKeyword = enabledKeywords
    .sort((a, b) => normalizeAssistantKeywordText(b.keyword).length - normalizeAssistantKeywordText(a.keyword).length)
    .find((row) => {
      const normalizedKeyword = normalizeAssistantKeywordText(row.keyword);
      return normalizedPrompt === normalizedKeyword || normalizedPrompt.startsWith(`${normalizedKeyword} `);
    });

  if (!matchedKeyword) {
    return null;
  }

  if (matchedKeyword.action_type === 'procedure' && !currUser.is_admin) {
    return {
      handled: true,
      text: `Keyword procedure \`${matchedKeyword.keyword}\` hanya boleh dijalankan oleh administrator.`,
      sources: [{ type: 'keyword', label: matchedKeyword.keyword, detail: 'Admin only procedure keyword' }]
    };
  }

  if (matchedKeyword.requires_admin && !currUser.is_admin) {
    return {
      handled: true,
      text: `Keyword \`${matchedKeyword.keyword}\` hanya boleh dijalankan oleh administrator.`,
      sources: [{ type: 'keyword', label: matchedKeyword.keyword, detail: 'Admin only keyword' }]
    };
  }

  const keywordText = matchedKeyword.keyword.trim();
  const remainder = prompt.trim().slice(keywordText.length).trim();
  const args = parseAssistantKeywordArgs(remainder);

  if (matchedKeyword.requires_confirmation && args.confirm !== 'yes') {
    return {
      handled: true,
      text: `Keyword \`${matchedKeyword.keyword}\` membutuhkan konfirmasi sebelum dieksekusi. Kirim ulang dengan format:\n\n\`${prompt.trim()} confirm=yes\``,
      sources: [{ type: 'keyword', label: matchedKeyword.keyword, detail: 'Confirmation required' }]
    };
  }

  if (matchedKeyword.action_type === 'workflow') {
    return executeWorkflowKeyword(pool, matchedKeyword, args);
  }

  return executeKeywordSql(pool, matchedKeyword, args);
}

const ASSISTANT_COOLDOWN_MS = 3000;
const assistantRequestTimes = new Map();

app.post('/api/chat', async (req, res) => {
  let { userId, prompt, history, user: bodyUser } = req.body;
  const headerUserId = req.headers['x-user-id'];

  if (!userId && bodyUser && bodyUser.id) userId = bodyUser.id;
  if (!userId && typeof headerUserId === 'string') userId = headerUserId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: Missing user identity." });
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  prompt = prompt.trim();
  history = Array.isArray(history) ? history : [];

  try {
    const pool = await poolPromise;
    const userRes = await pool.request()
      .input('uid', sql.NVarChar, userId)
      .query(`
        SELECT u.id, u.username, r.is_admin, r.menu_permissions 
        FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid

      `);

    const currUser = userRes.recordset[0];
    if (!currUser) return res.status(401).json({ error: "Unauthorized: User not found." });

    const perms = currUser.menu_permissions || "[]";
    const hasAssistantAccess = currUser.is_admin || perms === "*" || perms.includes("assistant");
    if (!hasAssistantAccess) {
      return res.status(403).json({ error: "Access Denied: You do not have permission to use the AI Assistant." });
    }

    const keywordResult = await resolveAssistantKeyword(pool, currUser, prompt);
    if (keywordResult?.handled) {
      await pool.request()
        .input('time', sql.NVarChar, new Date().toLocaleString())
        .input('u', sql.NVarChar, currUser.username || userId)
        .input('act', sql.NVarChar, `AI Keyword: ${prompt.substring(0, 180)}`)
        .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @u, @act)");

      return res.json({
        text: keywordResult.text,
        sources: keywordResult.sources || [],
        meta: {
          toolsUsed: ['assistant-keyword']
        }
      });
    }

    // Apply cooldown per user so one busy operator does not block everyone else.
    const now = Date.now();
    const elapsed = now - (assistantRequestTimes.get(userId) || 0);
    if (elapsed < ASSISTANT_COOLDOWN_MS) {
      await new Promise(resolve => setTimeout(resolve, ASSISTANT_COOLDOWN_MS - elapsed));
    }
    assistantRequestTimes.set(userId, Date.now());

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your-groq-key-here') {
      return res.status(400).json({ error: "GROQ_API_KEY is missing in .env file. Get a free key from console.groq.com." });
    }

    const groq = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });

    // Helper: sanitize prompt to avoid accidental tool call leaks
    let sanitizedPrompt = prompt;
    if (prompt.includes("<function") || prompt.includes("executeRemoteHostQuery")) {
       console.log("[SECURITY] Sanitizing potential prompt injection/leak in prompt");
       sanitizedPrompt = prompt.replace(/<function[\s\S]*?>/gi, '[filtered]').replace(/executeRemoteHostQuery/gi, '[filtered-tool]');
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "getOfflineDevices",
          description: "Returns a list of all devices that are currently offline or unresponsive."
        }
      },
      {
        type: "function",
        function: {
          name: "getDeviceGroups",
          description: "Returns summary statistics of device groups and their device counts."
        }
      },
      {
        type: "function",
        function: {
          name: "executeRemoteHostQuery",
          description: "Executes a READ-ONLY SQL query on a specific remote host database. AVOID COMPLEX JOINS for performance.",
          parameters: {
            type: "object",
            properties: {
              hostname: { type: "string", description: "The exact hostname of the target PC/Server." },
              sql_query: { type: "string", description: "The SIMPLE T-SQL SELECT query to execute. AVOID COMPLEX JOINS for performance." }
            },
            required: ["hostname", "sql_query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "executeRemoteProcedure",
          description: "Executes a stored procedure or complex T-SQL function/command on a specific remote host database. ADMINISTRATOR PRIVILEGES REQUIRED.",
          parameters: {
            type: "object",
            properties: {
              hostname: { type: "string", description: "The exact hostname of the target PC/Server." },
              sql_command: { type: "string", description: "The T-SQL command to execute (e.g., 'EXEC usp_MyProc' or 'SELECT dbo.MyFunc()')." }
            },
            required: ["hostname", "sql_command"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "searchWorkflows",
          description: "Searches the internal knowledge base for titles of Work Instructions (WI) or tutorials related to a topic. ALWAYS check this first for 'how-to' questions.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search term or topic (e.g., 'restart agent', 'database backup')." }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "getWorkflowDetail",
          description: "Retrieves the full Markdown content of a specific Work Instruction (WI) or tutorial from the knowledge base.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "The unique ID of the workflow document." }
            },
            required: ["id"]
          }
        }
      }
    ];

    const currentDateTime = new Date().toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const sysInstruct = `You are the Pepito Monitoring Expert, a friendly and proactive AI teammate for the Centaur Deploy ecosystem. 
Your goal is to help administrators manage the network with ease and absolute accuracy.

CURRENT CONTEXT: 
- Today's Date: ${currentDateTime} (Waktu Indonesia Barat/Local Time)

BEHAVIORAL GUIDELINES:
1. **BE FRIENDLY & DYNAMIC**: Always start with a warm greeting like "Hi!", "Hello!", or "Good morning!". Sound like a helpful colleague, not a formal system.
2. **STRICT ACCURACY (NO HALLUCINATION)**:
   - **NEVER INVENT DATA**: If a tool returns no data, null, or empty results, YOU MUST tell the user clearly that no data was found or that the result is zero. Do not create fake numbers or values to "fill" the answer.
   - **DATE PRECISION**: When the user provides a date (e.g., 28 Maret 2026), ensure your queries and responses strictly respect that year and date. Use the current date (${currentDateTime}) as your reference point.
3. **PROACTIVE HEALTH CHECKS**:
   - If the user asks a general health question ("How's everything?", "Status?"), use the "getOfflineDevices" tool.
   - Report with a conversational tone (e.g., "Good news! Everything is running perfectly!" or "I've checked the status, and it looks like a few devices need attention:").
4. **CLEAN RESPONSES (NO RAW TOOLS)**:
   - **STRICT RULE**: Never show raw tool call syntax, internal markers like <function=...>, or JSON parameters in your final response. 
   - Perform the tool call behind the scenes and ONLY present the summarized human-readable result.
5. **PERFORMANCE SAFETY**: 
   - Stick to simple, efficient SELECT queries for SQL tools. If a user asks for something very heavy (complex JOINs on large tables like sales_hdr/dtl), politely explain the risk to server performance and suggest a simpler filter.
6. **KNOWLEDGE ACCESS**: Explain "how-to" steps from workflows in your own words to make them more approachable.

Style: Warm, technical yet friendly, proactive, and very accurate.`;

    // 3. History Pruning (last 5 messages only for token efficiency)
    let messages = [
      { role: "system", content: sysInstruct },
      ...(history || []).slice(-5).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        // Critical: Slice each history message text to avoid blowing up the token limit
        content: typeof msg.text === 'string' ? msg.text.substring(0, 2000) : msg.text
      }))

    ];

    messages.push({ role: 'user', content: sanitizedPrompt });

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.4 // Lower temperature for more factual results
    });

    let responseMessage = completion.choices[0].message;
    let finalResponseText = responseMessage.content || "";
    const sources = [];
    const usedTools = [];

    if (responseMessage.tool_calls) {
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        let toolResultText = "No data found.";
        usedTools.push(functionName);

        try {
          if (functionName === 'getOfflineDevices') {
            const resDb = await pool.request().query(
              "SELECT TOP 50 hostname, ip, status, last_seen FROM Devices WHERE status = 'offline'"
            );
            console.log(`[AI TOOL] getOfflineDevices found ${resDb.recordset.length} devices.`);
            toolResultText = JSON.stringify(resDb.recordset);
            sources.push({ type: 'devices', label: 'Offline Devices', detail: `${resDb.recordset.length} device(s) from Devices` });
          } else if (functionName === 'getDeviceGroups') {
            console.log(`[AI TOOL] getDeviceGroups requested.`);


            const resDb = await pool.request().query(`
              SELECT g.name, (SELECT COUNT(*) FROM Devices d WHERE d.group_ids LIKE '%' + g.id + '%') as device_count
              FROM DeviceGroups g
            `);
            toolResultText = JSON.stringify(resDb.recordset);
            sources.push({ type: 'device-groups', label: 'Device Groups', detail: `${resDb.recordset.length} group row(s)` });
          } else if (functionName === 'executeRemoteHostQuery') {
            const { hostname, sql_query } = args;
            const normalized = sql_query.toUpperCase();
            const isReadOnly = normalized.includes('SELECT') &&
              !normalized.includes('DELETE') && !normalized.includes('UPDATE') &&
              !normalized.includes('DROP') && !normalized.includes('TRUNCATE') &&
              !normalized.includes('ALTER') && !normalized.includes('INSERT');

            if (!isReadOnly) {
              toolResultText = "Error: Only SELECT (read-only) queries are permitted for this tool.";
            } else {
              const hostRes = await pool.request().input('name', sql.NVarChar, hostname)
                .query("SELECT id, ip FROM Devices WHERE hostname = @name");
              const target = hostRes.recordset[0];
              if (!target) {
                toolResultText = `Error: Hostname '${hostname}' not found.`;
              } else {
                const connRes = await pool.request().input('did', sql.NVarChar, target.id)
                  .query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
                const conn = connRes.recordset[0];
                if (!conn) {
                  toolResultText = `Error: DB credentials for '${hostname}' not configured.`;
                } else {
                  const config = {
                    user: conn.db_user, password: conn.db_password, server: target.ip,
                    database: conn.db_name,
                    options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
                    pool: { max: 1, min: 0 }
                  };
                  try {
                    const remotePool = await remotePoolManager.getPool(target.id, config);
                    const result = await remotePool.request().query(sql_query);
                    toolResultText = JSON.stringify(result.recordset);
                    sources.push({ type: 'remote-sql', label: hostname, detail: `Read-only SQL returned ${result.recordset.length} row(s)` });
                  } catch (e) {
                    toolResultText = "Remote connection failed: " + e.message;
                  }
                }
              }
            }
          } else if (functionName === 'executeRemoteProcedure') {
            const { hostname, sql_command } = args;

            // 1. Strict Admin Check
            if (!currUser.is_admin) {
              toolResultText = "Error: Access Denied. Only administrators can execute stored procedures or functions.";
            } else {
              const hostRes = await pool.request().input('name', sql.NVarChar, hostname)
                .query("SELECT id, ip FROM Devices WHERE hostname = @name");
              const target = hostRes.recordset[0];

              if (!target) {
                toolResultText = `Error: Hostname '${hostname}' not found.`;
              } else {
                const connRes = await pool.request().input('did', sql.NVarChar, target.id)
                  .query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
                const conn = connRes.recordset[0];

                if (!conn) {
                  toolResultText = `Error: DB credentials for '${hostname}' not configured.`;
                } else {
                  const config = {
                    user: conn.db_user, password: conn.db_password, server: target.ip,
                    database: conn.db_name,
                    options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
                    pool: { max: 1, min: 0 }
                  };
                  try {
                    const remotePool = await remotePoolManager.getPool(target.id, config);
                    const result = await remotePool.request().query(sql_command);
                    toolResultText = JSON.stringify(result.recordset || { success: true, message: "Execution completed." });
                    sources.push({ type: 'remote-exec', label: hostname, detail: 'Administrative SQL command executed' });

                    // 2. Log Activity for Auditing
                    await pool.request()
                      .input('time', sql.NVarChar, new Date().toLocaleString())
                      .input('u', sql.NVarChar, currUser.username || userId)
                      .input('act', sql.NVarChar, `AI Assistant EXEC: [${hostname}] ${sql_command}`)
                      .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @u, @act)");

                  } catch (e) {
                    toolResultText = "Execution failed: " + e.message;
                  }
                }
              }
            }
          } else if (functionName === 'searchWorkflows') {
            const { query } = args;
            // Robust search: split query into words and search each using LIKE
            const words = query.split(/\s+/).filter(w => w.length > 2);
            let result;
            if (words.length > 0) {
              let sqlQuery = "SELECT id, title, category FROM Workflows WHERE ";
              let conditions = words.map((w, i) => `(title LIKE @w${i} OR category LIKE @w${i} OR content LIKE @w${i})`).join(" OR ");
              sqlQuery += conditions;
              
              const request = pool.request();
              words.forEach((w, i) => request.input(`w${i}`, sql.NVarChar, `%${w}%`));
              result = await request.query(sqlQuery);
            } else {
              // Fallback to title search if words are too short
              result = await pool.request()
                .input('q', sql.NVarChar, `%${query}%`)
                .query("SELECT id, title, category FROM Workflows WHERE title LIKE @q OR category LIKE @q");
            }

            toolResultText = result.recordset.length > 0 
              ? JSON.stringify(result.recordset) 
              : `No matching tutorials found for '${query}'. Ask the user for closer keywords.`;
            sources.push({ type: 'workflow-search', label: 'Knowledge Base Search', detail: `${result.recordset.length} workflow match(es)` });
          } else if (functionName === 'getWorkflowDetail') {
            const { id } = args;
            const resDb = await pool.request()
              .input('id', sql.NVarChar, id)
              .query("SELECT title, content FROM Workflows WHERE id = @id");
            toolResultText = resDb.recordset[0] 
              ? `TITLE: ${resDb.recordset[0].title}\n\nCONTENT:\n${resDb.recordset[0].content}`
              : "Document not found.";
            if (resDb.recordset[0]) {
              sources.push({ type: 'workflow-detail', label: resDb.recordset[0].title, detail: 'Knowledge base article' });
            }
          }
        } catch (dbErr) {
          toolResultText = "Tool error: " + dbErr.message;
        }

        // Safety: Limit tool result size to avoid token errors (6k-ish limit)
        if (toolResultText.length > 5000) {
          toolResultText = toolResultText.substring(0, 5000) + "\n\n... [Output truncated for safety]";
        }

        messages.push({ tool_call_id: toolCall.id, role: "tool", name: functionName, content: toolResultText });
      }


      const secondResponse = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages
      });
      finalResponseText = secondResponse.choices[0].message.content;
    }

    await pool.request()
      .input('time', sql.NVarChar, new Date().toLocaleString())
      .input('u', sql.NVarChar, currUser.username || userId)
      .input('act', sql.NVarChar, `AI Assistant CHAT: ${prompt.substring(0, 180)}${usedTools.length ? ` | tools=${usedTools.join(',')}` : ''}`)
      .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @u, @act)");

    res.json({
      text: finalResponseText,
      sources,
      meta: {
        toolsUsed: usedTools,
        cooldownMs: ASSISTANT_COOLDOWN_MS
      }
    });
  } catch (err) {
    console.error('[AI Chat Error]', err);
    res.status(500).json({ error: "Assistant failed: " + err.message });
  }
});

// ── GET /api/reports/deployments ──────────────────────────
app.get('/api/reports/deployments', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT status, COUNT(*) as count 
      FROM DeploymentTargets 
      GROUP BY status
    `);
    
    res.json({ targets: result.recordset });
  } catch (err) {
    console.error('Reports Deployments Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/health ───────────────────────────────
app.get('/api/reports/health', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT id, hostname, ram, disk 
      FROM Devices
    `);
    
    const healthData = result.recordset.map(row => {
      const rawRam = row.ram || "";
      const rawDisk = row.disk || "";
      let isLowRam = false;
      let isLowDisk = false;
      
      const ramMatch = rawRam.match(/(\d+)\s*(GB|MB)/i);
      if (ramMatch) {
        let val = parseFloat(ramMatch[1]);
        if (ramMatch[2].toUpperCase() === 'MB') val = val / 1024;
        if (val < 8) isLowRam = true;
      }
      
      const diskMatch = rawDisk.match(/(?:Free:\s*)?(\d+(?:\.\d+)?)\s*(GB|TB)/i);
      if (diskMatch) {
        let val = parseFloat(diskMatch[1]);
        if (diskMatch[2].toUpperCase() === 'TB') val = val * 1024;
        if (val < 50) isLowDisk = true;
      } else if (rawDisk.includes('/') || rawDisk.toLowerCase().includes('free')) {
        // Fallback: parse something like "24 GB / 100 GB" or "Free: 24 GB"
        const numMatch = rawDisk.match(/(\d+(?:\.\d+)?)\s*(GB|TB)/i);
        if (numMatch) {
            let val = parseFloat(numMatch[1]);
            if (numMatch[2].toUpperCase() === 'TB') val = val * 1024;
            if (val < 50) isLowDisk = true;
        }
      }
      
      return {
        id: row.id,
        hostname: row.hostname,
        ram: row.ram,
        disk: row.disk,
        isLowRam,
        isLowDisk,
        needsUpgrade: isLowRam || isLowDisk
      };
    });
    
    res.json(healthData);
  } catch (err) {
    console.error('Reports Health Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/reports/inventory ────────────────────────────
app.get('/api/reports/inventory', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 10 name, COUNT(*) as count 
      FROM DeviceSoftware 
      GROUP BY name 
      ORDER BY count DESC
    `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error('Reports Inventory Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── STATIC FILES & SPA FALLBACK ───────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── START SERVER ──────────────────────────────────────────────
app.listen(port, '0.0.0.0', async () => {
  console.log(`🚀 Server running on http://0.0.0.0:${port}`);
  await initDb();

  // Start offline detector — runs every 60 seconds (safe version)
  async function detectorLoop() {
    try {
      await runOfflineDetector();
    } catch (err) {
      console.error('Offline Detector Loop Error:', err);
    }
    setTimeout(detectorLoop, 60 * 1000);
  }
  detectorLoop();
  console.log('🔍 Offline detector started (monitoring heartbeats, with proactive ping check)');
});

