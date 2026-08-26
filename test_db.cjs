
const sql = require('mssql');
async function test() {
  const config = (await import('./config/db.js')).config || (await import('./config/db.js')).default.config;
  const pool = await sql.connect(config);
  const result = await pool.request().query(\
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'AM_Assignments'
  \);
  console.log(result.recordset);
  process.exit(0);
}
test().catch(console.error);
