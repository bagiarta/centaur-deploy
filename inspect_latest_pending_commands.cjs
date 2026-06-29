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
  const result = await pool.request()
    .input('device_id', sql.NVarChar, 'dev-1773220748821')
    .query("SELECT TOP 3 id, exec_id, status, command FROM PendingCommands WHERE device_id = @device_id ORDER BY created_at DESC");

  console.log(JSON.stringify(result.recordset, null, 2));
  await pool.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
