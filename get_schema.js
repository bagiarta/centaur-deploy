import { initDb, poolPromise } from './config/db.js';

async function run() {
  await initDb();
  const pool = await poolPromise;
  const result = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AM_Movements'");
  console.log(result.recordset);
  process.exit(0);
}
run();
