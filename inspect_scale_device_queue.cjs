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
  const dev = await pool.request()
    .input('host', sql.NVarChar, 'STORESRVR002')
    .query('SELECT id, hostname, ip, agent_version, status FROM Devices WHERE hostname = @host');

  console.log('DEVICE', JSON.stringify(dev.recordset[0], null, 2));

  const pending = await pool.request()
    .input('device_id', sql.NVarChar, dev.recordset[0]?.id)
    .query("SELECT TOP 10 id, exec_id, status, created_at, result_log, executed_at FROM PendingCommands WHERE device_id = @device_id ORDER BY created_at DESC");

  console.log('PENDING', JSON.stringify(pending.recordset, null, 2));
  await pool.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
