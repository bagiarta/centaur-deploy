require('dotenv').config();
const sql = require('mssql');

async function alterDb() {
  const mod = await import('./config/db.js');
  const config = mod.dbConfig || mod.default?.dbConfig;
  const pool = await sql.connect(config);

  try {
    console.log("Checking columns for AM_Assets...");
    const checkColumns = await pool.request().query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'AM_Assets' AND COLUMN_NAME IN ('po_number', 'activa_code', 'physical_address')
    `);
    const cols = checkColumns.recordset.map(c => c.COLUMN_NAME);

    if (!cols.includes('po_number')) {
      await pool.request().query("ALTER TABLE AM_Assets ADD po_number VARCHAR(100) NULL");
      console.log("Added po_number");
    }
    if (!cols.includes('activa_code')) {
      await pool.request().query("ALTER TABLE AM_Assets ADD activa_code VARCHAR(100) NULL");
      console.log("Added activa_code");
    }
    if (!cols.includes('physical_address')) {
      await pool.request().query("ALTER TABLE AM_Assets ADD physical_address VARCHAR(255) NULL");
      console.log("Added physical_address");
    }

    console.log("Success altering table.");
  } catch(err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

alterDb();
