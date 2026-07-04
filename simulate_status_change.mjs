import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
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
    min: 2,
    idleTimeoutMillis: 30000
  }
};

async function simulateStatusChange() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log('✅ Connected to database');
    
    // Get first online device
    const deviceResult = await pool.request().query(`
      SELECT TOP 1 id, name, ip_address, status 
      FROM CCTVDevices 
      WHERE is_active = 1 AND status = 'online'
      ORDER BY name
    `);
    
    if (deviceResult.recordset.length === 0) {
      console.log('❌ No online devices found for simulation');
      process.exit(0);
    }
    
    const device = deviceResult.recordset[0];
    console.log(`\n📍 Selected device: ${device.name} (${device.ip_address})`);
    console.log(`   Current status: ${device.status}`);
    
    // Simulate offline
    console.log('\n🔴 Step 1: Setting device to OFFLINE...');
    await pool.request()
      .input('id', sql.NVarChar, device.id)
      .query(`UPDATE CCTVDevices SET status = 'offline' WHERE id = @id`);
    console.log('✅ Device set to offline');
    
    // Wait 2 seconds
    console.log('\n⏳ Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate back online
    console.log('\n🟢 Step 2: Setting device back to ONLINE...');
    await pool.request()
      .input('id', sql.NVarChar, device.id)
      .query(`UPDATE CCTVDevices SET status = 'online' WHERE id = @id`);
    console.log('✅ Device set to online');
    
    // Simulate channel offline
    console.log('\n🟡 Step 3: Setting 2 channels to OFFLINE...');
    await pool.request()
      .input('device_id', sql.NVarChar, device.id)
      .query(`
        UPDATE TOP(2) CCTVChannels 
        SET status = 'offline' 
        WHERE device_id = @device_id AND status = 'online' AND is_enabled = 1
      `);
    console.log('✅ Channels set to offline');
    
    // Wait 2 seconds
    console.log('\n⏳ Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Restore channels
    console.log('\n🟢 Step 4: Restoring channels to ONLINE...');
    await pool.request()
      .input('device_id', sql.NVarChar, device.id)
      .query(`
        UPDATE CCTVChannels 
        SET status = 'online' 
        WHERE device_id = @device_id AND status = 'offline'
      `);
    console.log('✅ Channels restored');
    
    console.log('\n✅ Simulation complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. Wait for the next polling cycle (every 5 minutes)');
    console.log('   2. Or run: node trigger_manual_poll.mjs');
    console.log('   3. Check Discord for consolidated notification');
    
    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

simulateStatusChange();
