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
  await pool.request().query("UPDATE dbo.SystemConfigs SET value = 'http://192.168.85.30:3001/CentaurAgent_v30.ps1', updated_at = GETDATE() WHERE [key] = 'AGENT_UPDATE_URL'");
  await pool.request().query("UPDATE dbo.SystemConfigs SET value = '3.1.1', updated_at = GETDATE() WHERE [key] = 'LATEST_AGENT_VERSION'");
  console.log("Database updated successfully.");
  process.exit(0); 
}).catch(err => { 
  console.error(err); 
  process.exit(1); 
});
