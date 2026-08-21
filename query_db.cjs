const sql = require('mssql'); 
require('dotenv').config(); 
const dbConfig = { user: process.env.DB_USER, password: process.env.DB_PASS, server: process.env.DB_SERVER, database: process.env.DB_NAME, options: { encrypt: false, trustServerCertificate: true } }; 
sql.connect(dbConfig).then(pool => pool.request().query("SELECT hostname, status, network_ports, system_metrics, last_seen FROM dbo.Devices WHERE hostname = 'RT-PXUD'")).then(result => { 
  console.log(result.recordset[0]); 
  process.exit(0); 
}).catch(err => { 
  console.error(err); 
  process.exit(1); 
});
