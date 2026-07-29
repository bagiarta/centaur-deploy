const sql = require('mssql');
const dotenv = require('dotenv');
dotenv.config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 15000,
  requestTimeout: 60000
};

async function run() {
  try {
    console.log('[SETUP-ESL] Connecting to database...');
    const pool = new sql.ConnectionPool(dbConfig);
    await pool.connect();
    console.log('[SETUP-ESL] Connected successfully.');

    // 1. Create ESL_GATEWAYS Table
    const checkGateways = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'ESL_GATEWAYS'
    `);
    if (checkGateways.recordset.length === 0) {
      console.log('[SETUP-ESL] Creating ESL_GATEWAYS table...');
      await pool.request().query(`
        CREATE TABLE ESL_GATEWAYS (
          id INT IDENTITY(1,1) PRIMARY KEY,
          org_cd NVARCHAR(50) NOT NULL,
          gateway_ip NVARCHAR(50) NOT NULL,
          hostname NVARCHAR(100) NOT NULL,
          api_key NVARCHAR(200) NULL,
          status NVARCHAR(50) DEFAULT 'offline',
          last_seen DATETIME2 NULL,
          created_at DATETIME2 DEFAULT GETDATE(),
          updated_at DATETIME2 DEFAULT GETDATE()
        )
      `);
      console.log('[SETUP-ESL] Created ESL_GATEWAYS successfully.');
    } else {
      console.log('[SETUP-ESL] ESL_GATEWAYS already exists. Checking for api_key column...');
      await pool.request().query(`
        IF NOT EXISTS(SELECT * FROM sys.columns WHERE Name = N'api_key' AND Object_ID = Object_ID(N'ESL_GATEWAYS'))
        ALTER TABLE ESL_GATEWAYS ADD api_key NVARCHAR(200) NULL;
      `);
      console.log('[SETUP-ESL] api_key column check completed.');
    }

    // 2. Create ESL_LABELS Table
    const checkLabels = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'ESL_LABELS'
    `);
    if (checkLabels.recordset.length === 0) {
      console.log('[SETUP-ESL] Creating ESL_LABELS table...');
      await pool.request().query(`
        CREATE TABLE ESL_LABELS (
          label_id NVARCHAR(100) PRIMARY KEY,
          org_cd NVARCHAR(50) NOT NULL,
          itm_cd NVARCHAR(100) NOT NULL,
          item_name NVARCHAR(255) NULL,
          current_price DECIMAL(18,2) DEFAULT 0,
          battery_level INT DEFAULT 100,
          signal_strength INT DEFAULT 0,
          status NVARCHAR(50) DEFAULT 'healthy',
          last_sync_dt DATETIME2 NULL,
          updated_at DATETIME2 DEFAULT GETDATE()
        )
      `);
      console.log('[SETUP-ESL] Created ESL_LABELS successfully.');
    } else {
      console.log('[SETUP-ESL] ESL_LABELS already exists.');
    }

    // 3. Create ESL_SYNC_LOGS Table
    const checkLogs = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'ESL_SYNC_LOGS'
    `);
    if (checkLogs.recordset.length === 0) {
      console.log('[SETUP-ESL] Creating ESL_SYNC_LOGS table...');
      await pool.request().query(`
        CREATE TABLE ESL_SYNC_LOGS (
          id INT IDENTITY(1,1) PRIMARY KEY,
          org_cd NVARCHAR(50) NOT NULL,
          label_id NVARCHAR(100) NOT NULL,
          itm_cd NVARCHAR(100) NOT NULL,
          prev_price DECIMAL(18,2) NULL,
          new_price DECIMAL(18,2) NOT NULL,
          status NVARCHAR(50) NOT NULL,
          error_msg NVARCHAR(MAX) NULL,
          synced_at DATETIME2 DEFAULT GETDATE()
        )
      `);
      console.log('[SETUP-ESL] Created ESL_SYNC_LOGS successfully.');
    } else {
      console.log('[SETUP-ESL] ESL_SYNC_LOGS already exists.');
    }

    // Seed mock data if tables were just created
    console.log('[SETUP-ESL] Checking mock seed data...');
    const gatewaysCount = await pool.request().query('SELECT COUNT(1) AS count FROM ESL_GATEWAYS');
    if (gatewaysCount.recordset[0].count === 0) {
      console.log('[SETUP-ESL] Seeding mock gateways...');
      await pool.request().query(`
        INSERT INTO ESL_GATEWAYS (org_cd, gateway_ip, hostname, status, last_seen)
        VALUES 
          ('HO', '192.168.85.15', 'ESL-GW-HO', 'online', GETDATE()),
          ('ST001', '192.168.90.12', 'ESL-GW-ST001', 'online', GETDATE()),
          ('ST002', '192.168.92.14', 'ESL-GW-ST002', 'offline', DATEADD(hour, -2, GETDATE()))
      `);
    }

    const labelsCount = await pool.request().query('SELECT COUNT(1) AS count FROM ESL_LABELS');
    if (labelsCount.recordset[0].count === 0) {
      console.log('[SETUP-ESL] Seeding mock labels...');
      // Fetch some real item codes from ITEM_SALES_MEMBER if exists
      let itemCode1 = '10001', itemName1 = 'Fresh Red Apple';
      let itemCode2 = '10002', itemName2 = 'Organic Broccoli';
      
      const itemCheck = await pool.request().query('SELECT TOP 2 itm_cd, item_name FROM ITEM_SALES_MEMBER');
      if (itemCheck.recordset.length >= 2) {
        itemCode1 = itemCheck.recordset[0].itm_cd;
        itemName1 = itemCheck.recordset[0].item_name;
        itemCode2 = itemCheck.recordset[1].itm_cd;
        itemName2 = itemCheck.recordset[1].item_name;
      }
      
      await pool.request()
        .input('c1', sql.NVarChar, itemCode1)
        .input('n1', sql.NVarChar, itemName1)
        .input('c2', sql.NVarChar, itemCode2)
        .input('n2', sql.NVarChar, itemName2)
        .query(`
          INSERT INTO ESL_LABELS (label_id, org_cd, itm_cd, item_name, current_price, battery_level, signal_strength, status, last_sync_dt)
          VALUES 
            ('MAC-0011223344AA', 'ST001', @c1, @n1, 24500, 95, -62, 'healthy', GETDATE()),
            ('MAC-0011223344BB', 'ST001', @c2, @n2, 18200, 18, -80, 'low_battery', GETDATE()),
            ('MAC-0011223344CC', 'ST002', '99999', 'Offline Apple Cider', 85000, 85, -92, 'offline', DATEADD(day, -1, GETDATE()))
        `);
      console.log('[SETUP-ESL] Mock data seeded successfully.');
    }

    await pool.close();
    console.log('[SETUP-ESL] Finished setup successfully!');
  } catch (err) {
    console.error('[SETUP-ESL] Error:', err);
  }
}

run();
