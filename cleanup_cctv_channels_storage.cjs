// Cleanup CCTV channels and storage - remove duplicates and orphaned data
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
};

async function cleanupChannelsAndStorage() {
  try {
    await sql.connect(config);
    console.log('✅ Connected to database\n');

    // ============================================================
    // 1. CHECK CURRENT STATE
    // ============================================================
    console.log('='.repeat(60));
    console.log('CURRENT STATE:');
    console.log('='.repeat(60));
    
    const deviceCount = await sql.query`
      SELECT COUNT(*) as total FROM CCTVDevices WHERE is_active = 1
    `;
    
    const channelCount = await sql.query`
      SELECT COUNT(*) as total FROM CCTVChannels WHERE is_enabled = 1
    `;
    
    const storageCount = await sql.query`
      SELECT COUNT(*) as total FROM CCTVStorage
    `;
    
    console.log(`Active Devices: ${deviceCount.recordset[0].total}`);
    console.log(`Active Channels: ${channelCount.recordset[0].total}`);
    console.log(`Storage Records: ${storageCount.recordset[0].total}\n`);

    // ============================================================
    // 2. FIND ORPHANED CHANNELS (device_id not exists or inactive)
    // ============================================================
    console.log('='.repeat(60));
    console.log('CHECKING ORPHANED CHANNELS:');
    console.log('='.repeat(60));
    
    const orphanedChannels = await sql.query`
      SELECT c.id, c.device_id, c.channel_number, c.channel_name
      FROM CCTVChannels c
      LEFT JOIN CCTVDevices d ON c.device_id = d.id AND d.is_active = 1
      WHERE d.id IS NULL AND c.is_enabled = 1
    `;
    
    if (orphanedChannels.recordset.length > 0) {
      console.log(`❌ Found ${orphanedChannels.recordset.length} orphaned channels:\n`);
      
      orphanedChannels.recordset.forEach(ch => {
        console.log(`  Channel: ${ch.channel_name} (${ch.id})`);
        console.log(`    Device ID: ${ch.device_id} (not found or inactive)\n`);
      });
      
      // Disable orphaned channels
      console.log('🧹 Disabling orphaned channels...');
      await sql.query`
        UPDATE CCTVChannels 
        SET is_enabled = 0, updated_at = GETDATE()
        WHERE id IN (
          SELECT c.id
          FROM CCTVChannels c
          LEFT JOIN CCTVDevices d ON c.device_id = d.id AND d.is_active = 1
          WHERE d.id IS NULL AND c.is_enabled = 1
        )
      `;
      console.log('✅ Orphaned channels disabled\n');
    } else {
      console.log('✅ No orphaned channels found\n');
    }

    // ============================================================
    // 3. FIND ORPHANED STORAGE
    // ============================================================
    console.log('='.repeat(60));
    console.log('CHECKING ORPHANED STORAGE:');
    console.log('='.repeat(60));
    
    const orphanedStorage = await sql.query`
      SELECT s.id, s.device_id, s.disk_number, s.disk_name
      FROM CCTVStorage s
      LEFT JOIN CCTVDevices d ON s.device_id = d.id AND d.is_active = 1
      WHERE d.id IS NULL
    `;
    
    if (orphanedStorage.recordset.length > 0) {
      console.log(`❌ Found ${orphanedStorage.recordset.length} orphaned storage records:\n`);
      
      orphanedStorage.recordset.forEach(st => {
        console.log(`  Storage: ${st.disk_name} (${st.id})`);
        console.log(`    Device ID: ${st.device_id} (not found or inactive)\n`);
      });
      
      // Delete orphaned storage
      console.log('🧹 Deleting orphaned storage...');
      await sql.query`
        DELETE FROM CCTVStorage 
        WHERE id IN (
          SELECT s.id
          FROM CCTVStorage s
          LEFT JOIN CCTVDevices d ON s.device_id = d.id AND d.is_active = 1
          WHERE d.id IS NULL
        )
      `;
      console.log('✅ Orphaned storage deleted\n');
    } else {
      console.log('✅ No orphaned storage found\n');
    }

    // ============================================================
    // 4. FIND DUPLICATE CHANNELS (same device + channel_number)
    // ============================================================
    console.log('='.repeat(60));
    console.log('CHECKING DUPLICATE CHANNELS:');
    console.log('='.repeat(60));
    
    const duplicateChannels = await sql.query`
      SELECT device_id, channel_number, COUNT(*) as count
      FROM CCTVChannels
      WHERE is_enabled = 1
      GROUP BY device_id, channel_number
      HAVING COUNT(*) > 1
    `;
    
    if (duplicateChannels.recordset.length > 0) {
      console.log(`❌ Found ${duplicateChannels.recordset.length} duplicate channel groups:\n`);
      
      for (const dup of duplicateChannels.recordset) {
        const channels = await sql.query`
          SELECT id, channel_name, created_at
          FROM CCTVChannels
          WHERE device_id = ${dup.device_id} 
            AND channel_number = ${dup.channel_number}
            AND is_enabled = 1
          ORDER BY created_at DESC
        `;
        
        console.log(`Device: ${dup.device_id}, Channel: ${dup.channel_number} → ${dup.count} duplicates`);
        
        // Keep first (latest), disable others
        for (let i = 1; i < channels.recordset.length; i++) {
          const ch = channels.recordset[i];
          console.log(`  ❌ Disabling: ${ch.id} - ${ch.channel_name}`);
          
          await sql.query`
            UPDATE CCTVChannels 
            SET is_enabled = 0, updated_at = GETDATE()
            WHERE id = ${ch.id}
          `;
        }
        
        const keeper = channels.recordset[0];
        console.log(`  ✅ Keeping: ${keeper.id} - ${keeper.channel_name}\n`);
      }
      
      console.log('✅ Duplicate channels cleaned\n');
    } else {
      console.log('✅ No duplicate channels found\n');
    }

    // ============================================================
    // 5. FIND DUPLICATE STORAGE (same device + disk_number)
    // ============================================================
    console.log('='.repeat(60));
    console.log('CHECKING DUPLICATE STORAGE:');
    console.log('='.repeat(60));
    
    const duplicateStorage = await sql.query`
      SELECT device_id, disk_number, COUNT(*) as count
      FROM CCTVStorage
      GROUP BY device_id, disk_number
      HAVING COUNT(*) > 1
    `;
    
    if (duplicateStorage.recordset.length > 0) {
      console.log(`❌ Found ${duplicateStorage.recordset.length} duplicate storage groups:\n`);
      
      for (const dup of duplicateStorage.recordset) {
        const storages = await sql.query`
          SELECT id, disk_name, created_at
          FROM CCTVStorage
          WHERE device_id = ${dup.device_id} 
            AND disk_number = ${dup.disk_number}
          ORDER BY created_at DESC
        `;
        
        console.log(`Device: ${dup.device_id}, Disk: ${dup.disk_number} → ${dup.count} duplicates`);
        
        // Keep first (latest), delete others
        for (let i = 1; i < storages.recordset.length; i++) {
          const st = storages.recordset[i];
          console.log(`  ❌ Deleting: ${st.id} - ${st.disk_name}`);
          
          await sql.query`DELETE FROM CCTVStorage WHERE id = ${st.id}`;
        }
        
        const keeper = storages.recordset[0];
        console.log(`  ✅ Keeping: ${keeper.id} - ${keeper.disk_name}\n`);
      }
      
      console.log('✅ Duplicate storage cleaned\n');
    } else {
      console.log('✅ No duplicate storage found\n');
    }

    // ============================================================
    // 6. CREATE UNIQUE CONSTRAINTS
    // ============================================================
    console.log('='.repeat(60));
    console.log('CREATING UNIQUE CONSTRAINTS:');
    console.log('='.repeat(60));
    
    // Unique constraint for Channels
    try {
      const channelConstraintCheck = await sql.query`
        SELECT name FROM sys.indexes 
        WHERE name = 'UQ_CCTVChannels_DeviceChannel' 
        AND object_id = OBJECT_ID('CCTVChannels')
      `;
      
      if (channelConstraintCheck.recordset.length > 0) {
        console.log('⚠️ Channel constraint exists, dropping first...');
        await sql.query`DROP INDEX UQ_CCTVChannels_DeviceChannel ON CCTVChannels`;
      }
      
      await sql.query`
        CREATE UNIQUE NONCLUSTERED INDEX UQ_CCTVChannels_DeviceChannel 
        ON CCTVChannels(device_id, channel_number)
        WHERE is_enabled = 1
      `;
      console.log('✅ Unique constraint created: CCTVChannels(device_id, channel_number)');
    } catch (err) {
      console.log('⚠️ Channel constraint error:', err.message);
    }
    
    // Unique constraint for Storage
    try {
      const storageConstraintCheck = await sql.query`
        SELECT name FROM sys.indexes 
        WHERE name = 'UQ_CCTVStorage_DeviceDisk' 
        AND object_id = OBJECT_ID('CCTVStorage')
      `;
      
      if (storageConstraintCheck.recordset.length > 0) {
        console.log('⚠️ Storage constraint exists, dropping first...');
        await sql.query`DROP INDEX UQ_CCTVStorage_DeviceDisk ON CCTVStorage`;
      }
      
      await sql.query`
        CREATE UNIQUE NONCLUSTERED INDEX UQ_CCTVStorage_DeviceDisk 
        ON CCTVStorage(device_id, disk_number)
      `;
      console.log('✅ Unique constraint created: CCTVStorage(device_id, disk_number)\n');
    } catch (err) {
      console.log('⚠️ Storage constraint error:', err.message, '\n');
    }

    // ============================================================
    // 7. FINAL STATE
    // ============================================================
    console.log('='.repeat(60));
    console.log('FINAL STATE:');
    console.log('='.repeat(60));
    
    const finalDevices = await sql.query`
      SELECT id, name, ip_address FROM CCTVDevices WHERE is_active = 1
    `;
    
    console.log(`\n✅ Active Devices: ${finalDevices.recordset.length}\n`);
    
    for (const device of finalDevices.recordset) {
      console.log(`Device: ${device.name} (${device.ip_address})`);
      
      const deviceChannels = await sql.query`
        SELECT COUNT(*) as count 
        FROM CCTVChannels 
        WHERE device_id = ${device.id} AND is_enabled = 1
      `;
      
      const deviceStorage = await sql.query`
        SELECT COUNT(*) as count 
        FROM CCTVStorage 
        WHERE device_id = ${device.id}
      `;
      
      console.log(`  Channels: ${deviceChannels.recordset[0].count}`);
      console.log(`  Storage: ${deviceStorage.recordset[0].count}\n`);
    }
    
    const totalChannels = await sql.query`
      SELECT COUNT(*) as total FROM CCTVChannels WHERE is_enabled = 1
    `;
    const totalStorage = await sql.query`
      SELECT COUNT(*) as total FROM CCTVStorage
    `;
    
    console.log('Summary:');
    console.log(`  Total Active Channels: ${totalChannels.recordset[0].total}`);
    console.log(`  Total Storage: ${totalStorage.recordset[0].total}`);

    await sql.close();
    console.log('\n✅ Cleanup completed successfully!');
    process.exit(0);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
    process.exit(1);
  }
}

cleanupChannelsAndStorage();
