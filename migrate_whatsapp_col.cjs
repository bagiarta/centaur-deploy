const sql = require('mssql');
require('dotenv').config();

async function migrate() {
  try {
    const pool = await sql.connect({
       user: process.env.DB_USER, password: process.env.DB_PASS,
       server: process.env.DB_SERVER, database: process.env.DB_NAME,
       options: { encrypt: false, trustServerCertificate: true }
    });

    console.log("Checking for 'last_whatsapp_alert_at' column...");
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Devices' AND COLUMN_NAME='last_whatsapp_alert_at')
      BEGIN
        ALTER TABLE Devices ADD last_whatsapp_alert_at DATETIME NULL;
        PRINT 'Column added.';
      END
      ELSE
      BEGIN
        PRINT 'Column already exists.';
      END
    `);

    console.log("Migration complete.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

migrate();
