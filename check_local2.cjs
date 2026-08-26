const sql = require('mssql');
require('dotenv').config({path: 'F:/PepiUpdater/centaur-deploy/.env'});
async function r() {
  try {
    const p = await sql.connect({
      user: process.env.DB_USER || 'sa',
      password: process.env.DB_PASS || 'default_pass',
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      options: { encrypt: false, trustServerCertificate: true }
    });
    const res = await p.request().query("SELECT TOP 1 * FROM basic_sp_mst");
    console.log("basic_sp_mst columns: ", Object.keys(res.recordset[0]).join(', '));
    process.exit(0);
  } catch(e) { console.error(e.message); process.exit(1); }
}
r();
