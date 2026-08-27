const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

sql.connect(dbConfig).then(pool => 
  pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Trial_PMActionItems'")
).then(r => {
  console.log(r.recordset);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
