const sql = require('mssql');

const config = {
  user: 'sa',
  password: 'R3S1K0_g4j1',
  server: '192.168.85.29',
  database: 'DBWH_8529',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function checkTime() {
  try {
    const pool = await sql.connect(config);
    
    // Get SQL Server current time
    const result = await pool.request().query(`
      SELECT 
        GETDATE() as server_utc_time,
        DATEADD(HOUR, 8, GETDATE()) as server_plus_8
    `);
    
    console.log('=== SQL Server Time ===');
    console.log('SQL Server UTC Time:', result.recordset[0].server_utc_time);
    console.log('SQL Server +8 Hours:', result.recordset[0].server_plus_8);
    
    console.log('\n=== Node.js Time ===');
    const now = new Date();
    console.log('Node.js UTC Time:', now.toISOString());
    console.log('Node.js Local Time:', now.toString());
    
    const plus8 = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    console.log('Node.js UTC+8:', plus8.toISOString().replace('T', ' ').substring(0, 19));
    
    console.log('\n=== System Time ===');
    console.log('Process TZ:', process.env.TZ || 'Not Set');
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkTime();
