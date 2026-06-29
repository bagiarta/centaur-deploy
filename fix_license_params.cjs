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

async function fixLicenseParams() {
  try {
    console.log('🔧 Fixing LICENSE parameter case sensitivity...\n');
    await sql.connect(dbConfig);
    
    // Update parameter from "STORE" to "store"
    const result = await sql.query(`
      UPDATE AssistantKeywords 
      SET parameter_keys = '["store"]',
          updated_at = GETDATE()
      WHERE keyword = 'LICENSE'
    `);
    
    if (result.rowsAffected[0] > 0) {
      console.log('✅ Successfully updated LICENSE parameter from "STORE" to "store"');
      
      // Verify the change
      const verifyResult = await sql.query(`
        SELECT keyword, parameter_keys
        FROM AssistantKeywords 
        WHERE keyword = 'LICENSE'
      `);
      
      console.log('\n📋 Updated LICENSE parameter:');
      const updated = verifyResult.recordset[0];
      console.log(`   Parameter Keys: ${updated.parameter_keys}`);
      
      console.log('\n🎉 Sekarang user bisa menggunakan:');
      console.log('   ✅ license store=046');
      console.log('   ✅ LICENSE store=046');
      console.log('   (parameter "store" dengan huruf kecil)');
      
    } else {
      console.log('❌ No rows were updated');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sql.close();
  }
}

fixLicenseParams();