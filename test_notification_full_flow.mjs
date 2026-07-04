// Full flow test: Initialize -> Change -> Detect -> Notify
import { initDb } from './config/db.js';
import sql from 'mssql';

async function fullFlowTest() {
  console.log('🧪 Full Flow Test: Notification System\n');
  
  try {
    // Step 1: Initialize
    console.log('Step 1: Initializing database...');
    await initDb();
    const { poolPromise } = await import('./config/db.js');
    const pool = await poolPromise;
    console.log('✅ Database ready\n');
    
    // Step 2: Import notification function
    console.log('Step 2: Importing notification function...');
    const { checkAndSendNotifications } = await import('./utils/cctvPollingService.js');
    console.log('✅ Function imported\n');
    
    // Step 3: First run (initialize state)
    console.log('Step 3: First run - Initialize state');
    console.log('='.repeat(80));
    await checkAndSendNotifications();
    console.log('='.repeat(80));
    console.log('✅ State initialized (no notifications expected)\n');
    
    // Step 4: Simulate status change
    console.log('Step 4: Simulating device status change...');
    const testDevice = await pool.request().query(`
      SELECT TOP 1 id, name, status FROM CCTVDevices 
      WHERE is_active = 1 AND status = 'online'
      ORDER BY name
    `);
    
    if (testDevice.recordset.length === 0) {
      throw new Error('No online devices found');
    }
    
    const device = testDevice.recordset[0];
    console.log(`   Selected: ${device.name} (${device.id})`);
    console.log(`   Current status: ${device.status}`);
    
    // Change to offline
    await pool.request()
      .input('id', sql.NVarChar, device.id)
      .query(`UPDATE CCTVDevices SET status = 'offline' WHERE id = @id`);
    console.log(`   ✅ Changed to: offline\n`);
    
    // Step 5: Second run (should detect change)
    console.log('Step 5: Second run - Should detect change and send notification');
    console.log('='.repeat(80));
    await checkAndSendNotifications();
    console.log('='.repeat(80));
    console.log('');
    
    // Step 6: Restore status
    console.log('Step 6: Restoring device status...');
    await pool.request()
      .input('id', sql.NVarChar, device.id)
      .query(`UPDATE CCTVDevices SET status = 'online' WHERE id = @id`);
    console.log(`   ✅ Restored ${device.name} to online\n`);
    
    console.log('✅ TEST COMPLETED SUCCESSFULLY!');
    console.log('📬 Check your Discord channel for the notification!');
    console.log('');
    console.log('Expected notification:');
    console.log(`   🚨 Device Offline: ${device.name}`);
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Test failed!');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

fullFlowTest();
