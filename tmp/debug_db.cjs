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
        
        console.log("\n--- NotificationSettings Schema ---");
        const schema = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'NotificationSettings'
        `);
        console.table(schema.recordset);

        console.log("\n--- NotificationSettings Data ---");
        const data = await pool.request().query("SELECT * FROM NotificationSettings");
        console.table(data.recordset);

        await pool.close();
    } catch (err) {
        console.error("DB Check Failed:", err.message);
    }
}

check();
