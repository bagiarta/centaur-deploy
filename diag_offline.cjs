const sql = require('mssql');
require('dotenv').config();

async function check() {
  try {
    const pool = await sql.connect({
       user: process.env.DB_USER, password: process.env.DB_PASS,
       server: process.env.DB_SERVER, database: process.env.DB_NAME,
       options: { encrypt: false, trustServerCertificate: true }
    });

    const res = await pool.request().query(`
      SELECT TOP 10 hostname, status, last_seen, 
             TRY_CAST(last_seen AS DATETIME2) as parsed,
             GETUTCDATE() as now_utc,
             DATEDIFF(MINUTE, TRY_CAST(last_seen AS DATETIME2), GETUTCDATE()) as diff_mins
      FROM Devices 
      WHERE 
        (status = 'online' AND TRY_CAST(last_seen AS DATETIME2) IS NOT NULL AND DATEDIFF(MINUTE, TRY_CAST(last_seen AS DATETIME2), GETUTCDATE()) > 5)
        OR 
        (status = 'offline' AND (last_offline_alert_at IS NULL OR DATEDIFF(HOUR, last_offline_alert_at, GETDATE()) >= 1))
        OR
        (status = 'offline' AND (last_whatsapp_alert_at IS NULL OR DATEDIFF(HOUR, last_whatsapp_alert_at, GETDATE()) >= 24))
    `);

    console.log(JSON.stringify(res.recordset, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
check();
