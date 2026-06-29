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

async function checkAssistantPermissions() {
  try {
    await sql.connect(dbConfig);
    
    // Get user adjie with role permissions
    const result = await sql.query(`
      SELECT u.id, u.username, u.full_name, r.is_admin, r.name as role_name, r.menu_permissions
      FROM Users u
      LEFT JOIN Roles r ON u.role_id = r.id
      WHERE u.username = 'adjie'
    `);
    
    const user = result.recordset[0];
    
    if (user) {
      console.log('👤 User: adjie');
      console.log('='.repeat(40));
      console.log(`   ID: ${user.id}`);
      console.log(`   Full Name: ${user.full_name}`);
      console.log(`   Role: ${user.role_name}`);
      console.log(`   Is Admin: ${user.is_admin ? 'YES' : 'NO'}`);
      console.log(`   Menu Permissions: ${user.menu_permissions || 'NULL'}`);
      
      // Check if has assistant permission
      const perms = user.menu_permissions || '';
      const hasAssistantAccess = user.is_admin || perms === "*" || perms.includes("assistant");
      
      console.log('');
      console.log('🤖 AI Assistant Access Check:');
      console.log(`   Has assistant permission: ${hasAssistantAccess ? 'YES' : 'NO'}`);
      
      if (!hasAssistantAccess) {
        console.log('');
        console.log('❌ MASALAH: User adjie tidak punya akses AI Assistant!');
        console.log('');
        console.log('🔧 SOLUSI: Update role permissions untuk menambah "assistant"');
        
        // Show how to fix
        console.log('');
        console.log('💡 Cara perbaiki:');
        console.log('   1. Login sebagai admin');
        console.log('   2. Buka Settings → Role Management');
        console.log(`   3. Edit role "${user.role_name}"`);
        console.log('   4. Tambahkan "assistant" ke menu permissions');
        console.log('   5. Atau set permissions ke "*" untuk full access');
        
        // Alternative: update directly
        console.log('');
        console.log('🚀 Atau jalankan update langsung:');
        
        await sql.query(`
          UPDATE Roles 
          SET menu_permissions = CASE 
            WHEN menu_permissions IS NULL OR menu_permissions = '' THEN 'assistant'
            WHEN menu_permissions = '*' THEN '*'
            WHEN menu_permissions LIKE '%assistant%' THEN menu_permissions
            ELSE menu_permissions + ',assistant'
          END
          WHERE name = '${user.role_name}'
        `);
        
        console.log(`   ✅ Updated role "${user.role_name}" dengan permission "assistant"`);
        
        // Verify
        const verifyResult = await sql.query(`
          SELECT menu_permissions FROM Roles WHERE name = '${user.role_name}'
        `);
        
        console.log(`   📋 New permissions: ${verifyResult.recordset[0].menu_permissions}`);
        
      } else {
        console.log('');
        console.log('✅ User adjie sudah punya akses AI Assistant');
      }
      
    } else {
      console.log('❌ User adjie tidak ditemukan');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sql.close();
  }
}

checkAssistantPermissions();