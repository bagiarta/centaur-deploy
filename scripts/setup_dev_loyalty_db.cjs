const sql = require('f:/PepiUpdater/centaur-deploy/node_modules/mssql/index.js');
const dotenv = require('f:/PepiUpdater/centaur-deploy/node_modules/dotenv/lib/main.js');
dotenv.config({ path: 'f:/PepiUpdater/centaur-deploy/.env' });

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

async function run() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log('[SETUP] Connected to local database DBWH_8529.');

    // 1. Create LOYAL_MEMBER_DAILY_SUMMARY
    const checkSummaryTable = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOYAL_MEMBER_DAILY_SUMMARY'
    `);
    if (checkSummaryTable.recordset.length === 0) {
      console.log('[SETUP] Creating LOYAL_MEMBER_DAILY_SUMMARY table...');
      await pool.request().query(`
        CREATE TABLE LOYAL_MEMBER_DAILY_SUMMARY (
          member_id NVARCHAR(100) NOT NULL,
          summary_date DATE NOT NULL,
          org_cd NVARCHAR(50) NOT NULL,
          total_sales DECIMAL(18,2) DEFAULT 0,
          total_cost DECIMAL(18,2) DEFAULT 0,
          total_promo DECIMAL(18,2) DEFAULT 0,
          total_margin DECIMAL(18,2) DEFAULT 0,
          total_qty DECIMAL(18,2) DEFAULT 0,
          total_txn INT DEFAULT 0,
          last_purchase_time VARCHAR(10) NULL,
          categories_bought NVARCHAR(MAX) NULL,
          created_at DATETIME DEFAULT GETDATE(),
          PRIMARY KEY (member_id, summary_date, org_cd)
        )
      `);
      console.log('[SETUP] Created LOYAL_MEMBER_DAILY_SUMMARY successfully.');
    } else {
      console.log('[SETUP] LOYAL_MEMBER_DAILY_SUMMARY already exists.');
    }

    // 2. Create LOYAL_MEMBER_PROFILE
    const checkProfileTable = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOYAL_MEMBER_PROFILE'
    `);
    if (checkProfileTable.recordset.length === 0) {
      console.log('[SETUP] Creating LOYAL_MEMBER_PROFILE table...');
      await pool.request().query(`
        CREATE TABLE LOYAL_MEMBER_PROFILE (
          member_id NVARCHAR(100) NOT NULL,
          name NVARCHAR(200) NULL,
          mobile_no NVARCHAR(50) NULL,
          join_date DATE NULL,
          city NVARCHAR(100) NULL,
          total_spent DECIMAL(18,2) DEFAULT 0,
          total_transactions INT DEFAULT 0,
          last_active_date DATE NULL,
          favorite_store NVARCHAR(100) NULL,
          points_balance INT DEFAULT 0,
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          PRIMARY KEY (member_id)
        )
      `);
      console.log('[SETUP] Created LOYAL_MEMBER_PROFILE successfully.');
    } else {
      console.log('[SETUP] LOYAL_MEMBER_PROFILE already exists.');
    }

    // 3. Create LOYAL_MEMBER_ACHIEVEMENT
    const checkAchievementTable = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'LOYAL_MEMBER_ACHIEVEMENT'
    `);
    if (checkAchievementTable.recordset.length === 0) {
      console.log('[SETUP] Creating LOYAL_MEMBER_ACHIEVEMENT table...');
      await pool.request().query(`
        CREATE TABLE LOYAL_MEMBER_ACHIEVEMENT (
          member_id NVARCHAR(100) NOT NULL,
          achievement_name NVARCHAR(100) NOT NULL,
          unlocked_at DATETIME DEFAULT GETDATE(),
          criteria_met NVARCHAR(MAX) NULL,
          PRIMARY KEY (member_id, achievement_name)
        )
      `);
      console.log('[SETUP] Created LOYAL_MEMBER_ACHIEVEMENT successfully.');
    } else {
      console.log('[SETUP] LOYAL_MEMBER_ACHIEVEMENT already exists.');
    }
    // 4. Create WakeupCallCache
    const checkWakeupTable = await pool.request().query(`
      SELECT * FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'WakeupCallCache'
    `);
    if (checkWakeupTable.recordset.length === 0) {
      console.log('[SETUP] Creating WakeupCallCache table...');
      await pool.request().query(`
        CREATE TABLE WakeupCallCache (
          card_no NVARCHAR(100) PRIMARY KEY,
          member_name NVARCHAR(200) NULL,
          total_transactions INT DEFAULT 0,
          total_amount DECIMAL(18,2) DEFAULT 0,
          last_purchase_date DATE NULL,
          last_store NVARCHAR(100) NULL
        )
      `);
      console.log('[SETUP] Created WakeupCallCache successfully.');
    } else {
      console.log('[SETUP] WakeupCallCache already exists.');
    }

    await pool.close();
    console.log('[SETUP] Finished setup successfully!');
  } catch (err) {
    console.error('[SETUP] Error:', err);
  }
}

run();
