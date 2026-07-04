require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function checkNusaDuaChannels() {
  try {
    const pool = await sql.connect(config);
    
    console.log('\n=== NVR 3 Nusa Dua Device Info ===');
    const deviceResult = await pool.request()
      .query("SELECT id, name, ip_address, status FROM CCTVDevices WHERE name LIKE '%Nusa Dua%'");
    
    console.table(deviceResult.recordset);
    
    if (deviceResult.recordset.length === 0) {
      console.log('Device not found!');
      process.exit(0);
    }
    
    const deviceId = deviceResult.recordset[0].id;
    
    console.log('\n=== Channels for NVR 3 Nusa Dua ===');
    const channelsResult = await pool.request()
      .input('deviceId', sql.NVarChar, deviceId)
      .query(`
        SELECT 
          channel_number, 
          channel_name, 
          status, 
          is_enabled 
        FROM CCTVChannels 
        WHERE device_id = @deviceId 
        ORDER BY channel_number
      `);
    
    console.table(channelsResult.recordset);
    
    console.log('\n=== Channel Status Summary ===');
    const summary = {
      total: channelsResult.recordset.length,
      enabled: channelsResult.recordset.filter(ch => ch.is_enabled).length,
      online: channelsResult.recordset.filter(ch => ch.status === 'online').length,
      offline: channelsResult.recordset.filter(ch => ch.status === 'offline').length,
      video_loss: channelsResult.recordset.filter(ch => ch.status === 'video_loss').length,
      no_signal: channelsResult.recordset.filter(ch => ch.status === 'no_signal').length
    };
    console.table([summary]);
    
    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkNusaDuaChannels();
