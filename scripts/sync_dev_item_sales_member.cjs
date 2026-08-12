const sql = require('mssql');
require('dotenv').config();

const localDbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 15000,
  requestTimeout: 120000
};

// Helper: Get CRM Config
async function getCrmServerConfig(localPool) {
  const deviceRes = await localPool.request()
    .input('name', sql.NVarChar, 'DBWH SERVER')
    .input('ip', sql.NVarChar, '192.168.85.55')
    .query(`
      SELECT TOP 1 d.*, c.db_user, c.db_password, c.db_name 
      FROM Devices d
      LEFT JOIN DeviceDbConnections c ON d.id = c.device_id
      WHERE d.hostname = @name OR d.ip = @ip
    `);

  const device = deviceRes.recordset[0];
  if (!device || !device.db_user || !device.db_password) {
    throw new Error('DBWH SERVER connection credentials not found in Devices/DeviceDbConnections');
  }

  return {
    user: device.db_user,
    password: device.db_password,
    server: device.ip,
    database: device.db_name,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000
  };
}

// Helper: Get HO Server Config
async function getHoServerConfig(localPool) {
  const hoDevRes = await localPool.request()
    .input('hostname', sql.NVarChar, 'HOSERVER')
    .query("SELECT id, ip FROM Devices WHERE hostname = @hostname");

  if (hoDevRes.recordset.length === 0) {
    throw new Error('HOSERVER device not found in Devices table');
  }

  const { id: hoDeviceId, ip: dbIp } = hoDevRes.recordset[0];
  const hoIp = dbIp || '192.168.85.18';

  const hoConnRes = await localPool.request()
    .input('did', sql.NVarChar, hoDeviceId)
    .query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');

  if (hoConnRes.recordset.length === 0) {
    throw new Error('HOSERVER DB connection not configured in DeviceDbConnections');
  }

  const hoConn = hoConnRes.recordset[0];
  return {
    user: hoConn.db_user,
    password: hoConn.db_password,
    server: hoIp,
    database: hoConn.db_name,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 120000
  };
}

