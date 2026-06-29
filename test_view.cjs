const sql = require('mssql');
require('dotenv').config();
async function run() {
  const destPool = await new sql.ConnectionPool({
    user: process.env.DB_USER, password: process.env.DB_PASS, server: process.env.DB_SERVER, database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 60000
  }).connect();
  const hoDevRes = await destPool.request().input('hostname', sql.NVarChar, 'HOSERVER').query('SELECT id, ip FROM Devices WHERE hostname = @hostname');
  const { id: hoDeviceId, ip: dbIp } = hoDevRes.recordset[0];
  const hoConnRes = await destPool.request().input('did', sql.NVarChar, hoDeviceId).query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');
  const hoConn = hoConnRes.recordset[0];
  
  const sourcePool = await new sql.ConnectionPool({
    user: hoConn.db_user, password: hoConn.db_password, server: dbIp || '192.168.85.18', database: hoConn.db_name,
    options: { encrypt: false, trustServerCertificate: true }, requestTimeout: 60000
  }).connect();
  
  const r1 = await sourcePool.request().query("SELECT object_id, type_desc FROM sys.objects WHERE name = 'POS_SALES_DTL'");
  console.log(r1.recordset);
  process.exit(0);
}
run().catch(console.error);
