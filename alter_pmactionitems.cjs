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
  pool.request().query("ALTER TABLE Trial_PMActionItems ADD asset_code NVARCHAR(100) NULL;")
).then(r => {
  console.log("Success adding asset_code to Trial_PMActionItems");
  process.exit(0);
}).catch(e => {
  console.error("Error:", e.message);
  process.exit(1);
});
