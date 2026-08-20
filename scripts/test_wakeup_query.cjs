const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 15000,
  requestTimeout: 120000
};

async function testWakeupCallQuery() {
  let pool;
  try {
    pool = await sql.connect(dbConfig);
    const reqDb = pool.request();
    
    let where = 'WHERE 1=1';
    
    const countRes = await reqDb.query(`SELECT COUNT(*) as total FROM WakeupCallCache ${where}`);
    console.log("Count Success:", countRes.recordset[0].total);
    
    reqDb.input('offset', sql.Int, 0);
    reqDb.input('limit', sql.Int, 50);
    const dataRes = await reqDb.query(`
      SELECT * FROM WakeupCallCache 
      ${where} 
      ORDER BY total_amount DESC 
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    
    console.log("Data Success:", dataRes.recordset.length, "rows fetched");
  } catch (err) {
    console.error("SQL ERROR:", err.message);
  } finally {
    if (pool) await pool.close();
  }
}

testWakeupCallQuery();
