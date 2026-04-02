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

async function checkUsers() {
  try {
    await sql.connect(dbConfig);
    const result = await sql.query('SELECT * FROM Users');
    console.log('Users in DB:');
    console.log(JSON.stringify(result.recordset, null, 2));
    
    const roles = await sql.query('SELECT * FROM Roles');
    console.log('Roles in DB:');
    console.log(JSON.stringify(roles.recordset, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUsers();
