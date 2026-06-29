const sql = require('mssql');
const cfg = { user:'sa', password:'R3S1K0_g4j1', server:'192.168.85.29', database:'DBWH_8529', options:{encrypt:false,trustServerCertificate:true} };
sql.connect(cfg).then(async pool => {
  const cols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Scales'");
  console.table(cols.recordset);
  await sql.close();
}).catch(e => console.error(e.message));
