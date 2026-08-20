const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  try {
    const pool = await sql.connect(config);
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WakeupCallCache' AND xtype='U')
      BEGIN
        CREATE TABLE WakeupCallCache (
          card_no VARCHAR(50) PRIMARY KEY,
          member_name NVARCHAR(255),
          total_amount DECIMAL(18,2),
          total_transactions INT,
          last_purchase_date DATETIME,
          last_store VARCHAR(50),
          updated_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_WakeupCallCache_total_amount ON WakeupCallCache(total_amount DESC);
        PRINT 'Table WakeupCallCache created successfully.';
      END
      ELSE
      BEGIN
        PRINT 'Table WakeupCallCache already exists.';
      END
    `);
    console.log("Migration finished.");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
