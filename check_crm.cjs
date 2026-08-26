const sql = require('mssql');
require('dotenv').config({path: 'F:/PepiUpdater/centaur-deploy/.env'});
async function run() {
  try {
    const crmPool = await sql.connect({
      user: process.env.CRM_DB_USER || 'sa',
      password: process.env.CRM_DB_PASS || 'default_pass',
      server: process.env.CRM_DB_SERVER || '192.168.85.55',
      database: process.env.CRM_DB_NAME || 'DBWH_8555',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 5000
    });
    const res = await crmPool.request().query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%ITEM%' OR table_name LIKE '%UOM%'");
    console.log(res.recordset.map(r => r.table_name).join(', '));
    process.exit(0);
  } catch(e) { console.error(e.message); process.exit(1); }
}
run();
