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

async function updateTimestamps() {
  try {
    console.log('Connecting to database...');
    const pool = await sql.connect(config);
    
    const now = new Date();
    console.log('Server Time:', now.toString());
    console.log('Formatted:', now.toISOString().replace('T', ' ').substring(0, 19));
    
    console.log('\n=== Updating Device Timestamps ===');
    const deviceResult = await pool.request()
      .input('updated_at', sql.DateTime, now)
      .query(`
        UPDATE CCTVDevices 
        SET updated_at = @updated_at 
        WHERE is_active = 1
      `);
    console.log(`Updated ${deviceResult.rowsAffected[0]} devices`);
    
    console.log('\n=== Updating Channel Timestamps ===');
    const channelResult = await pool.request()
      .input('updated_at', sql.DateTime, now)
      .query(`
        UPDATE CCTVChannels 
        SET updated_at = @updated_at 
        WHERE is_enabled = 1
      `);
    console.log(`Updated ${channelResult.rowsAffected[0]} channels`);
    
    console.log('\n=== Updating Storage Timestamps ===');
    const storageResult = await pool.request()
      .input('updated_at', sql.DateTime, now)
      .query(`
        UPDATE CCTVStorage 
        SET updated_at = @updated_at
      `);
    console.log(`Updated ${storageResult.rowsAffected[0]} storage devices`);
    
    console.log('\n✓ All timestamps updated successfully!');
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

updateTimestamps();
