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

async function checkChannelStatus() {
  try {
    const pool = await sql.connect(config);
    
    console.log('\n=== CHANNEL STATUS SUMMARY ===');
    const statusSummary = await pool.request()
      .query('SELECT status, COUNT(*) as count FROM CCTVChannels GROUP BY status');
    console.table(statusSummary.recordset);
    
    console.log('\n=== OFFLINE CHANNELS (if any) ===');
    const offlineChannels = await pool.request()
      .query(`
        SELECT 
          c.channel_number, 
          c.channel_name, 
          c.status, 
          c.is_enabled,
          d.name as device_name,
          d.ip_address,
          d.status as device_status
        FROM CCTVChannels c
        JOIN CCTVDevices d ON c.device_id = d.id
        WHERE c.status IN ('offline', 'video_loss', 'no_signal')
        ORDER BY d.name, c.channel_number
      `);
    
    if (offlineChannels.recordset.length > 0) {
      console.table(offlineChannels.recordset);
    } else {
      console.log('No offline channels found.');
    }
    
    console.log('\n=== DASHBOARD QUERY RESULT ===');
    const dashboardQuery = await pool.request()
      .query(`
        SELECT 
          COUNT(*) as total_channels,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_channels,
          SUM(CASE WHEN status IN ('offline', 'video_loss', 'no_signal') THEN 1 ELSE 0 END) as offline_channels,
          SUM(CASE WHEN is_recording = 1 THEN 1 ELSE 0 END) as recording_channels
        FROM CCTVChannels WHERE is_enabled = 1
      `);
    console.table(dashboardQuery.recordset);
    
    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkChannelStatus();
