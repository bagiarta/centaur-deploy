const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'your_password',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'centaur',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

async function update() {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query("UPDATE AM_Assets SET status = 'IN_USE' WHERE status = 'ACTIVE'");
    console.log('Updated rows:', result.rowsAffected[0]);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

update();
