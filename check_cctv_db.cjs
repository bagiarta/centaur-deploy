require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

async function checkCCTVData() {
  try {
    console.log('Connecting to database...');
    await sql.connect(config);
    console.log('Connected!\n');

    // Check CCTVDevices
    console.log('='.repeat(60));
    console.log('CCTV DEVICES:');
    console.log('='.repeat(60));
    const devicesResult = await sql.query`
      SELECT *
      FROM CCTVDevices
      ORDER BY created_at DESC
    `;
    
    if (devicesResult.recordset.length === 0) {
      console.log('❌ No devices found in CCTVDevices table');
    } else {
      console.log(`✅ Found ${devicesResult.recordset.length} device(s):\n`);
      devicesResult.recordset.forEach((device, idx) => {
        console.log(`Device ${idx + 1}:`);
        console.log(`  ID: ${device.id}`);
        console.log(`  Name: ${device.name}`);
        console.log(`  Model: ${device.model || 'N/A'}`);
        console.log(`  IP: ${device.ip_address}:${device.port}`);
        console.log(`  Vendor: ${device.vendor}`);
        console.log(`  Type: ${device.device_type}`);
        console.log(`  Status: ${device.status}`);
        console.log(`  Location ID: ${device.location_id || 'No location'}`);
        console.log(`  Active: ${device.is_active ? 'Yes' : 'No'}`);
        console.log(`  Created: ${device.created_at}`);
        console.log();
      });
    }

    // Check CCTVChannels
    console.log('='.repeat(60));
    console.log('CCTV CHANNELS:');
    console.log('='.repeat(60));
    const channelsResult = await sql.query`
      SELECT 
        c.device_id,
        d.name as device_name,
        COUNT(*) as channel_count
      FROM CCTVChannels c
      JOIN CCTVDevices d ON c.device_id = d.id
      GROUP BY c.device_id, d.name
    `;
    
    if (channelsResult.recordset.length === 0) {
      console.log('❌ No channels found in CCTVChannels table');
    } else {
      console.log(`✅ Found channels for ${channelsResult.recordset.length} device(s):\n`);
      channelsResult.recordset.forEach((item) => {
        console.log(`  ${item.device_name}: ${item.channel_count} channels`);
      });
    }

    // Check CCTVStorage
    console.log('\n' + '='.repeat(60));
    console.log('CCTV STORAGE:');
    console.log('='.repeat(60));
    const storageResult = await sql.query`
      SELECT 
        s.device_id,
        d.name as device_name,
        COUNT(*) as storage_count
      FROM CCTVStorage s
      JOIN CCTVDevices d ON s.device_id = d.id
      GROUP BY s.device_id, d.name
    `;
    
    if (storageResult.recordset.length === 0) {
      console.log('❌ No storage found in CCTVStorage table');
    } else {
      console.log(`✅ Found storage for ${storageResult.recordset.length} device(s):\n`);
      storageResult.recordset.forEach((item) => {
        console.log(`  ${item.device_name}: ${item.storage_count} storage device(s)`);
      });
    }

    // Dashboard query test
    console.log('\n' + '='.repeat(60));
    console.log('DASHBOARD STATS:');
    console.log('='.repeat(60));
    const dashboardResult = await sql.query`
      SELECT 
        COUNT(*) as total_devices,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_devices,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_devices,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_devices
      FROM CCTVDevices WHERE is_active = 1
    `;
    
    const stats = dashboardResult.recordset[0];
    console.log(`Total Devices: ${stats.total_devices}`);
    console.log(`Online: ${stats.online_devices}`);
    console.log(`Offline: ${stats.offline_devices}`);
    console.log(`Error: ${stats.error_devices}`);

    console.log('\n' + '='.repeat(60));
    
    await sql.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkCCTVData();
