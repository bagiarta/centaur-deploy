import sql from 'mssql';
import { dbConfig } from '../config/db.js';

async function check() {
  try {
    const pool = await sql.connect(dbConfig);
    const res = await pool.request().query("SELECT d.hostname, d.ip, c.db_name, c.db_user, c.db_password FROM Devices d JOIN DeviceDbConnections c ON d.id = c.device_id WHERE d.hostname = 'HOSERVER'");
    const config = res.recordset[0];
    await pool.close();

    console.log("Connecting to HOSERVER:", config.ip, "DB:", config.db_name);
    
    const hoPool = await sql.connect({
        user: config.db_user,
        password: config.db_password,
        server: config.ip,
        database: config.db_name,
        options: { encrypt: false, trustServerCertificate: true }
    });

    const tables = await hoPool.request().query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%LOYAL_CRM%'");
    console.log("FOUND TABLES:", JSON.stringify(tables.recordset, null, 2));
    
    await hoPool.close();
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
check();
