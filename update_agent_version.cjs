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

async function updateVersion() {
    try {
        const pool = await sql.connect(config);
        await pool.request()
            .input('v', sql.NVarChar, '2.7.2')
            .query("UPDATE SystemConfigs SET [value] = @v WHERE [key] = 'LATEST_AGENT_VERSION'");
        console.log("LATEST_AGENT_VERSION successfully updated to 2.7.2");
        process.exit(0);
    } catch (err) {
        console.error("Update Error:", err.message);
        process.exit(1);
    }
}

updateVersion();
