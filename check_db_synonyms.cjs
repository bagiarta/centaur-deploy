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

async function checkSynonyms() {
  try {
    console.log('🔍 Connecting to DBWH_8529...');
    await sql.connect(dbConfig);
    
    console.log('🔍 Checking for Synonyms or Views named "ctr_session_oper"...');
    
    // Check synonyms
    const synonymRes = await sql.query(`
      SELECT name, base_object_name 
      FROM sys.synonyms 
      WHERE name = 'ctr_session_oper'
    `);
    
    // Check views
    const viewRes = await sql.query(`
      SELECT name 
      FROM sys.views 
      WHERE name = 'ctr_session_oper'
    `);
    
    // Check all tables in local DB
    const tableRes = await sql.query(`
      SELECT name 
      FROM sys.tables 
      WHERE name = 'ctr_session_oper'
    `);

    const output = {
      synonyms: synonymRes.recordset,
      views: viewRes.recordset,
      tables: tableRes.recordset
    };

    fs = require('fs');
    fs.writeFileSync('f:/PepiUpdater/centaur-deploy/synonym_check_results.txt', JSON.stringify(output, null, 2), 'utf8');
    console.log('✅ Check complete. Results written to synonym_check_results.txt');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await sql.close();
  }
}

checkSynonyms();
