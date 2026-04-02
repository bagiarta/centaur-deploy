const sql = require('mssql');
const dotenv = require('dotenv');
dotenv.config();
const cfg = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};
sql.connect(cfg).then(p =>
  p.request().query("UPDATE SystemConfigs SET [value]='2.7.1', updated_at=GETDATE() WHERE [key]='LATEST_AGENT_VERSION'")
).then(() => { console.log('Bumped to 2.7.1'); process.exit(0); })
 .catch(e => { console.error(e.message); process.exit(1); });
