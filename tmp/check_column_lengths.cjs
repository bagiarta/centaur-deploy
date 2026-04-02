const sql = require('mssql');
const dotenv = require('dotenv');
const path = require('path');

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

async function checkColumn() {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'AgentJobs' AND COLUMN_NAME = 'ip_range'
    `);
    console.log('AgentJobs.ip_range column info:');
    console.log(JSON.stringify(result.recordset, null, 2));
    
    const result2 = await pool.request().query(`
      SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'AgentInstallTargets' AND COLUMN_NAME = 'log'
    `);
    console.log('AgentInstallTargets.log column info:');
    console.log(JSON.stringify(result2.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkColumn();
