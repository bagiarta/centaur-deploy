const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASS || 'R3S1K0_g4j1',
    server: process.env.DB_SERVER || '192.168.85.29',
    database: process.env.DB_NAME || 'DBWH_8529',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function checkTables() {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('Devices', 'DeviceSoftware')");
        console.log("Tables found:", result.recordset.map(r => r.TABLE_NAME));
        
        if (!result.recordset.some(r => r.TABLE_NAME === 'DeviceSoftware')) {
            console.log("CRITICAL: DeviceSoftware table is MISSING!");
        } else {
            const columns = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DeviceSoftware'");
            console.log("Columns in DeviceSoftware:", columns.recordset.map(r => r.COLUMN_NAME));
        }

        const devCount = await pool.request().query("SELECT COUNT(*) as count FROM Devices WHERE last_seen > DATEADD(minute, -10, GETDATE())");
        console.log("Devices active in last 10 mins:", devCount.recordset[0].count);

        process.exit(0);
    } catch (err) {
        console.error("DB Error:", err.message);
        process.exit(1);
    }
}

checkTables();
