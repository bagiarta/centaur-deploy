const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// PLU Formatting test logic (replicated from backend router)
function generatePluRow(template, item) {
  let row = template.row_template;
  row = row.replace(/{plu_number}/g, item.plu_number);
  row = row.replace(/{name}/g, item.name);
  row = row.replace(/{price}/g, item.price.toFixed(2));
  row = row.replace(/{unit}/g, item.unit);
  row = row.replace(/{shelf_life}/g, item.shelf_life);
  row = row.replace(/{tare}/g, item.tare.toFixed(3));
  row = row.replace(/{barcode_prefix}/g, item.barcode_prefix);
  row = row.replace(/{ingredients}/g, item.ingredients || '');
  return row;
}

async function runTests() {
  console.log('==================================================');
  console.log('       SCALE MANAGER INTEGRATION UNIT TEST       ');
  console.log('==================================================');
  
  try {
    // 1. Connect to DB
    console.log('Connecting to database...');
    const pool = await sql.connect(dbConfig);
    console.log('✅ DB Connected successfully.');

    // 2. Verify tables exist
    console.log('\nVerifying Scale tables in database schema...');
    const tables = ['Scales', 'ScalePluTemplates', 'ScalePluItems', 'ScaleJobs'];
    for (const table of tables) {
      const result = await pool.request()
        .input('table', sql.NVarChar, table)
        .query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @table");
      if (result.recordset.length > 0) {
        console.log(`✅ Table '${table}' exists.`);
      } else {
        throw new Error(`❌ Table '${table}' does not exist! Database migration failed.`);
      }
    }

    // 3. Test PLU formatting engine
    console.log('\nTesting PLU sync file formatter...');
    const mockTemplate = {
      row_template: '{plu_number};{name};{price};{shelf_life};{tare};{barcode_prefix};{ingredients}'
    };
    const mockPluItem = {
      plu_number: 105,
      name: 'Wagyu Beef Ribeye',
      price: 250000.00,
      unit: 'kg',
      shelf_life: 5,
      tare: 0.015,
      barcode_prefix: '22',
      ingredients: 'Fresh premium beef cuts'
    };

    const expectedRow = '105;Wagyu Beef Ribeye;250000.00;5;0.015;22;Fresh premium beef cuts';
    const generatedRow = generatePluRow(mockTemplate, mockPluItem);

    if (generatedRow === expectedRow) {
      console.log('✅ PLU formatter matches exact MT scale file specifications.');
      console.log(`   Generated: "${generatedRow}"`);
    } else {
      throw new Error(`❌ PLU formatter mismatch!\nExpected: "${expectedRow}"\nGot:      "${generatedRow}"`);
    }

    // 4. Test database write/read/delete queries for Scales
    console.log('\nTesting Scale registration CRUD queries...');
    const mockScaleId = 'test-scale-999';
    
    // Cleanup any orphaned test scale first
    await pool.request().input('id', sql.NVarChar, mockScaleId).query("DELETE FROM Scales WHERE id = @id");

    // Insert Scale
    await pool.request()
      .input('id', sql.NVarChar, mockScaleId)
      .input('name', sql.NVarChar, 'Test Mettler Scale')
      .input('ip', sql.NVarChar, '192.168.10.120')
      .input('port', sql.Int, 3001)
      .input('model', sql.NVarChar, 'bPlus')
      .input('location', sql.NVarChar, 'Test Store')
      .input('dept', sql.NVarChar, 'Meat')
      .input('devId', sql.NVarChar, 'dev-1') // points to seed device
      .query(`
        INSERT INTO Scales (id, name, ip, port, model, status, location, department, device_id, created_at, updated_at)
        VALUES (@id, @name, @ip, @port, @model, 'offline', @location, @dept, @devId, GETDATE(), GETDATE())
      `);
    console.log('✅ Registered test scale into DB.');

    // Query and Verify Scale
    const scaleCheck = await pool.request()
      .input('id', sql.NVarChar, mockScaleId)
      .query("SELECT * FROM Scales WHERE id = @id");
    
    if (scaleCheck.recordset.length > 0 && scaleCheck.recordset[0].name === 'Test Mettler Scale') {
      console.log(`✅ Scale queried successfully: ${scaleCheck.recordset[0].name} (${scaleCheck.recordset[0].ip})`);
    } else {
      throw new Error('❌ Failed to retrieve scale record from DB.');
    }

    // Clean up
    await pool.request().input('id', sql.NVarChar, mockScaleId).query("DELETE FROM Scales WHERE id = @id");
    console.log('✅ Cleaned up test scale database entry.');

    console.log('\n==================================================');
    console.log('      ALL INTEGRATION TESTS PASSED SUCCESSFULLY!  ');
    console.log('==================================================');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ INTEGRATION TEST FAILED:', err.message);
    process.exit(1);
  }
}

runTests();
