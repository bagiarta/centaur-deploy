const sql = require('mssql');
async function test() {
  const mod = await import('./config/db.js');
  const pool = await sql.connect(mod.default);
  const result = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AM_Assignments'");
  console.log(JSON.stringify(result.recordset));
  process.exit(0);
}
test().catch(console.error);
