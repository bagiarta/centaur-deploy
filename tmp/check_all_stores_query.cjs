const sql = require('mssql');
require('dotenv').config();

const mainConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

const userQuery = `SELECT S.STK_ORG_CD ,S.STK_ITM_CD ,S.STK_LOT_NO ,S.STK_BATCH_NO ,S.STK_CURR_STK_QTY ,I.ITM_NAME ,S.STK_GRN_DOC_NO ,S.STK_GRN_DOC_DT ,G.GED_DOC_NO ,G.GED_SEQ_NO ,G.GED_QTY ,G.GED_EXPIRY_DT ,DATEDIFF(DAY, CAST(GETDATE() AS DATE), G.GED_EXPIRY_DT) AS RemainingDays ,CASE WHEN G.GED_EXPIRY_DT < CAST(GETDATE() AS DATE) THEN 'EXPIRED' WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), G.GED_EXPIRY_DT) <= 7 THEN 'CRITICAL' WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), G.GED_EXPIRY_DT) <= 30 THEN 'WARNING' WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), G.GED_EXPIRY_DT) <= 60 THEN 'REMINDER' ELSE 'SAFE' END AS NotificationLevel FROM dbo.BRN_LOT_STK_MST S INNER JOIN dbo.GRN_ITM_EXPIRY_DTL G ON G.GED_DOC_NO = S.STK_GRN_DOC_NO AND G.GED_ORG_CD = S.STK_GRN_ORG_CD AND G.GED_ITM_CD = S.STK_ITM_CD INNER JOIN dbo.ORG_ITEM_DTL D ON D.OID_ORG_CD = S.STK_ORG_CD AND D.OID_ITM_CD= S.STK_ITM_CD AND D.OID_ITM_STATUS='O' 
--AND D.OID_BLK_REASON='0' AND D.OID_SALES_BLK='0' AND D.OID_PURCHASE_BLK='0' AND D.OID_ITMMOVE_BLK='0' 
INNER JOIN dbo.ITEM_MST I on D.OID_ITM_CD = I.ITM_CD 
WHERE 
--S.STK_ITM_CD = '101010000584' AND 
-- S.STK_ORG_CD = '011' AND 
S.STK_CURR_STK_QTY > 0 AND S.STK_TXN_TYPE='22' and G.GED_EXPIRY_DT >= GETDATE () 
ORDER BY G.GED_EXPIRY_DT;`;

async function test() {
  try {
    const mainPool = await sql.connect(mainConfig);
    const devsRes = await mainPool.request().query(`
      SELECT d.id, d.hostname, d.ip, c.db_name, c.db_user, c.db_password
      FROM Devices d
      JOIN DeviceDbConnections c ON d.id = c.device_id
      WHERE d.status = 'online' AND d.hostname LIKE 'STORESRVR%'
    `);
    const storeDevs = devsRes.recordset;
    console.log(`Found ${storeDevs.length} online store databases. Checking...`);
    
    for (const dev of storeDevs) {
      const config = {
        user: dev.db_user,
        password: dev.db_password,
        server: dev.ip,
        database: dev.db_name,
        options: { encrypt: false, trustServerCertificate: true, connectTimeout: 3000 },
        pool: { max: 1, min: 0 }
      };
      
      try {
        const pool = new sql.ConnectionPool(config);
        await pool.connect();
        const result = await pool.request().query(userQuery);
        console.log(`[${dev.hostname}] SUCCESS - Rows: ${result.recordset.length}`);
        await pool.close();
      } catch (err) {
        console.log(`[${dev.hostname}] ERROR: ${err.message}`);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error("Main Error:", err);
    process.exit(1);
  }
}

test();
