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

async function checkSchema() {
  try {
    await sql.connect(config);
    console.log('Connected to database\n');

    // Check CCTVDevices columns
    console.log('='.repeat(60));
    console.log('CCTVDevices COLUMNS:');
    console.log('='.repeat(60));
    const devicesColumns = await sql.query`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CCTVDevices'
      ORDER BY ORDINAL_POSITION
    `;
    console.table(devicesColumns.recordset);

    // Check CCTVChannels columns
    console.log('\n' + '='.repeat(60));
    console.log('CCTVChannels COLUMNS:');
    console.log('='.repeat(60));
    const channelsColumns = await sql.query`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CCTVChannels'
      ORDER BY ORDINAL_POSITION
    `;
    
    if (channelsColumns.recordset.length > 0) {
      console.table(channelsColumns.recordset);
    } else {
      console.log('❌ CCTVChannels table does not exist!');
    }

    // Check CCTVStorage columns
    console.log('\n' + '='.repeat(60));
    console.log('CCTVStorage COLUMNS:');
    console.log('='.repeat(60));
    const storageColumns = await sql.query`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CCTVStorage'
      ORDER BY ORDINAL_POSITION
    `;
    
    if (storageColumns.recordset.length > 0) {
      console.table(storageColumns.recordset);
    } else {
      console.log('❌ CCTVStorage table does not exist!');
    }

    await sql.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkSchema();
