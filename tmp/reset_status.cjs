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

async function reset() {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query("UPDATE DeploymentTargets SET status = 'pending', log = NULL WHERE status = 'failed'");
    console.log(`Rows affected: ${result.rowsAffected[0]}`);
    await sql.close();
  } catch (err) {
    console.error(err.message);
  }
}
reset();
