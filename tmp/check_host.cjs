const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function check() {
  try {
    const pool = await sql.connect(dbConfig);
    const res = await pool.request().query("SELECT TOP 5 * FROM DeploymentTargets WHERE hostname = 'STORESR' ORDER BY updated_at DESC");
    console.log(JSON.stringify(res.recordset, null, 2));
    await sql.close();
  } catch (err) {
    console.error(err.message);
  }
}
check();
