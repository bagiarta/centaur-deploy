require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS, // menggunakan DB_PASS sesuai .env
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function checkKeywords() {
  try {
    console.log('🔍 Checking assistant keywords in database...\n');
    await sql.connect(dbConfig);
    
    // Get all keywords
    const result = await sql.query(`
      SELECT 
        keyword, 
        description,
        action_type,
        target_host,
        requires_admin, 
        requires_confirmation, 
        is_enabled,
        created_at
      FROM AssistantKeywords 
      ORDER BY keyword ASC
    `);
    
    if (result.recordset.length === 0) {
      console.log('❌ Tidak ada keyword yang terdaftar di database.');
      console.log('');
      console.log('💡 Untuk membuat keyword baru:');
      console.log('   1. Buka aplikasi web');
      console.log('   2. Login sebagai admin');
      console.log('   3. Buka halaman Settings');
      console.log('   4. Scroll ke "AI Assistant Keyword Manager"');
      console.log('   5. Klik "Add New Keyword"');
    } else {
      console.log(`📊 Ditemukan ${result.recordset.length} keyword:\n`);
      console.log('='.repeat(80));
      
      result.recordset.forEach((kw, index) => {
        console.log(`${index + 1}. 🔑 Keyword: ${kw.keyword}`);
        console.log(`   📝 Description: ${kw.description || 'No description'}`);
        console.log(`   🔧 Type: ${kw.action_type}`);
        console.log(`   🖥️  Target Host: ${kw.target_host || 'Dynamic (runtime)'}`);
        console.log(`   👤 Admin Only: ${kw.requires_admin ? '✅ YES' : '❌ NO'}`);
        console.log(`   ✋ Needs Confirmation: ${kw.requires_confirmation ? '✅ YES' : '❌ NO'}`);
        console.log(`   🟢 Status: ${kw.is_enabled ? '✅ ENABLED' : '❌ DISABLED'}`);
        console.log(`   📅 Created: ${new Date(kw.created_at).toLocaleString('id-ID')}`);
        console.log('-'.repeat(80));
      });
      
      // Check for LICENSE specifically
      const licenseKeywords = result.recordset.filter(kw => 
        kw.keyword.toLowerCase().includes('license')
      );
      
      if (licenseKeywords.length > 0) {
        console.log('\n🔐 LICENSE KEYWORDS FOUND:');
        licenseKeywords.forEach(kw => {
          console.log(`   - ${kw.keyword}: Admin Only = ${kw.requires_admin ? 'YES' : 'NO'}`);
        });
      } else {
        console.log('\n❌ Tidak ada keyword LICENSE yang ditemukan.');
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sql.close();
  }
}

checkKeywords();