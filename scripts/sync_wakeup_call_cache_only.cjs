const sql = require('mssql');
require('dotenv').config();

const localDbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 15000,
  requestTimeout: 120000
};

async function rebuildWakeupCache() {
  let pool;
  try {
    console.log('[WAKEUP-SYNC] Connecting to local DBWH_8529...');
    pool = await sql.connect(localDbConfig);

    console.log('[WAKEUP-SYNC] Executing TRUNCATE and rebuilding WakeupCallCache...');
    
    // Perform the rebuild logic directly
    await pool.request().query(`
      IF OBJECT_ID('WakeupCallCache', 'U') IS NOT NULL 
        DROP TABLE WakeupCallCache;
      
      CREATE TABLE WakeupCallCache (
        card_no NVARCHAR(100) PRIMARY KEY,
        member_name NVARCHAR(200) NULL,
        mobile_no NVARCHAR(50) NULL,
        total_transactions INT DEFAULT 0,
        total_amount DECIMAL(18,2) DEFAULT 0,
        last_purchase_date DATE NULL,
        last_store NVARCHAR(100) NULL
      );

      INSERT INTO WakeupCallCache (card_no, member_name, mobile_no, total_transactions, total_amount, last_purchase_date, last_store)
      SELECT 
          p.member_id, 
          p.name, 
          p.mobile_no,
          p.total_transactions, 
          p.total_spent, 
          p.last_active_date,
          (
              SELECT TOP 1 org_cd 
              FROM LOYAL_MEMBER_DAILY_SUMMARY s 
              WHERE s.member_id = p.member_id 
              ORDER BY summary_date DESC
          ) as last_store
      FROM LOYAL_MEMBER_PROFILE p;
    `);

    console.log('[WAKEUP-SYNC] Successfully rebuilt WakeupCallCache!');
  } catch (err) {
    console.error('[WAKEUP-SYNC] Error:', err.message);
  } finally {
    if (pool) await pool.close();
  }
}

rebuildWakeupCache();
