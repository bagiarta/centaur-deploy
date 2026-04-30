require('dotenv').config();
const sql = require('mssql');

const mainConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true }
};

async function diag() {
    try {
        const mainPool = await sql.connect(mainConfig);
        const targetRes = await mainPool.request().input('hostname', sql.NVarChar, 'HOSERVER').query("SELECT id, ip FROM Devices WHERE hostname = @hostname");
        const deviceId = targetRes.recordset[0].id;
        const deviceIp = targetRes.recordset[0].ip;
        const connRes = await mainPool.request().input('did', sql.NVarChar, deviceId).query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
        const hoConn = connRes.recordset[0];
        
        console.log(`Diagnostic: Connecting to HOSERVER: ${deviceIp} / DB: ${hoConn.db_name} / User: ${hoConn.db_user}`);
        
        const hoConfig = {
            user: hoConn.db_user,
            password: hoConn.db_password,
            server: deviceIp,
            database: hoConn.db_name,
            options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
            port: hoConn.db_port || 1433
        };
        
        await mainPool.close();
        const hoPool = await sql.connect(hoConfig);
        console.log("Connected successfully to HOSERVER!");

        const tablesRes = await hoPool.request().query("SELECT TOP 50 name FROM sys.tables ORDER BY name");
        console.log("\n--- DAFTAR TABEL YANG TERBACA OLEH SCRIPT ---");
        const tableNames = tablesRes.recordset.map(r => r.name);
        console.log(tableNames.join(', '));
        
        if (tableNames.includes('LOYAL_CRM_ITEM_MST')) {
            console.log("\n[SUCCESS] Tabel LOYAL_CRM_ITEM_MST ditemukan di sys.tables!");
        } else {
            console.log("\n[FAILED] Tabel LOYAL_CRM_ITEM_MST TIDAK DITEMUKAN di sys.tables oleh user " + hoConn.db_user);
            console.log("Kemungkinan penyebab:");
            console.log("1. User '" + hoConn.db_user + "' tidak memiliki izin SELECT ke tabel tersebut.");
            console.log("2. Database PEPITO_HO yang diakses script ini berbeda instance dengan SSMS Anda (beda port).");
        }

        await hoPool.close();
        process.exit(0);
    } catch (e) {
        console.error("Error:", e.message);
        process.exit(1);
    }
}

diag();
