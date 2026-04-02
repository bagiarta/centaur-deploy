const sql = require('mssql');
const fs = require('fs');
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
    const res = await pool.request().query("SELECT TOP 1 id FROM Packages WHERE name LIKE 'PepiAgent-Update-2.4.2' ORDER BY uploaded_at DESC");
    if (res.recordset.length > 0) {
      fs.writeFileSync('tmp/pkgid.txt', res.recordset[0].id);
    }
    await sql.close();
  } catch (err) {
    console.error(err.message);
  }
}
check();
