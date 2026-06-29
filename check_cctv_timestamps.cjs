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

async function checkTimestamps() {
  try {
    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    
    console.log('\n=== CCTV Devices Timestamps ===');
    const result = await pool.request().query(`
      SELECT TOP 5
        name,
        ip_address,
        status,
        last_seen,
        last_poll,
        created_at,
        updated_at
      FROM CCTVDevices
      WHERE is_active = 1
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${result.recordset.length} devices\n`);
    
    result.recordset.forEach((device, idx) => {
      console.log(`Device ${idx + 1}: ${device.name} (${device.ip_address})`);
      console.log(`  Status: ${device.status}`);
      console.log(`  Last Seen: ${device.last_seen}`);
      console.log(`  Last Poll: ${device.last_poll}`);
      console.log(`  Created At: ${device.created_at}`);
      console.log(`  Updated At: ${device.updated_at}`);
      console.log('');
    });
    
    console.log('\n=== Current Server Time ===');
    const timeResult = await pool.request().query('SELECT GETDATE() as current_time');
    console.log('SQL Server Time (UTC):', timeResult.recordset[0].current_time);
    
    const now = new Date();
    const jakartaTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    console.log('Jakarta Time (UTC+7):', jakartaTime.toISOString().replace('T', ' ').substring(0, 19));
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

checkTimestamps();
