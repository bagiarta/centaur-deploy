const sql = require('mssql');
require('dotenv').config();

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

async function migrate() {
  try {
    const pool = await sql.connect(config);
    console.log('Connected to DB');
    
    // Add assigned_to to TroubleTickets
    await pool.request().query("IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TroubleTickets' AND COLUMN_NAME = 'assigned_to') ALTER TABLE TroubleTickets ADD assigned_to NVARCHAR(100)");
    console.log('Column assigned_to added to TroubleTickets');
    
    // Check if TicketLogs needs updates? No, it's generic enough.
    
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
