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
        
        const tablesStr = ['Devices', 'NotificationSettings', 'Users', 'Deployments'];
        for (const t of tablesStr) {
            const res = await pool.request().query(`SELECT * FROM sys.tables WHERE name = '${t}'`);
            console.log(`Table ${t}: ${res.recordset.length > 0 ? 'EXISTS' : 'MISSING'}`);
        }

        await pool.close();
    } catch (err) {
        console.error("DB Check Failed:", err.message);
    }
}

check();
