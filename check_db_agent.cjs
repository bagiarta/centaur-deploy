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
  const conf = await pool.request().query("SELECT * FROM dbo.SystemConfigs WHERE [key] IN ('LATEST_AGENT_VERSION', 'AGENT_UPDATE_URL')");
  console.log('System Configs:', conf.recordset); 
  //const devices = await pool.request().query("SELECT hostname, status, agent_version, last_seen FROM dbo.Devices");
  //console.log('Devices:', devices.recordset); 
  process.exit(0); 
}).catch(err => { 
  console.error(err); 
  process.exit(1); 
});
