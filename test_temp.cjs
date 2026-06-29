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
  
  console.log('Testing Temp Table approach...');
  try {
    const q1 = \
      DECLARE @dt DATETIME = '2026-06-04';
      DECLARE @dt_end DATETIME = DATEADD(day, 1, @dt);
      
      IF OBJECT_ID('tempdb..#DailySales') IS NOT NULL DROP TABLE #DailySales;
      
      SELECT 
          ORG_CD, ITM_CD, ITEM_NAME, NET_VALUE, QTY, UOM_CD, BILL_NO, COST_VALUE
      INTO #DailySales
      FROM POS_SALES_DTL WITH (NOLOCK)
      WHERE VOID_FLAG = 'F'
        AND BILL_DT >= @dt
        AND BILL_DT < @dt_end;
        
      WITH ITEM_PERFORMANCE AS (
        SELECT
            ORG_CD, ITM_CD, ITEM_NAME, UOM_CD AS UOM,
            SUM(NET_VALUE) AS SALES_VALUE,
            SUM(QTY) AS QTY_SOLD,
            COUNT(DISTINCT BILL_NO) AS FREQUENCY,
            SUM(COST_VALUE * QTY) AS COST_VALUE,
            SUM(NET_VALUE) - SUM(COST_VALUE * QTY) AS MARGIN_VALUE
        FROM #DailySales
        GROUP BY ORG_CD, ITM_CD, ITEM_NAME, UOM_CD
      ),
      RANKING AS (
        SELECT *,
            CASE WHEN SALES_VALUE = 0 THEN 0 ELSE ROUND((MARGIN_VALUE / SALES_VALUE) * 100, 2) END AS GP_PERCENT,
            CASE WHEN QTY_SOLD = 0 THEN 0 ELSE ROUND(SALES_VALUE / QTY_SOLD, 2) END AS AVG_SELL_PRICE,
            CASE WHEN FREQUENCY = 0 THEN 0 ELSE ROUND(SALES_VALUE / FREQUENCY, 2) END AS AVG_BASKET_VALUE,
            SALES_VALUE * 100.0 / SUM(SALES_VALUE) OVER (PARTITION BY ORG_CD) AS CONTRIBUTION_PCT,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY SALES_VALUE DESC) AS RANK_SALES,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY MARGIN_VALUE DESC) AS RANK_MARGIN,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY QTY_SOLD DESC) AS RANK_QTY,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY FREQUENCY DESC) AS RANK_FREQUENCY
        FROM ITEM_PERFORMANCE
      )
      SELECT COUNT(*) as c FROM RANKING;
    \;
    const start = Date.now();
    const r1 = await sourcePool.request().query(q1);
    const end = Date.now();
    console.log('Query finished. Total rows:', r1.recordset[0].c, 'Time:', end - start, 'ms');
  } catch(e) {
    console.log('Temp table failed:', e.message);
  }
  
  process.exit(0);
}

run().catch(console.error);