async function runSync(fromDateStr, toDateStr) {
  console.log(`[ITEM_SALES_SYNC] Starting Item Sales Member Sync from ${fromDateStr} to ${toDateStr}...`);
  let localPool = null;
  let crmPool = null;
  let hoPool = null;

  // Helper to run query with retry and automatic reconnection
  async function runQuery(poolConfig, getPoolFn, setPoolFn, queryFn) {
    let delay = 3000;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        let pool = getPoolFn();
        if (!pool || !pool.connected) {
          console.log(`[ITEM_SALES_SYNC] Connecting to server ${poolConfig.server} (attempt ${attempt})...`);
          pool = new sql.ConnectionPool(poolConfig);
          await pool.connect();
          setPoolFn(pool);
        }
        return await queryFn(pool);
      } catch (err) {
        console.warn(`[ITEM_SALES_SYNC] Query failed (attempt ${attempt}/3): ${err.message}`);
        let pool = getPoolFn();
        if (pool) {
          try { await pool.close(); } catch (_) { }
          setPoolFn(null);
        }
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  try {
    localPool = new sql.ConnectionPool(localDbConfig);
    await localPool.connect();
    console.log('[ITEM_SALES_SYNC] Connected to local database.');

    // Ensure table exists
    await localPool.request().query(`
      IF OBJECT_ID('dbo.ITEM_SALES_MEMBER', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ITEM_SALES_MEMBER (
          id INT IDENTITY(1,1) PRIMARY KEY,
          org_cd NVARCHAR(50) NULL,
          itm_cd NVARCHAR(100) NULL,
          item_name NVARCHAR(255) NULL,
          qty DECIMAL(18,3) NULL,
          uom NVARCHAR(50) NULL,
          promo_item_flag NVARCHAR(10) NULL,
          promo_detail NVARCHAR(500) NULL,
          disc_amt DECIMAL(18,2) NULL,
          division NVARCHAR(100) NULL,
          groups NVARCHAR(100) NULL,
          department NVARCHAR(100) NULL,
          class NVARCHAR(100) NULL,
          sub_class NVARCHAR(100) NULL,
          brand NVARCHAR(100) NULL,
          principle NVARCHAR(100) NULL,
          sources NVARCHAR(100) NULL,
          size_measure NVARCHAR(100) NULL,
          plano_name NVARCHAR(100) NULL,
          returnable NVARCHAR(50) NULL,
          item_type NVARCHAR(100) NULL,
          card_no NVARCHAR(100) NULL,
          bill_dt DATETIME NULL,
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_ITEM_SALES_MEMBER_DATE ON dbo.ITEM_SALES_MEMBER(bill_dt);
        CREATE INDEX IX_ITEM_SALES_MEMBER_CARD ON dbo.ITEM_SALES_MEMBER(card_no);
      END
    `);

    const crmConfig = await getCrmServerConfig(localPool);
    const hoConfig = await getHoServerConfig(localPool);

    // Generate dates range
    const start = new Date(fromDateStr);
    const end = new Date(toDateStr);
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    // Process day-by-day
    for (const date of dates) {
      console.log(`[ITEM_SALES_SYNC] Processing date: ${date}...`);
      const dateStart = date + ' 00:00:00';
      const dateEnd = date + ' 23:59:59';

      console.log(`[ITEM_SALES_SYNC] Deleting existing local data for ${date}...`);
      await localPool.request()
        .input('start', sql.VarChar, dateStart)
        .input('end', sql.VarChar, dateEnd)
        .query('DELETE FROM ITEM_SALES_MEMBER WHERE bill_dt >= @start AND bill_dt <= @end');

      console.log(`[ITEM_SALES_SYNC] Fetching loyalty headers from CRM SERVER for ${date}...`);
      const headersRes = await runQuery(
        crmConfig,
        () => crmPool,
        p => { crmPool = p; },
        pool => pool.request()
          .input('start', sql.VarChar, dateStart)
          .input('end', sql.VarChar, dateEnd)
          .query(`
            SELECT 
                q.RLITQ_CARD_NO AS card_no,
                h.BILL_NO AS bill_no,
                h.ORG_CD AS org_cd
            FROM POS_SALES_HDR (NOLOCK) h
            INNER JOIN RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q ON h.BILL_NO = q.RLITQ_BILL_NO AND h.ORG_CD = q.RLITQ_ORG_CD
            WHERE h.BILL_DT >= @start AND h.BILL_DT <= @end AND h.VOID_FLAG = 'F'
            AND q.RLITQ_INTEG_CODE='110'
          `)
      );

      const headers = headersRes.recordset;
      console.log(`[ITEM_SALES_SYNC] Fetched ${headers.length} headers. Processing map...`);
      if (headers.length === 0) {
        console.log(`[ITEM_SALES_SYNC] No loyalty transactions found on ${date}.`);
        continue;
      }

      // Index headers in a Map for fast O(1) lookup
      const headerMap = new Map();
      headers.forEach(h => {
        const key = `${h.org_cd.trim()}_${h.bill_no.trim()}`;
        headerMap.set(key, h.card_no);
      });

      console.log(`[ITEM_SALES_SYNC] Fetching item sales details from HOSERVER for ${date}...`);
      const detailsRes = await runQuery(
        hoConfig,
        () => hoPool,
        p => { hoPool = p; },
        pool => pool.request()
          .input('start', sql.VarChar, dateStart)
          .input('end', sql.VarChar, dateEnd)
          .query(`
            SELECT
                P.ORG_CD,
                P.BILL_NO,
                P.ITM_CD,
                P.ITEM_NAME,
                P.QTY,
                P.UOM_DESC AS UOM,
                P.PROMO_ITEM_FLAG,
                P.PROMO_DETAIL,
                P.PROMO_DISC_AMT AS DISC_AMT,
                D.ITM_ATTR02 AS DIVISION,
                D.ITM_ATTR03 AS GROUPS,
                D.ITM_ATTR04 AS DEPARTMENT,
                D.ITM_ATTR05 AS CLASS,
                D.ITM_ATTR06 AS SUB_CLASS,
                D.ITM_ATTR07 AS BRAND,
                D.ITM_ATTR08 AS PRINCIPLE,
                D.ITM_ATTR09 AS SOURCES,
                D.ITM_ATTR10 AS SIZE_MEAZURE,
                D.ITM_ATTR11 AS PLANO_NAME,
                D.ITM_ATTR13 AS RETURNABLE,
                D.ITM_ATTR18 AS ITEM_TYPE,
                P.BILL_DT
            FROM POS_SALES_DTL P WITH (NOLOCK)
            INNER JOIN ITEM_DESCRIPTION D WITH (NOLOCK) ON P.ITM_CD = D.ITM_CD
            WHERE P.BILL_DT >= @start
              AND P.BILL_DT <= @end
              AND P.VOID_FLAG = 'F'
          `)
      );

      const details = detailsRes.recordset;

      // 3. Filter details in memory to match loyalty members only
      const matchedRecords = [];
      details.forEach(det => {
        const key = `${det.ORG_CD.trim()}_${det.BILL_NO.trim()}`;
        if (headerMap.has(key)) {
          const cardNo = headerMap.get(key);
          matchedRecords.push({
            ...det,
            RLITQ_CARD_NO: cardNo
          });
        }
      });

      console.log(`[ITEM_SALES_SYNC] Found ${matchedRecords.length} member item sales lines. Inserting to local DB...`);

      if (matchedRecords.length > 0) {
        const chunkSize = 5000;
        for (let i = 0; i < matchedRecords.length; i += chunkSize) {
          const chunk = matchedRecords.slice(i, i + chunkSize);
          const table = new sql.Table('dbo.ITEM_SALES_MEMBER');
          table.create = false;
          table.columns.add('org_cd', sql.NVarChar(50), { nullable: true });
          table.columns.add('itm_cd', sql.NVarChar(100), { nullable: true });
          table.columns.add('item_name', sql.NVarChar(255), { nullable: true });
          table.columns.add('qty', sql.Decimal(18, 3), { nullable: true });
          table.columns.add('uom', sql.NVarChar(50), { nullable: true });
          table.columns.add('promo_item_flag', sql.NVarChar(10), { nullable: true });
          table.columns.add('promo_detail', sql.NVarChar(500), { nullable: true });
          table.columns.add('disc_amt', sql.Decimal(18, 2), { nullable: true });
          table.columns.add('division', sql.NVarChar(100), { nullable: true });
          table.columns.add('groups', sql.NVarChar(100), { nullable: true });
          table.columns.add('department', sql.NVarChar(100), { nullable: true });
          table.columns.add('class', sql.NVarChar(100), { nullable: true });
          table.columns.add('sub_class', sql.NVarChar(100), { nullable: true });
          table.columns.add('brand', sql.NVarChar(100), { nullable: true });
          table.columns.add('principle', sql.NVarChar(100), { nullable: true });
          table.columns.add('sources', sql.NVarChar(100), { nullable: true });
          table.columns.add('size_measure', sql.NVarChar(100), { nullable: true });
          table.columns.add('plano_name', sql.NVarChar(100), { nullable: true });
          table.columns.add('returnable', sql.NVarChar(50), { nullable: true });
          table.columns.add('item_type', sql.NVarChar(100), { nullable: true });
          table.columns.add('card_no', sql.NVarChar(100), { nullable: true });
          table.columns.add('bill_dt', sql.DateTime, { nullable: true });

          for (const row of chunk) {
            table.rows.add(
              row.ORG_CD, row.ITM_CD, row.ITEM_NAME, row.QTY, row.UOM,
              row.PROMO_ITEM_FLAG, row.PROMO_DETAIL, row.DISC_AMT,
              row.DIVISION, row.GROUPS, row.DEPARTMENT, row.CLASS,
              row.SUB_CLASS, row.BRAND, row.PRINCIPLE, row.SOURCES,
              row.SIZE_MEAZURE, row.PLANO_NAME, row.RETURNABLE, row.ITEM_TYPE,
              row.RLITQ_CARD_NO, row.BILL_DT
            );
          }
          await localPool.request().bulk(table);
        }
        console.log(`[ITEM_SALES_SYNC] Day ${date} sync complete. Inserted ${matchedRecords.length} records.`);
      }
    }

    console.log('[ITEM_SALES_SYNC] Sync completed successfully!');
  } catch (err) {
    console.error('[ITEM_SALES_SYNC] Sync failed:', err.message);
    throw err;
  } finally {
    if (localPool) await localPool.close();
    if (crmPool) await crmPool.close();
    if (hoPool) await hoPool.close();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const defaultDate = new Date().toISOString().slice(0, 10);
  const fromDate = args[0] || defaultDate;
  const toDate = args[1] || fromDate;

  runSync(fromDate, toDate);
}

module.exports = { runSync };
