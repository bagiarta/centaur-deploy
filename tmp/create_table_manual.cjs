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
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'NotificationSettings')
            BEGIN
                CREATE TABLE NotificationSettings (
                    id NVARCHAR(150) PRIMARY KEY,
                    webhook_url NVARCHAR(1000),
                    whatsapp_token NVARCHAR(255),
                    whatsapp_target NVARCHAR(255),
                    whatsapp_group NVARCHAR(255),
                    alert_offline BIT DEFAULT 1,
                    alert_deployment_success BIT DEFAULT 0,
                    alert_deployment_failed BIT DEFAULT 1,
                    offline_timeout_mins INT DEFAULT 30
                )
            END
        `;
        
        console.log("Attempting to create NotificationSettings...");
        await pool.request().query(query);
        console.log("Query executed.");

        const res = await pool.request().query("SELECT * FROM sys.tables WHERE name = 'NotificationSettings'");
        console.log("Table exists now:", res.recordset.length > 0);

        await pool.close();
    } catch (err) {
        console.error("DB Operation Failed:", err.message);
    }
}

check();
