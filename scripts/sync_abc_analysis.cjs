const sql = require('mssql');
require('dotenv').config();

// Configuration for DBWH_8529 (Destination and local config storage)
const destDbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 150000,
  requestTimeout: 600000
};

/**
 * Helper: fetch HOSERVER connection config from local DBWH_8529
 */
async function getHoServerConfig(destPool) {
  const hoDevRes = await destPool.request()
    .input('hostname', sql.NVarChar, 'HOSERVER')
    .query('SELECT id, ip FROM Devices WHERE hostname = @hostname');

  if (hoDevRes.recordset.length === 0) {
    throw new Error('HOSERVER device not found in Devices table');
  }

  const { id: hoDeviceId, ip: dbIp } = hoDevRes.recordset[0];
  const hoIp = dbIp || '192.168.85.18';

  const hoConnRes = await destPool.request()
    .input('did', sql.NVarChar, hoDeviceId)
    .query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');

  if (hoConnRes.recordset.length === 0) {
    throw new Error('HOSERVER DB connection not configured in DeviceDbConnections');
  }

  const hoConn = hoConnRes.recordset[0];
  console.log(`[SYNC] Fetched HOSERVER config: server=${hoIp}, db=${hoConn.db_name}, user=${hoConn.db_user}`);

  return {
    user: hoConn.db_user,
    password: hoConn.db_password,
    server: hoIp,
    database: hoConn.db_name,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
    connectionTimeout: 15000,
    requestTimeout: 60000
  };
}

/**
 * Runs the ABC Analysis sync process
 * @param {string} [targetDateStr] - Target date to sync in YYYY-MM-DD format. Defaults to yesterday.
 */
