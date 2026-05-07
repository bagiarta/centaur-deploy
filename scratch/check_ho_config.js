import sql from 'mssql';
import { dbConfig } from '../config/db.js';

async function check() {
  try {
    const pool = await sql.connect(dbConfig);
    const res = await pool.request().query("SELECT * FROM DeviceDbConnections WHERE device_id = (SELECT id FROM Devices WHERE hostname = 'HOSERVER')");
    console.log("HO SERVER CONNECTIONS:", JSON.stringify(res.recordset, null, 2));
    await pool.close();
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
check();
