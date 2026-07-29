import { getCrmPool, poolPromise } from './config/db.js';

async function checkSchema() {
  try {
    const mainPool = await poolPromise;
    let pool = await getCrmPool(mainPool);
    
    console.log("=== RXL_LOYALID_ENROLLMENT Schema ===");
    let result1 = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'RXL_LOYALID_ENROLLMENT'
    `);
    console.log(result1.recordset);

    console.log("=== TOP 1 ROW ===");
    let result2 = await pool.request().query(`
      SELECT TOP 1 * FROM RXL_LOYALID_ENROLLMENT
    `);
    console.log(result2.recordset);

    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
checkSchema();
