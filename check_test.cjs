const sql = require('mssql'); 
require('dotenv').config(); 
const dbConfig = { 
  user: process.env.DB_USER, 
  password: process.env.DB_PASS, 
  server: process.env.DB_SERVER, 
  database: process.env.DB_NAME, 
  options: { encrypt: false, trustServerCertificate: true } 
}; 
sql.connect(dbConfig).then(async pool => { 
  const res = await pool.request().query("SELECT hostname, status, agent_version, last_seen FROM dbo.Devices WHERE hostname = 'TEST'");
  console.log(res.recordset);
  process.exit(0); 
}).catch(err => { 
  console.error(err); 
  process.exit(1); 
});
