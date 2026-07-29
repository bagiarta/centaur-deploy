const sql = require('mssql');
require('dotenv').config();

const mainConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true }
};

async function checkSchema() {
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
    let config;

    if (device && device.db_user && device.db_password) {
      config = {
        user: device.db_user,
        password: device.db_password,
        server: device.ip,
        database: device.db_name || 'DBWH_8555',
        options: { encrypt: false, trustServerCertificate: true }
      };
    } else {
      config = {
        user: process.env.CRM_DB_USER || 'sa',
        password: process.env.CRM_DB_PASS || 'default_pass',
        server: process.env.CRM_DB_SERVER || '192.168.85.55',
        database: process.env.CRM_DB_NAME || 'DBWH_8555',
        options: { encrypt: false, trustServerCertificate: true }
      };
    }

    const crmPool = await new sql.ConnectionPool(config).connect();
    
    console.log("=== RXL_LOYALID_ENROLLMENT Schema ===");
    let result1 = await crmPool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'RXL_LOYALID_ENROLLMENT'
    `);
    console.log(result1.recordset);

    console.log("=== TOP 1 ROW ===");
    let result2 = await crmPool.request().query(`
      SELECT TOP 1 * FROM RXL_LOYALID_ENROLLMENT
    `);
    console.log(result2.recordset);

    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
checkSchema();
