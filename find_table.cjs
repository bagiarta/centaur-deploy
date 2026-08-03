const sql = require('mssql');
require('dotenv').config();
sql.connect({user: process.env.DB_USER, password: process.env.DB_PASS, server: process.env.DB_SERVER, database: process.env.DB_NAME, options: {encrypt: false, trustServerCertificate: true}}).then(async pool => {
  const result = await pool.request().query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES`);
  console.log(result.recordset.map(r => r.TABLE_NAME).join(', '));
  process.exit();
});
