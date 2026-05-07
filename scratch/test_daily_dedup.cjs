const sql = require('mssql');
require('dotenv').config();

// Mock dependencies
const poolPromise = sql.connect({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
});

// We'll just load the function from server.cjs if possible, but it's not exported.
// I'll copy the logic for testing or use a separate script that mimics it.

async function testDedup() {
  const pool = await poolPromise;
  const todayStr = new Date().toISOString().split('T')[0];
  
  console.log("--- TEST 1: First Attempt ---");
  // Reset DB flag first
  await pool.request().query("UPDATE NotificationSettings SET last_daily_report_date = NULL WHERE id = 'global'");
  
  // Logic from server.cjs
  async function simulateSend(isManual) {
    if (!isManual) {
      const settingsCheck = await pool.request().query("SELECT last_daily_report_date FROM NotificationSettings WHERE id = 'global'");
      const lastSentDate = settingsCheck.recordset[0]?.last_daily_report_date;
      if (lastSentDate === todayStr) {
        console.log('[MOCK] Already sent (DB check).');
        return false;
      }
      const reserveRes = await pool.request()
        .input('today', sql.NVarChar, todayStr)
        .query("UPDATE NotificationSettings SET last_daily_report_date = @today WHERE id = 'global' AND (last_daily_report_date IS NULL OR last_daily_report_date <> @today)");
      if (reserveRes.rowsAffected[0] === 0) {
        console.log('[MOCK] Claimed by another process.');
        return false;
      }
    }
    console.log('[MOCK] Sending report...');
    return true;
  }

  const result1 = await simulateSend(false);
  console.log("Result 1:", result1 ? "SUCCESS" : "SKIPPED");

  console.log("\n--- TEST 2: Second Attempt (Should Skip) ---");
  const result2 = await simulateSend(false);
  console.log("Result 2:", result2 ? "SUCCESS" : "SKIPPED");

  process.exit(0);
}

testDedup();
