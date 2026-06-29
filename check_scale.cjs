const sql = require('mssql');
const { dbConfig } = require('./config/db.js');

sql.connect(dbConfig).then(async pool => {
  try {
    const cols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PendingCommands'");
    console.table(cols.recordset);
    
    const logs = await pool.request().query("SELECT TOP 5 * FROM ScaleJobs ORDER BY created_at DESC");
    console.log(logs.recordset);
  } catch(e) {
    console.error(e);
  }
  await sql.close();
}).catch(e => console.error(e.message));
