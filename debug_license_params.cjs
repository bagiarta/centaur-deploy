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

async function debugLicenseParams() {
  try {
    await sql.connect(dbConfig);
    
    // Get LICENSE keyword details
    const result = await sql.query(`
      SELECT 
        keyword, 
        action_type,
        parameter_keys,
        script_text,
        target_host,
        requires_admin,
        is_enabled
      FROM AssistantKeywords 
      WHERE keyword = 'LICENSE'
    `);
    
    if (result.recordset.length > 0) {
      const license = result.recordset[0];
      
      console.log('🔍 DEBUG KEYWORD LICENSE');
      console.log('='.repeat(50));
      console.log(`Keyword: ${license.keyword}`);
      console.log(`Type: ${license.action_type}`);
      console.log(`Target Host: ${license.target_host}`);
      console.log(`Admin Only: ${license.requires_admin ? 'YES' : 'NO'}`);
      console.log(`Enabled: ${license.is_enabled ? 'YES' : 'NO'}`);
      console.log('');
      
      console.log('📋 Parameter Keys (raw from DB):');
      console.log(`"${license.parameter_keys}"`);
      console.log('');
      
      // Try to parse parameter_keys
      let parsedParams = [];
      try {
        if (license.parameter_keys) {
          if (typeof license.parameter_keys === 'string') {
            if (license.parameter_keys.startsWith('[')) {
              // JSON array
              parsedParams = JSON.parse(license.parameter_keys);
            } else {
              // CSV string  
              parsedParams = license.parameter_keys.split(',').map(p => p.trim()).filter(Boolean);
            }
          } else if (Array.isArray(license.parameter_keys)) {
            parsedParams = license.parameter_keys;
          }
        }
      } catch (e) {
        console.log('❌ Error parsing parameter_keys:', e.message);
      }
      
      console.log('🔧 Parsed Parameters:');
      console.log(parsedParams);
      console.log('');
      
      console.log('📜 Script Text:');
      console.log(license.script_text);
      console.log('');
      
      // Simulate parameter parsing like in the server
      console.log('🧪 SIMULATION TEST:');
      console.log('User input: "license store=046"');
      
      const testInput = "store=046";
      const args = {};
      const regex = /(\w+)=("([^"]*)"|'([^']*)'|[^\s]+)/g;
      let match;
      
      while ((match = regex.exec(testInput)) !== null) {
        const key = match[1];
        const value = match[3] ?? match[4] ?? match[2] ?? '';
        args[key] = value.replace(/^['"]|['"]$/g, '');
      }
      
      console.log('Parsed args:', args);
      
      const missingParameters = parsedParams.filter((key) => args[key] === undefined);
      console.log('Missing parameters:', missingParameters);
      
      if (missingParameters.length > 0) {
        console.log('');
        console.log('❌ MASALAH DITEMUKAN!');
        console.log(`   Expected parameters: [${parsedParams.join(', ')}]`);
        console.log(`   User provided: [${Object.keys(args).join(', ')}]`);
        console.log(`   Missing: [${missingParameters.join(', ')}]`);
        
        // Check case sensitivity
        const lowercaseArgs = {};
        Object.keys(args).forEach(k => {
          lowercaseArgs[k.toLowerCase()] = args[k];
        });
        
        const caseInsensitiveMatch = parsedParams.some(param => 
          lowercaseArgs[param.toLowerCase()] !== undefined
        );
        
        if (caseInsensitiveMatch) {
          console.log('');
          console.log('💡 KEMUNGKINAN PENYEBAB: Case sensitivity issue');
          console.log('   Parameter names harus exact match (case-sensitive)');
        }
      } else {
        console.log('');
        console.log('✅ All parameters provided correctly');
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

debugLicenseParams();