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

async function updateLicenseAdmin() {
  try {
    console.log('🔄 Updating LICENSE keyword to admin-only...\n');
    await sql.connect(dbConfig);
    
    // Update LICENSE keyword to require admin
    const result = await sql.query(`
      UPDATE AssistantKeywords 
      SET requires_admin = 1,
          updated_at = GETDATE()
      WHERE keyword = 'LICENSE'
    `);
    
    if (result.rowsAffected[0] > 0) {
      console.log(`✅ Successfully updated ${result.rowsAffected[0]} keyword(s)`);
      
      // Verify the change
      const verifyResult = await sql.query(`
        SELECT keyword, requires_admin, requires_confirmation, is_enabled
        FROM AssistantKeywords 
        WHERE keyword = 'LICENSE'
      `);
      
      console.log('\n📋 Updated LICENSE keyword status:');
      console.log('=' .repeat(50));
      verifyResult.recordset.forEach(kw => {
        console.log(`🔑 Keyword: ${kw.keyword}`);
        console.log(`👤 Admin Only: ${kw.requires_admin ? '✅ YES' : '❌ NO'}`);
        console.log(`✋ Needs Confirmation: ${kw.requires_confirmation ? '✅ YES' : '❌ NO'}`);
        console.log(`🟢 Status: ${kw.is_enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
      });
      
      console.log('\n🎉 LICENSE keyword sekarang hanya bisa dijalankan oleh administrator!');
      
    } else {
      console.log('❌ No LICENSE keyword found to update');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sql.close();
  }
}

updateLicenseAdmin();