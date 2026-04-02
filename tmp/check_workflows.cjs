const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function checkWorkflows() {
  try {
    let pool = await sql.connect(dbConfig);
    const result = await pool.request().query("SELECT id, title, category FROM Workflows");
    console.log("Workflows in Database:");
    console.table(result.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkWorkflows();
