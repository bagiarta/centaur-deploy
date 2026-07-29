const sql = require('mssql');
require('dotenv').config();

const mainConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function testQuery() {
  try {
    const mainPool = await sql.connect(mainConfig);
    const deviceRes = await mainPool.request()
      .input('name', sql.NVarChar, 'DBWH SERVER')
      .input('ip', sql.NVarChar, '192.168.85.55')
      .query(`
        SELECT TOP 1 d.*, c.db_user, c.db_password, c.db_name 
        FROM Devices d
        LEFT JOIN DeviceDbConnections c ON d.id = c.device_id
        WHERE d.hostname = @name OR d.ip = @ip
      `);

    const device = deviceRes.recordset[0];
    const config = {
      user: device.db_user,
      password: device.db_password,
      server: device.ip,
      database: device.db_name || 'DBWH_8555',
      options: { encrypt: false, trustServerCertificate: true }
    };

    const crmPool = await new sql.ConnectionPool(config).connect();
    
    console.log("Running Query...");
    const request = crmPool.request();
    request.input('fromDate', sql.NVarChar, '2020-01-01 00:00:00');
    request.input('toDate', sql.NVarChar, '2026-12-31 23:59:59');

    let query = `
        SELECT STORE_NAME, MEMBER_ID, CUST_NAME, PHONE_NUMBER, 
               JOIN_DATE, REGISTRATION_TYPE, 
               CASE WHEN IS_ACTIVE = 1 THEN 'Yes' ELSE 'No' END AS IS_ACTIVE
        FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK)
        WHERE JOIN_DATE BETWEEN @fromDate AND @toDate
        ORDER BY JOIN_DATE DESC, CREATED_AT DESC
    `;

    let result = await request.query(query);
    console.log("Success! Found rows:", result.recordset.length);

    process.exit(0);
  } catch(e) {
    console.error("QUERY ERROR:", e.message);
    process.exit(1);
  }
}
testQuery();
