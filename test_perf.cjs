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
  
  console.log('Testing aggregation with OPTION (RECOMPILE)...');
  try {
    const q1 = "DECLARE @dt DATETIME = '2026-06-04'; DECLARE @dt_end DATETIME = DATEADD(day, 1, @dt); SELECT ORG_CD, ITM_CD, ITEM_NAME, SUM(NET_VALUE) AS SALES_VALUE, SUM(QTY) AS QTY_SOLD, UOM_CD AS UOM, COUNT(DISTINCT BILL_NO) AS FREQUENCY, SUM(COST_VALUE * QTY) AS COST_VALUE, SUM(NET_VALUE) - SUM(COST_VALUE * QTY) AS MARGIN_VALUE FROM POS_SALES_DTL WITH (NOLOCK) WHERE VOID_FLAG = 'F' AND BILL_DT >= @dt AND BILL_DT < @dt_end GROUP BY ORG_CD, ITM_CD, ITEM_NAME, UOM_CD OPTION (RECOMPILE)";
    const start = Date.now();
    const r1 = await sourcePool.request().query(q1);
    const end = Date.now();
    console.log('Aggregation rows:', r1.recordset.length, 'Time:', end - start, 'ms');
  } catch(e) {
    console.log('Aggregation failed:', e.message);
  }
  
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
