require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function fixLicenseType() {
  try {
    console.log('🔧 Fixing LICENSE keyword type from query to procedure...\n');
    await sql.connect(dbConfig);
    
    // Get current LICENSE keyword details
    const currentResult = await sql.query(`
      SELECT keyword, action_type, script_text, requires_admin
      FROM AssistantKeywords 
      WHERE keyword = 'LICENSE'
    `);
    
    if (currentResult.recordset.length > 0) {
      const current = currentResult.recordset[0];
      console.log('📋 Current LICENSE keyword:');
      console.log(`   Type: ${current.action_type}`);
      console.log(`   Admin Only: ${current.requires_admin ? 'YES' : 'NO'}`);
      console.log(`   Script: ${current.script_text.substring(0, 100)}...`);
      
      // Update to procedure type
      const result = await sql.query(`
        UPDATE AssistantKeywords 
        SET action_type = 'procedure',
            updated_at = GETDATE()
        WHERE keyword = 'LICENSE'
      `);
      
      if (result.rowsAffected[0] > 0) {
        console.log('\n✅ Successfully updated LICENSE keyword type to "procedure"');
        
        // Verify the change
        const verifyResult = await sql.query(`
          SELECT keyword, action_type, requires_admin, is_enabled
          FROM AssistantKeywords 
          WHERE keyword = 'LICENSE'
        `);
        
        console.log('\n📋 Updated LICENSE keyword:');
        const updated = verifyResult.recordset[0];
        console.log(`   Type: ${updated.action_type}`);
        console.log(`   Admin Only: ${updated.requires_admin ? 'YES' : 'NO'}`);
        console.log(`   Status: ${updated.is_enabled ? 'ENABLED' : 'DISABLED'}`);
        
        console.log('\n🎉 LICENSE keyword sekarang bertipe "procedure"!');
        console.log('   ✅ Non-admin user bisa menjalankannya (karena Admin Only = NO)');
        console.log('   ✅ Tidak dikontrol oleh SQL read-only validation');
        console.log('   ✅ Dikontrol hanya oleh checkbox "Admin Only" di Settings');
        
      } else {
        console.log('❌ No rows were updated');
      }
    } else {
      console.log('❌ LICENSE keyword not found in database');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sql.close();
  }
}

fixLicenseType();