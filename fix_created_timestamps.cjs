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

async function fixCreatedTimestamps() {
  try {
    console.log('Fixing incorrect created_at timestamps...\n');
    const pool = await sql.connect(config);
    
    // Devices created with wrong server time (26 June instead of 25 June)
    // Subtract approximately 19 hours to correct the time
    const hoursDiff = 19;
    
    console.log('=== Fixing CCTVDevices ===');
    const deviceResult = await pool.request().query(`
      UPDATE CCTVDevices 
      SET created_at = DATEADD(HOUR, -${hoursDiff}, created_at)
      WHERE is_active = 1 AND CAST(created_at AS DATE) >= '2026-06-26'
    `);
    console.log(`Fixed ${deviceResult.rowsAffected[0]} devices`);
    
    console.log('\n=== Fixing CCTVChannels ===');
    const channelResult = await pool.request().query(`
      UPDATE CCTVChannels 
      SET created_at = DATEADD(HOUR, -${hoursDiff}, created_at)
      WHERE is_enabled = 1 AND CAST(created_at AS DATE) >= '2026-06-26'
    `);
    console.log(`Fixed ${channelResult.rowsAffected[0]} channels`);
    
    console.log('\n=== Fixing CCTVStorage ===');
    const storageResult = await pool.request().query(`
      UPDATE CCTVStorage 
      SET created_at = DATEADD(HOUR, -${hoursDiff}, created_at)
      WHERE CAST(created_at AS DATE) >= '2026-06-26'
    `);
    console.log(`Fixed ${storageResult.rowsAffected[0]} storage devices`);
    
    console.log('\n=== Verification ===');
    const devices = await pool.request().query(`
      SELECT TOP 3 name, created_at, updated_at 
      FROM CCTVDevices 
      WHERE is_active = 1 
      ORDER BY name
    `);
    
    devices.recordset.forEach(d => {
      console.log(`${d.name}: Created ${d.created_at}, Updated ${d.updated_at}`);
    });
    
    console.log('\n✓ Timestamps corrected!');
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

fixCreatedTimestamps();
