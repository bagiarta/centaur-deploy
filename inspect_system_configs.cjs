const dotenv = require('dotenv');
dotenv.config();
const sql = require('mssql');

(async () => {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }
  };

  const pool = await sql.connect(config);
  const res = await pool.request().query("SELECT TOP 20 * FROM SystemConfigs");
  console.log(JSON.stringify(res.recordset, null, 2));
  const cols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SystemConfigs'");
  console.log('COLUMNS', JSON.stringify(cols.recordset, null, 2));
  await pool.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
