const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function check() {
    try {
        let pool = await sql.connect(config);
        console.log("Connected to DB");
        
        const query = `
            IF NOT EXISTS (SELECT * FROM NotificationSettings WHERE id = 'global')
            BEGIN
              INSERT INTO NotificationSettings (id, webhook_url, whatsapp_token, whatsapp_target, whatsapp_group, alert_offline, alert_deployment_success, alert_deployment_failed, offline_timeout_mins)
              VALUES ('global', '', '', '', '', 1, 0, 1, 30)
              console.log("Inserted global row.");
            END
            ELSE
            BEGIN
              console.log("Global row already exists.");
            END
        `;
        // Fixed the console.log in SQL (obviously doesn't work like that)
        
        const checkRow = await pool.request().query("SELECT COUNT(*) as count FROM NotificationSettings WHERE id = 'global'");
        if (checkRow.recordset[0].count === 0) {
            await pool.request().query("INSERT INTO NotificationSettings (id, webhook_url, whatsapp_token, whatsapp_target, whatsapp_group, alert_offline, alert_deployment_success, alert_deployment_failed, offline_timeout_mins) VALUES ('global', '', '', '', '', 1, 0, 1, 30)");
            console.log("Inserted global row.");
        } else {
            console.log("Global row already exists.");
        }

        await pool.close();
    } catch (err) {
        console.error("DB Operation Failed:", err.message);
    }
}

check();
