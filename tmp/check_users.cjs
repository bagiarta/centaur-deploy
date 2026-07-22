const sql = require('mssql');
require('dotenv').config();

const mainConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function test() {
  try {
    const pool = await sql.connect(mainConfig);
    const users = await pool.request().query("SELECT id, username, full_name, role_id FROM Users");
    console.log("Users in DB:", users.recordset);
    process.exit(0);
  } catch (err) {
    console.error("DB Error:", err.message);
    process.exit(1);
  }
}

test();
