require('dotenv').config();
const sql = require('mssql');

const mainConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
    connectionTimeout: 5000
};

async function test() {
    console.log("START");
    try {
        console.log("Connecting...");
        const mainPool = await sql.connect(mainConfig);
        console.log("Connected.");
        const res = await mainPool.request().query("SELECT 1 as val");
        console.log("Query Result:", res.recordset);
        await mainPool.close();
        console.log("Closed.");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

test();
