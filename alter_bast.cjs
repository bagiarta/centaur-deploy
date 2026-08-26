require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

async function alterDB() {
  try {
    console.log('Connecting to database...');
    await sql.connect(dbConfig);
    console.log('Adding bast_number to AM_Assignments...');
    
    await sql.query(`
      IF NOT EXISTS (
        SELECT * FROM sys.columns 
        WHERE Name = N'bast_number' AND Object_ID = Object_ID(N'AM_Assignments')
      )
      BEGIN
        ALTER TABLE AM_Assignments ADD bast_number VARCHAR(50) NULL;
      END
    `);
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

alterDB();
