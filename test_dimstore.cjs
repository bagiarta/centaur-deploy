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

async function testDimStore() {
  try {
    await sql.connect(config);
    console.log('✅ Connected to', process.env.DB_NAME);
    
    // Test 1: Check current database
    const currentDb = await sql.query`SELECT DB_NAME() as current_db`;
    console.log('Current DB:', currentDb.recordset[0].current_db);
    
    // Test 2: List all databases
    console.log('\nAvailable databases:');
    const databases = await sql.query`SELECT name FROM sys.databases WHERE name LIKE 'DBWH%' ORDER BY name`;
    databases.recordset.forEach(db => console.log('  -', db.name));
    
    // Test 3: Try to access DBWH_8555
    console.log('\nTrying DBWH_8555.dbo.DimStore...');
    try {
      const result = await sql.query`
        SELECT TOP 5 ORG_CD, ORG_NAME, ORG_STATUS 
        FROM DBWH_8555.dbo.DimStore 
        WHERE ORG_STATUS = 'O'
        ORDER BY ORG_CD
      `;
      console.log('✅ SUCCESS! Found', result.recordset.length, 'locations');
      result.recordset.forEach(loc => {
        console.log(`  ${loc.ORG_CD}: ${loc.ORG_NAME}`);
      });
    } catch (err) {
      console.log('❌ FAILED:', err.message);
      
      // Test 4: Try without cross-database (maybe same server different instance?)
      console.log('\nTrying to switch database...');
      try {
        await sql.query`USE DBWH_8555`;
        const result2 = await sql.query`SELECT TOP 5 ORG_CD, ORG_NAME FROM DimStore WHERE ORG_STATUS = 'O'`;
        console.log('✅ SUCCESS! Found', result2.recordset.length, 'locations');
      } catch (err2) {
        console.log('❌ FAILED:', err2.message);
      }
    }
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testDimStore();
