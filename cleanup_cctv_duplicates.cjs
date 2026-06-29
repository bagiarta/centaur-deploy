// Cleanup CCTV duplicate devices and add unique constraint on IP
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

async function cleanupDuplicates() {
  try {
    await sql.connect(config);
    console.log('✅ Connected to database\n');

    // 1. Show current duplicates
    console.log('='.repeat(60));
    console.log('CHECKING FOR DUPLICATES (by IP Address):');
    console.log('='.repeat(60));
    
    const duplicates = await sql.query`
      SELECT 
        ip_address, 
        COUNT(*) as count,
        STRING_AGG(id, ', ') as device_ids
      FROM CCTVDevices
      WHERE is_active = 1
      GROUP BY ip_address
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.recordset.length > 0) {
      console.log(`\n❌ Found ${duplicates.recordset.length} duplicate IP address(es):\n`);
      duplicates.recordset.forEach(dup => {
        console.log(`IP: ${dup.ip_address} → ${dup.count} devices`);
        console.log(`   IDs: ${dup.device_ids}\n`);
      });

      // 2. Keep only the latest device for each IP (highest created_at)
      console.log('🧹 Cleaning up duplicates (keeping latest device only)...\n');
      
      for (const dup of duplicates.recordset) {
        const devices = await sql.query`
          SELECT id, name, created_at, ip_address
          FROM CCTVDevices
          WHERE ip_address = ${dup.ip_address} AND is_active = 1
          ORDER BY created_at DESC
        `;
        
        console.log(`Processing IP: ${dup.ip_address}`);
        
        // Keep first (latest), deactivate others
        for (let i = 1; i < devices.recordset.length; i++) {
          const device = devices.recordset[i];
          console.log(`  ❌ Deactivating: ${device.id} (${device.name}) - Created: ${device.created_at}`);
          
          await sql.query`
            UPDATE CCTVDevices 
            SET is_active = 0, 
                updated_at = GETDATE()
            WHERE id = ${device.id}
          `;
          
          // Also clean up related channels and storage
          await sql.query`UPDATE CCTVChannels SET is_enabled = 0 WHERE device_id = ${device.id}`;
          await sql.query`DELETE FROM CCTVStorage WHERE device_id = ${device.id}`;
        }
        
        const keeper = devices.recordset[0];
        console.log(`  ✅ Keeping: ${keeper.id} (${keeper.name}) - Created: ${keeper.created_at}\n`);
      }
      
      console.log('✅ Cleanup complete!\n');
    } else {
      console.log('✅ No duplicates found!\n');
    }

    // 3. Add unique constraint on ip_address
    console.log('='.repeat(60));
    console.log('ADDING UNIQUE CONSTRAINT ON IP ADDRESS:');
    console.log('='.repeat(60));
    
    try {
      // Check if constraint already exists
      const constraintCheck = await sql.query`
        SELECT name 
        FROM sys.indexes 
        WHERE name = 'UQ_CCTVDevices_IP' 
        AND object_id = OBJECT_ID('CCTVDevices')
      `;
      
      if (constraintCheck.recordset.length > 0) {
        console.log('⚠️ Unique constraint already exists, dropping first...');
        await sql.query`DROP INDEX UQ_CCTVDevices_IP ON CCTVDevices`;
      }
      
      // Create unique filtered index (only for active devices)
      await sql.query`
        CREATE UNIQUE NONCLUSTERED INDEX UQ_CCTVDevices_IP 
        ON CCTVDevices(ip_address)
        WHERE is_active = 1
      `;
      
      console.log('✅ Unique constraint created: ip_address must be unique for active devices\n');
    } catch (err) {
      if (err.message.includes('duplicate key')) {
        console.log('❌ Cannot create unique constraint - duplicates still exist!');
        console.log('   Please run this script again to clean remaining duplicates.\n');
      } else {
        console.log('⚠️ Constraint creation warning:', err.message, '\n');
      }
    }

    // 4. Show final state
    console.log('='.repeat(60));
    console.log('FINAL STATE:');
    console.log('='.repeat(60));
    
    const finalCount = await sql.query`
      SELECT 
        COUNT(*) as total_active,
        COUNT(DISTINCT ip_address) as unique_ips
      FROM CCTVDevices
      WHERE is_active = 1
    `;
    
    const stats = finalCount.recordset[0];
    console.log(`Total active devices: ${stats.total_active}`);
    console.log(`Unique IP addresses: ${stats.unique_ips}`);
    
    if (stats.total_active === stats.unique_ips) {
      console.log('✅ All devices have unique IP addresses!\n');
    } else {
      console.log('⚠️ Warning: Still have duplicates!\n');
    }
    
    // Show all active devices
    const allDevices = await sql.query`
      SELECT id, name, ip_address, vendor, model, status, created_at
      FROM CCTVDevices
      WHERE is_active = 1
      ORDER BY created_at DESC
    `;
    
    console.log('Active devices:');
    allDevices.recordset.forEach((device, idx) => {
      console.log(`  ${idx + 1}. ${device.name} (${device.ip_address}) - ${device.model || 'N/A'}`);
    });

    await sql.close();
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

cleanupDuplicates();
