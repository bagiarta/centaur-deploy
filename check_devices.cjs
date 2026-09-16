require('dotenv').config();
const sql = require('mssql'); 
sql.connect({user: process.env.DB_USER, password: process.env.DB_PASS, server: process.env.DB_SERVER, database: process.env.DB_NAME, options: { encrypt: false, trustServerCertificate: true }}).then(async pool => { 
  await pool.request().query("UPDATE SystemConfigs SET [value] = '3.1.2' WHERE [key] = 'LATEST_AGENT_VERSION'");
  console.log('Updated LATEST_AGENT_VERSION to 3.1.2'); 
  process.exit(0); 
}).catch(console.error);
