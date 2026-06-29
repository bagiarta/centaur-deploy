const sql = require('mssql');
require('dotenv').config();

// Configuration for DBWH_8529 (Destination)
const destDbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 15000,
  requestTimeout: 60000
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
  console.log(`[HOSERVER_DIM_ITEM_SYNC] Fetched HOSERVER config: server=${hoIp}, db=${hoConn.db_name}, user=${hoConn.db_user}`);

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
 * Main sync function - SELECT DIM_ITEM from HOSERVER and INSERT to DBWH_8529
 */
async function runSync() {
  const startTime = Date.now();
  console.log(`[HOSERVER_DIM_ITEM_SYNC] ⏳ Starting DIM_ITEM sync from HOSERVER to DBWH_8529 at ${new Date().toISOString()}...`);

  let destPool = null;
  let sourcePool = null;

  try {
    // 1. Connect to DBWH_8529 (destination)
    console.log('[HOSERVER_DIM_ITEM_SYNC] Connecting to DBWH_8529...');
    destPool = new sql.ConnectionPool(destDbConfig);
    await destPool.connect();

    // 2. Fetch HOSERVER config dynamically
    const sourceDbConfig = await getHoServerConfig(destPool);

    // 3. Connect to HOSERVER (source)
    console.log(`[HOSERVER_DIM_ITEM_SYNC] Connecting to HOSERVER at ${sourceDbConfig.server} (DB: ${sourceDbConfig.database})...`);
    sourcePool = new sql.ConnectionPool(sourceDbConfig);
    await sourcePool.connect();

    // 4. Check if DIM_ITEM exists in HOSERVER
    console.log('[HOSERVER_DIM_ITEM_SYNC] Checking DIM_ITEM table in HOSERVER...');
    const tableCheckRes = await sourcePool.request().query(`
      SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'DIM_ITEM'
    `);
    
    if (tableCheckRes.recordset[0].count === 0) {
      throw new Error('DIM_ITEM table not found in HOSERVER');
    }

    // 5. Get count in HOSERVER before reading
    const hoServerCount = await sourcePool.request().query(`
      SELECT COUNT(*) as count FROM DIM_ITEM
    `);
    console.log(`[HOSERVER_DIM_ITEM_SYNC] Found ${hoServerCount.recordset[0].count} records in HOSERVER DIM_ITEM`);

    // 6. Ensure destination table exists in DBWH_8529
    console.log('[HOSERVER_DIM_ITEM_SYNC] Ensuring destination table DW_DIM_ITEM exists in DBWH_8529...');
    await destPool.request().query(`
      IF OBJECT_ID('dbo.DW_DIM_ITEM', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DW_DIM_ITEM (
          ITEM_CODE NVARCHAR(100) NOT NULL PRIMARY KEY,
          ITEM_NAME NVARCHAR(255) NULL,
          DIVISION_CODE NVARCHAR(50) NULL,
          CATEGORY_CODE NVARCHAR(50) NULL,
          VENDOR_CODE NVARCHAR(50) NULL,
          VENDOR_NAME NVARCHAR(255) NULL,
          STOCK_UOM NVARCHAR(50) NULL,
          SALES_UOM NVARCHAR(50) NULL,
          BARCODE NVARCHAR(100) NULL,
          SELL_PRICE DECIMAL(18,2) NULL,
          COST_PRICE DECIMAL(18,2) NULL,
          ACTIVE_FLAG NVARCHAR(10) NULL,
          LAST_UPDATED DATETIME NULL
        );
      END
    `);

    const beforeCount = await destPool.request().query(`
      SELECT COUNT(*) as count FROM DW_DIM_ITEM
    `);
    const countBefore = beforeCount.recordset[0].count;
    console.log(`[HOSERVER_DIM_ITEM_SYNC] Current DW_DIM_ITEM count in DBWH_8529: ${countBefore}`);

    // 7. SELECT all data from HOSERVER DIM_ITEM
    console.log('[HOSERVER_DIM_ITEM_SYNC] Fetching DIM_ITEM data from HOSERVER...');
    const dimItemData = await sourcePool.request().query(`
      SELECT
        ITEM_CODE,
        ITEM_NAME,
        DIVISION_CODE,
        CATEGORY_CODE,
        VENDOR_CODE,
        VENDOR_NAME,
        STOCK_UOM,
        SALES_UOM,
        BARCODE,
        SELL_PRICE,
        COST_PRICE,
        ACTIVE_FLAG
      FROM DIM_ITEM
    `);

    const itemsToInsert = dimItemData.recordset;
    console.log(`[HOSERVER_DIM_ITEM_SYNC] Fetched ${itemsToInsert.length} items from HOSERVER`);

    if (itemsToInsert.length === 0) {
      console.warn('[HOSERVER_DIM_ITEM_SYNC] ⚠ No items found in HOSERVER DIM_ITEM');
      const duration = Date.now() - startTime;
      return {
        success: true,
        duration_ms: duration,
        records_inserted: 0,
        hoserver_total: 0,
        dbwh_total_before: countBefore,
        dbwh_total_after: countBefore,
        message: 'No items to sync',
        timestamp: new Date().toISOString()
      };
    }

    // 8. Bulk INSERT into DBWH_8529
    console.log('[HOSERVER_DIM_ITEM_SYNC] Inserting items into DBWH_8529 DW_DIM_ITEM...');
    
    const table = new sql.Table('DW_DIM_ITEM');
    table.create = false;
    table.columns.add('ITEM_CODE', sql.NVarChar, { nullable: false });
    table.columns.add('ITEM_NAME', sql.NVarChar, { nullable: true });
    table.columns.add('DIVISION_CODE', sql.NVarChar, { nullable: true });
    table.columns.add('CATEGORY_CODE', sql.NVarChar, { nullable: true });
    table.columns.add('VENDOR_CODE', sql.NVarChar, { nullable: true });
    table.columns.add('VENDOR_NAME', sql.NVarChar, { nullable: true });
    table.columns.add('STOCK_UOM', sql.NVarChar, { nullable: true });
    table.columns.add('SALES_UOM', sql.NVarChar, { nullable: true });
    table.columns.add('BARCODE', sql.NVarChar, { nullable: true });
    table.columns.add('SELL_PRICE', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('COST_PRICE', sql.Decimal(18, 2), { nullable: true });
    table.columns.add('ACTIVE_FLAG', sql.NVarChar, { nullable: true });
    table.columns.add('LAST_UPDATED', sql.DateTime, { nullable: true });

    itemsToInsert.forEach(item => {
      table.rows.add(
        item.ITEM_CODE,
        item.ITEM_NAME,
        item.DIVISION_CODE,
        item.CATEGORY_CODE,
        item.VENDOR_CODE,
        item.VENDOR_NAME,
        item.STOCK_UOM,
        item.SALES_UOM,
        item.BARCODE,
        item.SELL_PRICE,
        item.COST_PRICE,
        item.ACTIVE_FLAG,
        new Date()
      );
    });

    const request = destPool.request();
    const result = await request.bulk(table);
    
    const afterCount = await destPool.request().query(`
      SELECT COUNT(*) as count FROM DW_DIM_ITEM
    `);
    const countAfter = afterCount.recordset[0].count;
    
    const recordsInserted = result.rowsAffected || itemsToInsert.length;
    const duration = Date.now() - startTime;

    console.log(`[HOSERVER_DIM_ITEM_SYNC] ✓ Sync completed successfully`);
    console.log(`[HOSERVER_DIM_ITEM_SYNC] Duration: ${duration}ms`);
    console.log(`[HOSERVER_DIM_ITEM_SYNC] Records inserted: ${recordsInserted}`);
    console.log(`[HOSERVER_DIM_ITEM_SYNC] DBWH_8529 DW_DIM_ITEM: ${countBefore} → ${countAfter}`);

    return {
      success: true,
      duration_ms: duration,
      records_inserted: recordsInserted,
      hoserver_total: hoServerCount.recordset[0].count,
      dbwh_total_before: countBefore,
      dbwh_total_after: countAfter,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[HOSERVER_DIM_ITEM_SYNC] ✗ Error after ${duration}ms:`, err.message);
    console.error(`[HOSERVER_DIM_ITEM_SYNC] Code: ${err.code}`);
    console.error(`[HOSERVER_DIM_ITEM_SYNC] State: ${err.state}`);
    console.error(`[HOSERVER_DIM_ITEM_SYNC] Stack: ${err.stack}`);

    return {
      success: false,
      error: err.message,
      code: err.code,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    };

  } finally {
    if (sourcePool) {
      try {
        await sourcePool.close();
        console.log('[HOSERVER_DIM_ITEM_SYNC] HOSERVER connection closed');
      } catch (closeErr) {
        console.error('[HOSERVER_DIM_ITEM_SYNC] Error closing HOSERVER connection:', closeErr.message);
      }
    }

    if (destPool) {
      try {
        await destPool.close();
        console.log('[HOSERVER_DIM_ITEM_SYNC] DBWH_8529 connection closed');
      } catch (closeErr) {
        console.error('[HOSERVER_DIM_ITEM_SYNC] Error closing DBWH_8529 connection:', closeErr.message);
      }
    }
  }
}

if (require.main === module) {
  runSync()
    .then(result => {
      console.log('[HOSERVER_DIM_ITEM_SYNC] Script finished:', JSON.stringify(result, null, 2));
      if (!result.success) process.exit(1);
    })
    .catch(err => {
      console.error('[HOSERVER_DIM_ITEM_SYNC] Script failed:', err);
      process.exit(1);
    });
}

module.exports = { runSync };