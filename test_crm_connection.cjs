require('dotenv').config();
const sql = require('mssql');

async function testCRM() {
  const config = {
    user: process.env.CRM_DB_USER || 'sa',
    password: process.env.CRM_DB_PASS || process.env.DB_PASS,
    server: process.env.CRM_DB_SERVER || '192.168.85.55',
    database: process.env.CRM_DB_NAME || 'DBWH_8555',
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 30000
  };
  
  console.log('Testing CRM connection...');
  console.log('Server:', config.server);
  console.log('Database:', config.database);
  console.log('User:', config.user);
  
  try {
    await sql.connect(config);
    console.log('✅ Connected!');
    
    const result = await sql.query`SELECT TOP 5 ORG_CD, ORG_NAME FROM DimStore WHERE ORG_STATUS = 'O' ORDER BY ORG_CD`;
    console.log(`Found ${result.recordset.length} locations:`);
    result.recordset.forEach(loc => console.log(`  ${loc.ORG_CD}: ${loc.ORG_NAME}`));
    
    await sql.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

testCRM();
