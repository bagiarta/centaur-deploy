const sql = require('mssql');
require('dotenv').config();

async function init() {
  try {
    const config = {
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      server: process.env.DB_SERVER,
      database: process.env.DB_NAME,
      options: { encrypt: false, trustServerCertificate: true }
    };

    const pool = await sql.connect(config);
    console.log("Initializing alert timestamps to current time to prevent a notification storm...");
    
    // We set the alert timestamps to NOW for all offline devices 
    // This way, the NEXT run will wait 1h for Webhook and 24h for WhatsApp reminders.
    const result = await pool.request().query(`
      UPDATE Devices 
      SET last_offline_alert_at = GETDATE(), 
          last_whatsapp_alert_at = GETDATE() 
      WHERE status = 'offline'
    `);

    console.log(`✅ Success: ${result.rowsAffected[0]} devices initialized.`);
    process.exit(0);
  } catch (err) {
    console.error("Initialization failed:", err.message);
    process.exit(1);
  }
}
init();
