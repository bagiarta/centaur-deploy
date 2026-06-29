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

async function checkUsers() {
  try {
    await sql.connect(dbConfig);
    
    const result = await sql.query(`
      SELECT u.id, u.username, u.full_name, r.is_admin, r.name as role_name
      FROM Users u
      LEFT JOIN Roles r ON u.role_id = r.id
      ORDER BY u.username
    `);
    
    console.log('👥 Users in database:');
    console.log('='.repeat(60));
    
    result.recordset.forEach((user, i) => {
      console.log(`${i+1}. 👤 ${user.username} (${user.full_name || 'No name'})`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.role_name || 'No role'}`);
      console.log(`   Admin: ${user.is_admin ? 'YES' : 'NO'}`);
      console.log('-'.repeat(40));
    });
    
    const nonAdmins = result.recordset.filter(u => !u.is_admin);
    const admins = result.recordset.filter(u => u.is_admin);
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total Users: ${result.recordset.length}`);
    console.log(`   Admins: ${admins.length}`);
    console.log(`   Non-admins: ${nonAdmins.length}`);
    
    if (nonAdmins.length > 0) {
      console.log(`\n💡 Test dapat menggunakan user non-admin:`);
      console.log(`   Username: ${nonAdmins[0].username}`);
      console.log(`   ID: ${nonAdmins[0].id}`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sql.close();
  }
}

checkUsers();