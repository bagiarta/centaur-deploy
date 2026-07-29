const sql = require('mssql');
const dotenv = require('dotenv');
dotenv.config();
const net = require('net');

const dbConfig = {
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
 * Main synchronizer function to detect price changes and update shelf labels
 */
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

async function syncPrices(targetOrgCd = null) {
  console.log(`[ESL-SYNC] Initializing price sync engine... ${targetOrgCd ? `for store ${targetOrgCd}` : 'for all stores'}`);
  
  let pool = null;
  let hoPool = null;
  let checkedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  try {
    pool = new sql.ConnectionPool(dbConfig);
    await pool.connect();

    // Connect to HO Server to read selling prices from basic_sp_mst
    try {
      const hoConfig = await getHoServerConfig(pool);
      hoPool = new sql.ConnectionPool(hoConfig);
      await hoPool.connect();
      console.log('[ESL-SYNC] Connected to HO Server database.');
    } catch (hoConnErr) {
      console.error('[ESL-SYNC] Warning: Failed to connect to HO Server:', hoConnErr.message);
    }

    // 1. Fetch active gateways and map by org_cd
    const gatewaysResult = await pool.request().query('SELECT org_cd, gateway_ip, hostname, status FROM ESL_GATEWAYS');
    const gatewaysByOrg = {};
    gatewaysResult.recordset.forEach(gw => {
      if (!gatewaysByOrg[gw.org_cd]) gatewaysByOrg[gw.org_cd] = [];
      gatewaysByOrg[gw.org_cd].push(gw);
    });

    // 2. Fetch active label assignments
    let labelsQuery = 'SELECT label_id, org_cd, itm_cd, current_price, status FROM ESL_LABELS';
    const request = pool.request();
    if (targetOrgCd) {
      labelsQuery += ' WHERE org_cd = @org_cd';
      request.input('org_cd', sql.NVarChar, targetOrgCd);
    }
    const labelsResult = await request.query(labelsQuery);
    const activeLabels = labelsResult.recordset;

    console.log(`[ESL-SYNC] Found ${activeLabels.length} registered labels to evaluate.`);

    for (const label of activeLabels) {
      checkedCount++;
      const { label_id, org_cd, itm_cd, current_price: labelPrice, status: labelStatus } = label;
      const needsResync = (labelStatus === 'pending' || labelStatus === 'sync_failed');

      try {
        // Find the gateway configured for this label's store
        const storeGateways = gatewaysByOrg[org_cd] || [];
        const activeGateway = storeGateways.find(gw => gw.status === 'online');

        if (!activeGateway) {
          throw new Error(`No active ESL Access Point Gateway online for store branch ${org_cd}.`);
        }

        // 3. Fetch the latest pricing information from HO basic_sp_mst
        let latestPrice = 0;
        let priceFound = false;

        if (hoPool && hoPool.connected) {
          const priceResult = await hoPool.request()
            .input('itm_cd', sql.NVarChar, itm_cd)
            .input('org_cd', sql.NVarChar, org_cd)
            .query(`
              SELECT TOP 1 BSP_SELL_PRICE AS latest_price 
              FROM basic_sp_mst 
              WHERE BSP_ITEM_CD = @itm_cd AND BSP_ORG_CD = @org_cd AND BSP_STATUS = 'A'
              ORDER BY CASE WHEN BSP_PRICE_CATG = 'REG' THEN 1 ELSE 2 END, BSP_SELL_PRICE DESC
            `);
          if (priceResult.recordset.length > 0) {
            latestPrice = priceResult.recordset[0].latest_price || 0;
            priceFound = true;
          }
        }

        if (priceFound) {
          // Get the item name from HO item_mst or fallback to local ITEM_SALES_MEMBER
          let itemName = 'Unknown Item';
          let nameFound = false;

          if (hoPool && hoPool.connected) {
            const nameResult = await hoPool.request()
              .input('itm_cd', sql.NVarChar, itm_cd)
              .query('SELECT TOP 1 ITM_NAME AS item_name FROM item_mst WHERE ITM_CD = @itm_cd');
            if (nameResult.recordset.length > 0) {
              itemName = nameResult.recordset[0].item_name;
              nameFound = true;
            }
          }

          if (!nameFound) {
            const nameResult = await pool.request()
              .input('itm_cd', sql.NVarChar, itm_cd)
              .query('SELECT TOP 1 item_name FROM ITEM_SALES_MEMBER WHERE itm_cd = @itm_cd');
            if (nameResult.recordset.length > 0) {
              itemName = nameResult.recordset[0].item_name;
            }
          }

          // 4. Compare prices or check if label needs resync (pending/failed)
          if (latestPrice !== labelPrice || needsResync) {
            const reason = needsResync ? `Re-syncing ${labelStatus} label` : `Price difference detected`;
            console.log(`[ESL-SYNC] ${reason} for SKU ${itm_cd} (${itemName}) in Store ${org_cd}: Label=${labelPrice} vs Master=${latestPrice}`);
            
            // Trigger gateway simulation push using the specific gateway
            await simulateGatewayPush(label_id, itm_cd, itemName, latestPrice, activeGateway);

            // 5. Update the current_price and status in the database
            await pool.request()
              .input('label_id', sql.NVarChar, label_id)
              .input('price', sql.Decimal(18, 2), latestPrice)
              .input('item_name', sql.NVarChar, itemName)
              .query(`
                UPDATE ESL_LABELS 
                SET current_price = @price, item_name = @item_name, status = 'healthy', last_sync_dt = GETDATE()
                WHERE label_id = @label_id
              `);

            // 6. Log in the ESL_SYNC_LOGS audit table
            await pool.request()
              .input('org_cd', sql.NVarChar, org_cd)
              .input('label_id', sql.NVarChar, label_id)
              .input('itm_cd', sql.NVarChar, itm_cd)
              .input('prev_price', sql.Decimal(18, 2), labelPrice)
              .input('new_price', sql.Decimal(18, 2), latestPrice)
              .query(`
                INSERT INTO ESL_SYNC_LOGS (org_cd, label_id, itm_cd, prev_price, new_price, status)
                VALUES (@org_cd, @label_id, @itm_cd, @prev_price, @new_price, 'success')
              `);

            updatedCount++;
          }
        }
      } catch (labelErr) {
        failedCount++;
        console.error(`[ESL-SYNC] Failed to sync label ${label_id} for SKU ${itm_cd}:`, labelErr.message);

        // Update label status to sync_failed
        await pool.request()
          .input('label_id', sql.NVarChar, label_id)
          .query("UPDATE ESL_LABELS SET status = 'sync_failed' WHERE label_id = @label_id");

        // Log the failure
        await pool.request()
          .input('org_cd', sql.NVarChar, org_cd)
          .input('label_id', sql.NVarChar, label_id)
          .input('itm_cd', sql.NVarChar, itm_cd)
          .input('prev_price', sql.Decimal(18, 2), labelPrice)
          .input('error_msg', sql.NVarChar, labelErr.message)
          .query(`
            INSERT INTO ESL_SYNC_LOGS (org_cd, label_id, itm_cd, prev_price, new_price, status, error_msg)
            VALUES (@org_cd, @label_id, @itm_cd, @prev_price, @prev_price, 'failed', @error_msg)
          `);
      }
    }

    // 6. Real Gateway status connectivity check
    console.log('[ESL-SYNC] Initiating gateway reachability ping checks...');
    const checkGatewaysResult = await pool.request().query('SELECT id, hostname, gateway_ip FROM ESL_GATEWAYS');
    for (const gw of checkGatewaysResult.recordset) {
      let ip = gw.gateway_ip;
      let port = 80;
      
      // Parse custom ports if present (e.g. 192.168.1.100:8000)
      if (ip.includes(':')) {
        const parts = ip.split(':');
        ip = parts[0];
        port = parseInt(parts[1], 10) || 80;
      }

      const actualStatus = await pingGateway(ip, port, 1500);

      await pool.request()
        .input('id', sql.Int, gw.id)
        .input('status', sql.NVarChar, actualStatus)
        .query(`
          UPDATE ESL_GATEWAYS 
          SET status = @status, last_seen = CASE WHEN @status = 'online' THEN GETDATE() ELSE last_seen END
          WHERE id = @id
        `);

      console.log(`[ESL-SYNC] Gateway check: ${gw.hostname} (${gw.gateway_ip}) -> ${actualStatus}`);
    }

    console.log(`[ESL-SYNC] Pricing synchronization finished: checked=${checkedCount}, updated=${updatedCount}, failed=${failedCount}.`);
  } catch (err) {
    console.error('[ESL-SYNC] Critical synchronizer failure:', err.message);
  } finally {
    if (hoPool) {
      try { await hoPool.close(); } catch (_) {}
    }
    if (pool) {
      try { await pool.close(); } catch (_) {}
    }
  }

  return { checkedCount, updatedCount, failedCount };
}

/**
 * Simulate REST API call to Solum AIMS v2 server running on store's Access Point gateway
 */
async function simulateGatewayPush(labelId, sku, itemName, price, gateway) {
  // Simulating network delay for calling Solum AIMS server endpoints
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // 1. Create/Update Article in Solum AIMS Server: POST /api/v2/common/articles
  const articleUrl = `http://${gateway.gateway_ip}/api/v2/common/articles`;
  const articlePayload = [
    {
      articleId: sku,
      articleName: itemName,
      nfcUrl: "",
      data: {
        price: price.toString(),
        originPrice: price.toString(),
        uom: "pcs"
      }
    }
  ];
  console.log(`[SOLUM-AIMS-API] [${gateway.hostname}] Upserting Article: POST ${articleUrl}`);
  console.log(`[SOLUM-AIMS-API] Auth-Token: Bearer ${gateway.api_key || 'MOCK_TOKEN'}`);
  console.log(`[SOLUM-AIMS-API] Payload: ${JSON.stringify(articlePayload)}`);

  // 2. Link Label to Article in Solum AIMS Server: POST /api/v2/common/labels/link
  const linkUrl = `http://${gateway.gateway_ip}/api/v2/common/labels/link`;
  const linkPayload = {
    labelId: labelId,
    articleId: sku
  };
  console.log(`[SOLUM-AIMS-API] [${gateway.hostname}] Binding Tag to Article: POST ${linkUrl}`);
  console.log(`[SOLUM-AIMS-API] Payload: ${JSON.stringify(linkPayload)}`);
}

/**
 * Perform a TCP connection test to verify target gateway reachability
 */
function pingGateway(ip, port, timeout = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = 'offline';

    socket.setTimeout(timeout);

    socket.connect(port, ip, () => {
      status = 'online';
      socket.end();
    });

    socket.on('data', () => {
      status = 'online';
      socket.destroy();
    });

    socket.on('error', () => {
      status = 'offline';
      socket.destroy();
    });

    socket.on('timeout', () => {
      status = 'offline';
      socket.destroy();
    });

    socket.on('close', () => {
      resolve(status);
    });
  });
}

module.exports = { syncPrices };

// If run directly from terminal
if (require.main === module) {
  syncPrices();
}
