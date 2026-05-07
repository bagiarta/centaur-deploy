const sql = require('mssql');
require('dotenv').config();

async function run() {
  try {
    const pool = await sql.connect({
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      options: { encrypt: false, trustServerCertificate: true }
    });
    const res = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    console.log(JSON.stringify(res.recordset[0], null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