async function runSync(targetDateStr) {
  // Determine target date (default to yesterday if not provided)
  const targetDateObj = targetDateStr ? new Date(targetDateStr) : new Date(new Date().setDate(new Date().getDate() - 1));
  const targetDate = targetDateObj.toISOString().slice(0, 10);

  console.log(`[SYNC] Starting ABC Analysis Auto-Sync for date: ${targetDate}...`);

  let destPool = null;
  let sourcePool = null;

  try {
    // 1. Connect to local DBWH_8529 to get HOSERVER credentials
    console.log('[SYNC] Connecting to DBWH_8529...');
    destPool = new sql.ConnectionPool(destDbConfig);
    await destPool.connect();

    // 2. Fetch HOSERVER config dynamically
    const sourceDbConfig = await getHoServerConfig(destPool);

    // 3. Connect to HOSERVER using explicit ConnectionPool (no global pool conflict)
    console.log(`[SYNC] Connecting to HOSERVER at ${sourceDbConfig.server} (DB: ${sourceDbConfig.database})...`);
    sourcePool = new sql.ConnectionPool(sourceDbConfig);
    await sourcePool.connect();

    // 4. Execute ABC Analysis Query on HOSERVER
    console.log('[SYNC] Executing ABC Analysis query...');
    const query = `
      IF OBJECT_ID('tempdb..#DailySales') IS NOT NULL DROP TABLE #DailySales;
      
      SELECT 
          ORG_CD, ITM_CD, ITEM_NAME, NET_VALUE, QTY, UOM_CD, BILL_NO, COST_VALUE
      INTO #DailySales
      FROM POS_SALES_DTL WITH (NOLOCK)
      WHERE VOID_FLAG = 'F'
        AND BILL_DT >= CAST(@targetDate AS DATETIME)
        AND BILL_DT < DATEADD(day, 1, CAST(@targetDate AS DATETIME));

      WITH ITEM_PERFORMANCE AS (
        SELECT
            ORG_CD,
            ITM_CD,
            ITEM_NAME,
            SUM(NET_VALUE) AS SALES_VALUE,
            SUM(QTY) AS QTY_SOLD,
            UOM_CD AS UOM,
            COUNT(DISTINCT BILL_NO) AS FREQUENCY,
            SUM(COST_VALUE * QTY) AS COST_VALUE,
            SUM(NET_VALUE) - SUM(COST_VALUE * QTY) AS MARGIN_VALUE
        FROM #DailySales
        GROUP BY ORG_CD, ITM_CD, ITEM_NAME, UOM_CD
      ),
      RANKING AS (
        SELECT
            *,
            CASE WHEN SALES_VALUE = 0 THEN 0 ELSE ROUND((MARGIN_VALUE / SALES_VALUE) * 100, 2) END AS GP_PERCENT,
            CASE WHEN QTY_SOLD = 0 THEN 0 ELSE ROUND(SALES_VALUE / QTY_SOLD, 2) END AS AVG_SELL_PRICE,
            CASE WHEN FREQUENCY = 0 THEN 0 ELSE ROUND(SALES_VALUE / FREQUENCY, 2) END AS AVG_BASKET_VALUE,
            SALES_VALUE * 100.0 / SUM(SALES_VALUE) OVER (PARTITION BY ORG_CD) AS CONTRIBUTION_PCT,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY SALES_VALUE DESC) AS RANK_SALES,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY MARGIN_VALUE DESC) AS RANK_MARGIN,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY QTY_SOLD DESC) AS RANK_QTY,
            DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY FREQUENCY DESC) AS RANK_FREQUENCY
        FROM ITEM_PERFORMANCE
      ),
      ABC_ANALYSIS AS (
        SELECT
            *,
            SUM(CONTRIBUTION_PCT) OVER (PARTITION BY ORG_CD ORDER BY SALES_VALUE DESC ROWS UNBOUNDED PRECEDING) AS CUMULATIVE_PCT
        FROM RANKING
      )
      SELECT
        ORG_CD,
        ITM_CD,
        ITEM_NAME,
        SALES_VALUE,
        QTY_SOLD,
        UOM,
        FREQUENCY,
        COST_VALUE,
        MARGIN_VALUE,
        GP_PERCENT,
        AVG_SELL_PRICE,
        AVG_BASKET_VALUE,
        CONTRIBUTION_PCT,
        CASE
            WHEN CUMULATIVE_PCT <= 80 THEN 'A'
            WHEN CUMULATIVE_PCT <= 95 THEN 'B'
            ELSE 'C'
        END AS ABC_CATEGORY,
        RANK_SALES,
        RANK_MARGIN,
        RANK_QTY,
        RANK_FREQUENCY,
        @targetDate AS TRANSACTION_DATE,
        GETDATE() AS SYNC_DATE
      FROM ABC_ANALYSIS
      ORDER BY ORG_CD, SALES_VALUE DESC;
    `;

    const sourceResult = await sourcePool.request()
      .input('targetDate', sql.Date, targetDate)
      .query(query);
    const records = sourceResult.recordset;
    console.log(`[SYNC] Fetched ${records.length} records from HOSERVER.`);

    // Close source connection after fetching
    await sourcePool.close();
    sourcePool = null;

    if (records.length === 0) {
      console.log(`[SYNC] No records to sync for ${targetDate}. Done.`);
      await destPool.close();
      destPool = null;
      return;
    }

    // 5. Ensure Destination Table Exists
    console.log('[SYNC] Ensuring ItemPerformanceABC table exists...');
    await destPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ItemPerformanceABC' AND xtype='U')
      CREATE TABLE ItemPerformanceABC (
          id INT IDENTITY(1,1) PRIMARY KEY,
          ORG_CD NVARCHAR(50),
          ITM_CD NVARCHAR(100),
          ITEM_NAME NVARCHAR(255),
          SALES_VALUE DECIMAL(18,2),
          QTY_SOLD DECIMAL(18,4),
          UOM NVARCHAR(10),
          FREQUENCY INT,
          COST_VALUE DECIMAL(18,2),
          MARGIN_VALUE DECIMAL(18,2),
          GP_PERCENT DECIMAL(18,2),
          AVG_SELL_PRICE DECIMAL(18,2),
          AVG_BASKET_VALUE DECIMAL(18,2),
          CONTRIBUTION_PCT DECIMAL(18,2),
          ABC_CATEGORY NVARCHAR(10),
          RANK_SALES INT,
          RANK_MARGIN INT,
          RANK_QTY INT,
          RANK_FREQUENCY INT,
          TRANSACTION_DATE DATE,
          SYNC_DATE DATETIME
      )
    `);

    // 6. Delete existing data for the target transaction date before inserting fresh sync
    console.log(`[SYNC] Deleting existing records for TRANSACTION_DATE ${targetDate} before re-inserting...`);
    await destPool.request()
      .input('txnDate', sql.Date, targetDate)
      .query(`DELETE FROM ItemPerformanceABC WHERE TRANSACTION_DATE = @txnDate`);

    // 7. Bulk Insert Data
    console.log('[SYNC] Inserting data into DBWH_8529 (ItemPerformanceABC)...');

    const table = new sql.Table('ItemPerformanceABC');
    table.create = false;
    table.columns.add('ORG_CD', sql.NVarChar(50), { nullable: true });
    table.columns.add('ITM_CD', sql.NVarChar(100), { nullable: true });
    table.columns.add('ITEM_NAME', sql.NVarChar(255), { nullable: true });
    table.columns.add('SALES_VALUE', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('QTY_SOLD', sql.Decimal(18, 4), { nullable: true });
    table.columns.add('FREQUENCY', sql.Int, { nullable: true });
    table.columns.add('COST_VALUE', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('MARGIN_VALUE', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('GP_PERCENT', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('AVG_SELL_PRICE', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('AVG_BASKET_VALUE', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('CONTRIBUTION_PCT', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('ABC_CATEGORY', sql.NVarChar(10), { nullable: true });
    table.columns.add('RANK_SALES', sql.Int, { nullable: true });
    table.columns.add('RANK_MARGIN', sql.Int, { nullable: true });
    table.columns.add('RANK_QTY', sql.Int, { nullable: true });
    table.columns.add('RANK_FREQUENCY', sql.Int, { nullable: true });
    table.columns.add('TRANSACTION_DATE', sql.Date, { nullable: true });
    table.columns.add('SYNC_DATE', sql.DateTime, { nullable: true });
    table.columns.add('UOM', sql.NVarChar(10), { nullable: true });

    for (const r of records) {
      table.rows.add(
        r.ORG_CD, r.ITM_CD, r.ITEM_NAME, r.SALES_VALUE, r.QTY_SOLD, r.FREQUENCY,
        r.COST_VALUE, r.MARGIN_VALUE, r.GP_PERCENT, r.AVG_SELL_PRICE, r.AVG_BASKET_VALUE,
        r.CONTRIBUTION_PCT, r.ABC_CATEGORY, r.RANK_SALES, r.RANK_MARGIN, r.RANK_QTY,
        r.RANK_FREQUENCY, r.TRANSACTION_DATE, r.SYNC_DATE, r.UOM
      );
    }

    const bulkResult = await destPool.request().bulk(table);
    console.log(`[SYNC] ✅ Successfully inserted ${bulkResult.rowsAffected} rows into ItemPerformanceABC.`);

    await destPool.close();
    destPool = null;

  } catch (err) {
    console.error('[SYNC] ❌ Error during ABC Analysis Sync:', err.message);
  } finally {
    if (sourcePool) {
      try { await sourcePool.close(); } catch (e) { }
    }
    if (destPool) {
      try { await destPool.close(); } catch (e) { }
    }
  }
}

// Allow manual execution directly from command line
if (require.main === module) {
  // If an argument is provided (e.g., node scripts/sync_abc_analysis.cjs 2026-05-15)
  const argDate = process.argv[2];

  runSync(argDate).then(() => {
    console.log('[SYNC] Process complete.');
    process.exit(0);
  });
}

module.exports = { runSync };
