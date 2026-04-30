const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER || 'pepitouser',
  password: process.env.DB_PASS || 'pepitouser8529',
  server: process.env.DB_SERVER || '192.168.85.29',
  database: process.env.DB_NAME || 'DBWH_8529',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function check() {
  try {
    const pool = await sql.connect(config);
    console.log('Connected to SQL Server');
    
    const results = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'TicketTargets'
    `);
    
    console.log('--- COLUMN TYPES ---');
    console.log(JSON.stringify(results.recordset, null, 2));

    const badData = await pool.request().query(`
      SELECT id, hostname, last_seen 
      FROM Devices 
      WHERE last_seen LIKE '%Invalid%' OR last_seen = 'Never'
    `);
    console.log('--- BAD DATA SAMPLES ---');
    console.log(JSON.stringify(badData.recordset, null, 2));

    await pool.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
