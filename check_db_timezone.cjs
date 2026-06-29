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

async function checkDBTimezone() {
  try {
    const pool = await sql.connect(config);
    
    const result = await pool.request().query(`
      SELECT 
        GETDATE() as current_db_time,
        GETUTCDATE() as current_utc_time,
        SYSDATETIMEOFFSET() as current_with_offset
    `);
    
    console.log('=== SQL Server Time Info ===');
    console.log('GETDATE():', result.recordset[0].current_db_time);
    console.log('GETUTCDATE():', result.recordset[0].current_utc_time);
    console.log('SYSDATETIMEOFFSET():', result.recordset[0].current_with_offset);
    
    console.log('\n=== System Time ===');
    const now = new Date();
    console.log('System Local:', now.toString());
    console.log('System UTC:', now.toISOString());
    
    // Calculate difference
    const dbTime = new Date(result.recordset[0].current_db_time);
    const systemTime = new Date();
    const diffMs = dbTime - systemTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    
    console.log('\n=== Time Difference ===');
    console.log(`DB is ahead by: ${diffHours.toFixed(2)} hours`);
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkDBTimezone();
