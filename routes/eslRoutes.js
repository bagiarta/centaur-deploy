import express from 'express';
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

const router = express.Router();

// Helper: Get HO Server Database Connection Pool
async function getHoServerPool(localPool) {
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
  const hoConfig = {
    user: hoConn.db_user,
    password: hoConn.db_password,
    server: hoIp,
    database: hoConn.db_name,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 60000
  };
  const hoPool = new sql.ConnectionPool(hoConfig);
  return hoPool.connect();
}

let crmPoolPromise = null;

async function getCrmPool(localPool) {
  if (crmPoolPromise) return crmPoolPromise;
  try {
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
    let config;

    if (device && device.db_user && device.db_password) {
      config = {
        user: device.db_user,
        password: device.db_password,
        server: device.ip,
        database: device.db_name,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 15000, requestTimeout: 60000
      };
    } else {
      config = {
        user: process.env.CRM_DB_USER || 'sa',
        password: process.env.CRM_DB_PASS || 'default_pass',
        server: process.env.CRM_DB_SERVER || '192.168.85.55',
        database: process.env.CRM_DB_NAME || 'DBWH_8555',
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 15000, requestTimeout: 60000
      };
    }

    const crmPool = new sql.ConnectionPool(config);
    crmPoolPromise = crmPool.connect();
    return crmPoolPromise;
  } catch (err) {
    console.error('❌ Failed to initialize CRM Pool in eslRoutes:', err.message);
    crmPoolPromise = null;
    throw err;
  }
}

/**
 * GET /api/esl/gateways
 * Fetch all Access Point gateways
 */
router.get('/gateways', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM ESL_GATEWAYS ORDER BY org_cd, hostname');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/esl/gateways
 * Add a new Access Point gateway
 */
router.post('/gateways', async (req, res) => {
  const { org_cd, gateway_ip, hostname, api_key } = req.body;
  if (!org_cd || !gateway_ip || !hostname) {
    return res.status(400).json({ error: 'org_cd, gateway_ip, and hostname are required.' });
  }

  try {
    const pool = await poolPromise;

    // Validate active store branch in DimStore using CRM Pool
    const crmPool = await getCrmPool(pool);
    const storeCheck = await crmPool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query(`
        SELECT 1 FROM DimStore 
        WHERE ORG_CD = @org_cd AND ORG_STATUS = 'O' AND ORG_LEVEL_NUMBER = 3
      `);
    if (storeCheck.recordset.length === 0) {
      return res.status(400).json({ error: `Store branch code '${org_cd}' is invalid, inactive, or not a branch.` });
    }

    await pool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .input('gateway_ip', sql.NVarChar, gateway_ip)
      .input('hostname', sql.NVarChar, hostname)
      .input('api_key', sql.NVarChar, api_key || null)
      .query(`
        INSERT INTO ESL_GATEWAYS (org_cd, gateway_ip, hostname, api_key, status, last_seen)
        VALUES (@org_cd, @gateway_ip, @hostname, @api_key, 'online', GETDATE())
      `);
    res.json({ success: true, message: 'Gateway registered successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/esl/gateways/:id
 * Update gateway details
 */
router.put('/gateways/:id', async (req, res) => {
  const { id } = req.params;
  const { org_cd, gateway_ip, hostname, api_key, status } = req.body;

  try {
    const pool = await poolPromise;

    // Validate active store branch in DimStore using CRM Pool
    const crmPool = await getCrmPool(pool);
    const storeCheck = await crmPool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query(`
        SELECT 1 FROM DimStore 
        WHERE ORG_CD = @org_cd AND ORG_STATUS = 'O' AND ORG_LEVEL_NUMBER = 3
      `);
    if (storeCheck.recordset.length === 0) {
      return res.status(400).json({ error: `Store branch code '${org_cd}' is invalid, inactive, or not a branch.` });
    }

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('org_cd', sql.NVarChar, org_cd)
      .input('gateway_ip', sql.NVarChar, gateway_ip)
      .input('hostname', sql.NVarChar, hostname)
      .input('api_key', sql.NVarChar, api_key || null)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE ESL_GATEWAYS 
        SET org_cd = @org_cd, gateway_ip = @gateway_ip, hostname = @hostname, api_key = @api_key, status = @status, updated_at = GETDATE()
        WHERE id = @id
      `);
    res.json({ success: true, message: 'Gateway updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/esl/gateways/:id
 * Delete a gateway Access Point
 */
router.delete('/gateways/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query('DELETE FROM ESL_GATEWAYS WHERE id = @id');
    res.json({ success: true, message: 'Gateway deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/esl/labels
 * Fetch labels with optional filters: search, status, org_cd
 */
router.get('/labels', async (req, res) => {
  try {
    const { search = '', status = '', org_cd = '' } = req.query;
    const pool = await poolPromise;
    const request = pool.request();
    
    let queryStr = `
      SELECT * FROM ESL_LABELS 
      WHERE 1=1
    `;

    if (search) {
      queryStr += ` AND (label_id LIKE @search OR itm_cd LIKE @search OR item_name LIKE @search)`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    if (status && status !== 'All') {
      queryStr += ` AND status = @status`;
      request.input('status', sql.NVarChar, status);
    }

    if (org_cd && org_cd !== 'All Stores') {
      queryStr += ` AND org_cd = @org_cd`;
      request.input('org_cd', sql.NVarChar, org_cd);
    }

    queryStr += ' ORDER BY org_cd, itm_cd';

    const result = await request.query(queryStr);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/esl/products
 * Fetch unique products mapped to ESLs
 */
router.get('/products', async (req, res) => {
  try {
    const { search = '', org_cd = '' } = req.query;
    const pool = await poolPromise;
    const request = pool.request();
    
    let queryStr = `
      SELECT org_cd, itm_cd, MAX(item_name) as item_name, MAX(current_price) as current_price, COUNT(label_id) as linked_labels
      FROM ESL_LABELS 
      WHERE 1=1
    `;

    if (search) {
      queryStr += ` AND (itm_cd LIKE @search OR item_name LIKE @search)`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    if (org_cd && org_cd !== 'All Stores') {
      queryStr += ` AND org_cd = @org_cd`;
      request.input('org_cd', sql.NVarChar, org_cd);
    }

    queryStr += ' GROUP BY org_cd, itm_cd ORDER BY org_cd, itm_cd';

    const result = await request.query(queryStr);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/esl/templates
 * Fetch all saved templates
 */
router.get('/templates', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM ESL_TEMPLATES ORDER BY updated_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/esl/templates
 * Create or update a template
 */
router.post('/templates', async (req, res) => {
  try {
    const { id, name, width, height, elements_json } = req.body;
    if (!name || !width || !height || !elements_json) {
      return res.status(400).json({ error: 'Missing required template fields.' });
    }
    const pool = await poolPromise;
    if (id) {
      await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar, name)
        .input('width', sql.Int, width)
        .input('height', sql.Int, height)
        .input('elements_json', sql.NVarChar, elements_json)
        .query(`
          UPDATE ESL_TEMPLATES 
          SET name = @name, width = @width, height = @height, elements_json = @elements_json, updated_at = GETDATE()
          WHERE id = @id
        `);
      res.json({ success: true, message: 'Template updated.' });
    } else {
      await pool.request()
        .input('name', sql.NVarChar, name)
        .input('width', sql.Int, width)
        .input('height', sql.Int, height)
        .input('elements_json', sql.NVarChar, elements_json)
        .query(`
          INSERT INTO ESL_TEMPLATES (name, width, height, elements_json)
          VALUES (@name, @width, @height, @elements_json)
        `);
      res.json({ success: true, message: 'Template saved.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/esl/templates/:id
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM ESL_TEMPLATES WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/esl/logs
 * Retrieve recent sync logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('limit', sql.Int, parseInt(limit))
      .query('SELECT TOP (@limit) * FROM ESL_SYNC_LOGS ORDER BY synced_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/esl/labels/associate
 * Associate a label MAC Address with a product PLU/SKU
 */
router.post('/labels/associate', async (req, res) => {
  let { label_id, org_cd, itm_cd } = req.body;
  if (!label_id || !org_cd || !itm_cd) {
    return res.status(400).json({ error: 'label_id, org_cd, and itm_cd are required.' });
  }

  try {
    const pool = await poolPromise;

    // Validate active store branch in DimStore using CRM Pool
    const crmPool = await getCrmPool(pool);
    const storeCheck = await crmPool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query(`
        SELECT 1 FROM DimStore 
        WHERE ORG_CD = @org_cd AND ORG_STATUS = 'O' AND ORG_LEVEL_NUMBER = 3
      `);
    if (storeCheck.recordset.length === 0) {
      return res.status(400).json({ error: `Store branch code '${org_cd}' is invalid, inactive, or not a branch.` });
    }
    
    // Find the item details from HO basic_sp_mst and item_mst
    let itemName = 'Unknown Item';
    let currentPrice = 0;
    let hoPool = null;
    let itemFound = false;

    try {
      hoPool = await getHoServerPool(pool);
      
      // Resolve barcode to itm_cd if possible using ITEM_UOM_MAPPING_MST
      const barcodeResult = await hoPool.request()
        .input('barcode', sql.NVarChar, itm_cd)
        .query('SELECT TOP 1 ium_itm_cd FROM ITEM_UOM_MAPPING_MST WHERE ium_bar_itm_cd = @barcode');
      
      if (barcodeResult.recordset.length > 0) {
        const resolvedItmCd = barcodeResult.recordset[0].ium_itm_cd;
        console.log(`[ESL-ASSOCIATE] Resolved barcode ${itm_cd} to item code ${resolvedItmCd}`);
        itm_cd = resolvedItmCd; // Use actual item code for all subsequent operations
      }

      // Fetch price from basic_sp_mst
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
        currentPrice = priceResult.recordset[0].latest_price || 0;
      }

      // Fetch name from item_mst
      const nameResult = await hoPool.request()
        .input('itm_cd', sql.NVarChar, itm_cd)
        .query('SELECT TOP 1 ITM_NAME AS item_name FROM item_mst WHERE ITM_CD = @itm_cd');
      if (nameResult.recordset.length > 0) {
        itemName = nameResult.recordset[0].item_name;
        itemFound = true;
      }
    } catch (hoErr) {
      console.error('[ESL-ASSOCIATE] Failed to fetch details from HO Server:', hoErr.message);
    } finally {
      if (hoPool) {
        try { await hoPool.close(); } catch (_) {}
      }
    }

    if (!itemFound) {
      return res.status(404).json({ error: `Product/Barcode '${itm_cd}' not found in master data.` });
    }

    // Check for an active online gateway for this store
    const gwResult = await pool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query("SELECT gateway_ip, hostname, api_key FROM ESL_GATEWAYS WHERE org_cd = @org_cd AND status = 'online'");

    const hasOnlineGateway = gwResult.recordset.length > 0;
    let labelStatus = hasOnlineGateway ? 'healthy' : 'pending';
    let logStatus = hasOnlineGateway ? 'success' : 'pending';
    let pushErrorMsg = '';

    // If gateway is online, attempt to push article & link to Solum AIMS
    if (hasOnlineGateway) {
      const gateway = gwResult.recordset[0];
      const articleUrl = `http://${gateway.gateway_ip}/api/v2/common/articles`;
      const linkUrl = `http://${gateway.gateway_ip}/api/v2/common/labels/link`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.api_key || ''}`
      };

      try {
        console.log(`[SOLUM-API] Pushing article to ${articleUrl} for SKU ${itm_cd}`);
        const articleRes = await fetch(articleUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify([{
            articleId: itm_cd,
            articleName: itemName,
            nfcUrl: "",
            data: { price: currentPrice.toString(), originPrice: currentPrice.toString(), uom: "pcs" }
          }])
        });
        
        const articleJson = await articleRes.json();
        console.log(`[SOLUM-API] Article Push Response: ${articleRes.status} - ${JSON.stringify(articleJson)}`);
        if (!articleRes.ok || articleJson.result === false) {
          throw new Error(`Article push failed: ${articleJson.errorMessage || articleJson.resultCode || articleRes.statusText}`);
        }

        console.log(`[SOLUM-API] Linking label ${label_id} -> article ${itm_cd} via ${linkUrl}`);
        const linkRes = await fetch(linkUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ labelId: label_id, articleId: itm_cd })
        });

        const linkResText = await linkRes.text();
        console.log(`[SOLUM-API] Label Link Response: ${linkRes.status} - ${linkResText}`);
        if (!linkRes.ok) throw new Error(`Label link failed: ${linkRes.statusText} - ${linkResText}`);
      } catch (pushErr) {
        console.error('[SOLUM-API] Error pushing to Gateway:', pushErr.message);
        labelStatus = 'sync_failed';
        logStatus = 'failed';
        pushErrorMsg = pushErr.message;
      }
    }

    // Merge/Upsert ESL label association
    await pool.request()
      .input('label_id', sql.NVarChar, label_id)
      .input('org_cd', sql.NVarChar, org_cd)
      .input('itm_cd', sql.NVarChar, itm_cd)
      .input('item_name', sql.NVarChar, itemName)
      .input('price', sql.Decimal(18, 2), currentPrice)
      .input('status', sql.NVarChar, labelStatus)
      .query(`
        MERGE INTO ESL_LABELS AS target
        USING (SELECT @label_id AS label_id) AS source
        ON (target.label_id = source.label_id)
        WHEN MATCHED THEN
          UPDATE SET org_cd = @org_cd, itm_cd = @itm_cd, item_name = @item_name, current_price = @price, status = @status, last_sync_dt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (label_id, org_cd, itm_cd, item_name, current_price, battery_level, signal_strength, status, last_sync_dt)
          VALUES (@label_id, @org_cd, @itm_cd, @item_name, @price, 100, -55, @status, GETDATE());
      `);

    // Log the association sync event
    await pool.request()
      .input('label_id', sql.NVarChar, label_id)
      .input('org_cd', sql.NVarChar, org_cd)
      .input('itm_cd', sql.NVarChar, itm_cd)
      .input('price', sql.Decimal(18, 2), currentPrice)
      .input('log_status', sql.NVarChar, logStatus)
      .input('error_msg', sql.NVarChar, pushErrorMsg || '')
      .query(`
        INSERT INTO ESL_SYNC_LOGS (org_cd, label_id, itm_cd, prev_price, new_price, status, error_msg)
        VALUES (@org_cd, @label_id, @itm_cd, 0, @price, @log_status, @error_msg)
      `);

    const message = hasOnlineGateway
      ? (logStatus === 'success' 
          ? `Label ${label_id} successfully mapped to SKU ${itm_cd} and pushed to gateway.`
          : `Label ${label_id} mapped to SKU ${itm_cd} but gateway push FAILED.`)
      : `Label ${label_id} mapped to SKU ${itm_cd} but gateway is OFFLINE — status set to 'pending'. Data will sync when the gateway comes online.`;

    res.json({ success: true, status: labelStatus, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/esl/labels/delete/:labelId
 * Unlink/remove a shelf label registration
 */
router.post('/labels/delete/:labelId', async (req, res) => {
  try {
    const { labelId } = req.params;
    const pool = await poolPromise;
    await pool.request()
      .input('label_id', sql.NVarChar, labelId)
      .query('DELETE FROM ESL_LABELS WHERE label_id = @label_id');
    res.json({ success: true, message: `Label ${labelId} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/esl/labels/:labelId
 * Update/edit an existing shelf label mapping (store branch, SKU)
 */
router.put('/labels/:labelId', async (req, res) => {
  const { labelId } = req.params;
  let { org_cd, itm_cd } = req.body;
  if (!org_cd || !itm_cd) {
    return res.status(400).json({ error: 'org_cd and itm_cd are required.' });
  }

  try {
    const pool = await poolPromise;

    // Validate that the label exists
    const existsResult = await pool.request()
      .input('label_id', sql.NVarChar, labelId)
      .query('SELECT 1 FROM ESL_LABELS WHERE label_id = @label_id');
    if (existsResult.recordset.length === 0) {
      return res.status(404).json({ error: `Label ${labelId} not found.` });
    }

    // Validate active store branch in DimStore using CRM Pool
    const crmPool = await getCrmPool(pool);
    const storeCheck = await crmPool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query(`
        SELECT 1 FROM DimStore 
        WHERE ORG_CD = @org_cd AND ORG_STATUS = 'O' AND ORG_LEVEL_NUMBER = 3
      `);
    if (storeCheck.recordset.length === 0) {
      return res.status(400).json({ error: `Store branch code '${org_cd}' is invalid, inactive, or not a branch.` });
    }

    // Fetch item details from HO Server
    let itemName = 'Unknown Item';
    let currentPrice = 0;
    let hoPool = null;
    let itemFound = false;

    try {
      hoPool = await getHoServerPool(pool);
      
      // Resolve barcode to itm_cd if possible using ITEM_UOM_MAPPING_MST
      const barcodeResult = await hoPool.request()
        .input('barcode', sql.NVarChar, itm_cd)
        .query('SELECT TOP 1 ium_itm_cd FROM ITEM_UOM_MAPPING_MST WHERE ium_bar_itm_cd = @barcode');
      
      if (barcodeResult.recordset.length > 0) {
        const resolvedItmCd = barcodeResult.recordset[0].ium_itm_cd;
        console.log(`[ESL-UPDATE] Resolved barcode ${itm_cd} to item code ${resolvedItmCd}`);
        itm_cd = resolvedItmCd; // Use actual item code for all subsequent operations
      }

      // Fetch price
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
        currentPrice = priceResult.recordset[0].latest_price || 0;
      }

      // Fetch name
      const nameResult = await hoPool.request()
        .input('itm_cd', sql.NVarChar, itm_cd)
        .query('SELECT TOP 1 ITM_NAME AS item_name FROM item_mst WHERE ITM_CD = @itm_cd');
      if (nameResult.recordset.length > 0) {
        itemName = nameResult.recordset[0].item_name;
        itemFound = true;
      }
    } catch (hoErr) {
      console.error('[ESL-UPDATE] Failed to fetch details from HO Server:', hoErr.message);
    } finally {
      if (hoPool) {
        try { await hoPool.close(); } catch (_) {}
      }
    }

    if (!itemFound) {
      return res.status(404).json({ error: `Product/Barcode '${itm_cd}' not found in master data.` });
    }

    // Check gateway availability
    const gwResult = await pool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query("SELECT gateway_ip, hostname, api_key FROM ESL_GATEWAYS WHERE org_cd = @org_cd AND status = 'online'");

    const hasOnlineGateway = gwResult.recordset.length > 0;
    let labelStatus = hasOnlineGateway ? 'healthy' : 'pending';
    let logStatus = hasOnlineGateway ? 'success' : 'pending';
    let pushErrorMsg = '';

    // If gateway is online, attempt to push article & link to Solum AIMS
    if (hasOnlineGateway) {
      const gateway = gwResult.recordset[0];
      const articleUrl = `http://${gateway.gateway_ip}/api/v2/common/articles`;
      const linkUrl = `http://${gateway.gateway_ip}/api/v2/common/labels/link`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.api_key || ''}`
      };

      try {
        console.log(`[SOLUM-API] Pushing article to ${articleUrl} for SKU ${itm_cd}`);
        const articleRes = await fetch(articleUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify([{
            articleId: itm_cd,
            articleName: itemName,
            nfcUrl: "",
            data: { price: currentPrice.toString(), originPrice: currentPrice.toString(), uom: "pcs" }
          }])
        });
        
        if (!articleRes.ok) throw new Error(`Article push failed: ${articleRes.statusText}`);

        console.log(`[SOLUM-API] Linking label ${labelId} -> article ${itm_cd} via ${linkUrl}`);
        const linkRes = await fetch(linkUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ labelId: labelId, articleId: itm_cd })
        });

        if (!linkRes.ok) throw new Error(`Label link failed: ${linkRes.statusText}`);
      } catch (pushErr) {
        console.error('[SOLUM-API] Error pushing to Gateway:', pushErr.message);
        labelStatus = 'sync_failed';
        logStatus = 'failed';
        pushErrorMsg = pushErr.message;
      }
    }

    // Update the label
    await pool.request()
      .input('label_id', sql.NVarChar, labelId)
      .input('org_cd', sql.NVarChar, org_cd)
      .input('itm_cd', sql.NVarChar, itm_cd)
      .input('item_name', sql.NVarChar, itemName)
      .input('price', sql.Decimal(18, 2), currentPrice)
      .input('status', sql.NVarChar, labelStatus)
      .query(`
        UPDATE ESL_LABELS 
        SET org_cd = @org_cd, itm_cd = @itm_cd, item_name = @item_name, current_price = @price, status = @status, last_sync_dt = GETDATE()
        WHERE label_id = @label_id
      `);

    // Log the update event
    await pool.request()
      .input('label_id', sql.NVarChar, labelId)
      .input('org_cd', sql.NVarChar, org_cd)
      .input('itm_cd', sql.NVarChar, itm_cd)
      .input('price', sql.Decimal(18, 2), currentPrice)
      .input('log_status', sql.NVarChar, logStatus)
      .input('error_msg', sql.NVarChar, pushErrorMsg || '')
      .query(`
        INSERT INTO ESL_SYNC_LOGS (org_cd, label_id, itm_cd, prev_price, new_price, status, error_msg)
        VALUES (@org_cd, @label_id, @itm_cd, 0, @price, @log_status, @error_msg)
      `);

    const message = hasOnlineGateway
      ? (logStatus === 'success' 
          ? `Label ${labelId} updated and synced to gateway.`
          : `Label ${labelId} updated but gateway push FAILED.`)
      : `Label ${labelId} updated but gateway is OFFLINE — status set to 'pending'.`;

    res.json({ success: true, status: labelStatus, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/esl/labels/refresh
 * Re-sync all pending/sync_failed labels — fetch fresh price & name from HO and push to gateways
 */
router.post('/labels/refresh', async (req, res) => {
  const { org_cd: targetOrgCd } = req.body;

  try {
    const pool = await poolPromise;

    // Fetch pending/failed labels
    let query = "SELECT label_id, org_cd, itm_cd, current_price FROM ESL_LABELS WHERE status IN ('pending', 'sync_failed')";
    const request = pool.request();
    if (targetOrgCd) {
      query += ' AND org_cd = @org_cd';
      request.input('org_cd', sql.NVarChar, targetOrgCd);
    }
    const labelsResult = await request.query(query);
    const pendingLabels = labelsResult.recordset;

    if (pendingLabels.length === 0) {
      return res.json({ success: true, message: 'No pending or failed labels to refresh.', refreshed: 0, failed: 0 });
    }

    // Fetch online gateways grouped by org_cd
    const gatewaysResult = await pool.request().query("SELECT org_cd, gateway_ip, hostname FROM ESL_GATEWAYS WHERE status = 'online'");
    const gatewaysByOrg = {};
    gatewaysResult.recordset.forEach(gw => {
      if (!gatewaysByOrg[gw.org_cd]) gatewaysByOrg[gw.org_cd] = [];
      gatewaysByOrg[gw.org_cd].push(gw);
    });

    // Connect to HO Server
    let hoPool = null;
    try {
      hoPool = await getHoServerPool(pool);
    } catch (hoErr) {
      console.error('[ESL-REFRESH] Warning: Could not connect to HO Server:', hoErr.message);
    }

    let refreshed = 0;
    let failed = 0;
    const errors = [];

    for (const label of pendingLabels) {
      const { label_id, org_cd, itm_cd } = label;

      try {
        // Check gateway availability
        const storeGateways = gatewaysByOrg[org_cd] || [];
        if (storeGateways.length === 0) {
          throw new Error(`No online gateway for store ${org_cd}`);
        }

        // Fetch fresh price from HO
        let latestPrice = 0;
        let itemName = 'Unknown Item';

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
          }

          const nameResult = await hoPool.request()
            .input('itm_cd', sql.NVarChar, itm_cd)
            .query('SELECT TOP 1 ITM_NAME AS item_name FROM item_mst WHERE ITM_CD = @itm_cd');
          if (nameResult.recordset.length > 0) {
            itemName = nameResult.recordset[0].item_name;
          }
        }

        // Update label to healthy
        await pool.request()
          .input('label_id', sql.NVarChar, label_id)
          .input('price', sql.Decimal(18, 2), latestPrice)
          .input('item_name', sql.NVarChar, itemName)
          .query(`
            UPDATE ESL_LABELS 
            SET current_price = @price, item_name = @item_name, status = 'healthy', last_sync_dt = GETDATE()
            WHERE label_id = @label_id
          `);

        // Log success
        await pool.request()
          .input('org_cd', sql.NVarChar, org_cd)
          .input('label_id', sql.NVarChar, label_id)
          .input('itm_cd', sql.NVarChar, itm_cd)
          .input('price', sql.Decimal(18, 2), latestPrice)
          .query(`
            INSERT INTO ESL_SYNC_LOGS (org_cd, label_id, itm_cd, prev_price, new_price, status)
            VALUES (@org_cd, @label_id, @itm_cd, 0, @price, 'success')
          `);

        refreshed++;
      } catch (labelErr) {
        failed++;
        errors.push(`${label_id}: ${labelErr.message}`);
      }
    }

    if (hoPool) {
      try { await hoPool.close(); } catch (_) {}
    }

    res.json({
      success: true,
      message: `Refreshed ${refreshed} labels, ${failed} still pending.`,
      refreshed,
      failed,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/esl/labels/import
 * Bulk import shelf label mappings (JSON array format)
 */
router.post('/labels/import', async (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'mappings must be an array.' });
  }

  let imported = 0;
  let skipped = 0;
  const errors = [];
  let hoPool = null;

  try {
    const pool = await poolPromise;
    const crmPool = await getCrmPool(pool);

    try {
      hoPool = await getHoServerPool(pool);
    } catch (hoErr) {
      console.error('[ESL-IMPORT] Warning: Could not connect to HO Server, falling back to local name lookup:', hoErr.message);
    }

    // Cache gateway online status per org_cd to avoid repeated queries
    const gatewayStatusCache = {};

    for (const item of mappings) {
      const { label_id, org_cd, itm_cd } = item;

      if (!label_id || !org_cd || !itm_cd) {
        skipped++;
        errors.push(`Row skipped: missing label_id, org_cd, or itm_cd.`);
        continue;
      }

      try {
        // Validate active store branch in DimStore using CRM Pool
        const storeCheck = await crmPool.request()
          .input('org_cd', sql.NVarChar, org_cd)
          .query(`
            SELECT 1 FROM DimStore 
            WHERE ORG_CD = @org_cd AND ORG_STATUS = 'O' AND ORG_LEVEL_NUMBER = 3
          `);
        if (storeCheck.recordset.length === 0) {
          skipped++;
          errors.push(`Label ${label_id}: Store branch ${org_cd} is invalid, inactive, or not a branch.`);
          continue;
        }

        // Fetch item name from HO Server item_mst or fallback locally
        let item_name = 'Imported Item';
        let nameFound = false;

        if (hoPool && hoPool.connected) {
          const nameResult = await hoPool.request()
            .input('itm_cd', sql.NVarChar, itm_cd)
            .query('SELECT TOP 1 ITM_NAME AS item_name FROM item_mst WHERE ITM_CD = @itm_cd');
          if (nameResult.recordset.length > 0) {
            item_name = nameResult.recordset[0].item_name;
            nameFound = true;
          }
        }

        if (!nameFound) {
          const itemResult = await pool.request()
            .input('itm_cd', sql.NVarChar, itm_cd)
            .input('org_cd', sql.NVarChar, org_cd)
            .query('SELECT TOP 1 item_name FROM ITEM_SALES_MEMBER WHERE itm_cd = @itm_cd AND org_cd = @org_cd');
          if (itemResult.recordset.length > 0) {
            item_name = itemResult.recordset[0].item_name;
          }
        }

        // Check if gateway is online for this store (cached per org_cd)
        if (!(org_cd in gatewayStatusCache)) {
          const gwCheck = await pool.request()
            .input('org_cd', sql.NVarChar, org_cd)
            .query("SELECT 1 FROM ESL_GATEWAYS WHERE org_cd = @org_cd AND status = 'online'");
          gatewayStatusCache[org_cd] = gwCheck.recordset.length > 0;
        }
        const hasOnlineGw = gatewayStatusCache[org_cd];
        const labelStatus = hasOnlineGw ? 'healthy' : 'pending';

        // Check if label already exists
        const existsResult = await pool.request()
          .input('label_id', sql.NVarChar, label_id)
          .query('SELECT 1 FROM ESL_LABELS WHERE label_id = @label_id');

        if (existsResult.recordset.length > 0) {
          // Update mapping
          await pool.request()
            .input('label_id', sql.NVarChar, label_id)
            .input('org_cd', sql.NVarChar, org_cd)
            .input('itm_cd', sql.NVarChar, itm_cd)
            .input('item_name', sql.NVarChar, item_name)
            .input('status', sql.NVarChar, labelStatus)
            .query('UPDATE ESL_LABELS SET org_cd = @org_cd, itm_cd = @itm_cd, item_name = @item_name, status = @status, updated_at = GETDATE() WHERE label_id = @label_id');
        } else {
          // Insert new mapping
          await pool.request()
            .input('label_id', sql.NVarChar, label_id)
            .input('org_cd', sql.NVarChar, org_cd)
            .input('itm_cd', sql.NVarChar, itm_cd)
            .input('item_name', sql.NVarChar, item_name)
            .input('status', sql.NVarChar, labelStatus)
            .query(`
              INSERT INTO ESL_LABELS (label_id, org_cd, itm_cd, item_name, current_price, battery_level, signal_strength, status)
              VALUES (@label_id, @org_cd, @itm_cd, @item_name, 0.0, 100, -55, @status)
            `);
        }

        imported++;
      } catch (err) {
        skipped++;
        errors.push(`Label ${label_id}: ${err.message}`);
      }
    }

    res.json({ success: true, message: `Imported ${imported} mappings, skipped ${skipped}.`, imported, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (hoPool) {
      try { await hoPool.close(); } catch (_) {}
    }
  }
});

/**
 * POST /api/esl/sync/trigger
 * Manually trigger the ESL pricing sync process
 */
router.post('/sync/trigger', async (req, res) => {
  const { org_cd } = req.body;
  try {
    const { syncPrices } = await import('../scripts/sync_esl_engine.cjs');
    const syncResult = await syncPrices(org_cd || null);
    res.json({ success: true, ...syncResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/esl/labels/blink/:labelId
 * Trigger Solum AIMS LED flash command
 */
router.post('/labels/blink/:labelId', async (req, res) => {
  const { labelId } = req.params;
  try {
    const pool = await poolPromise;
    // 1. Get the label to find its store branch
    const labelResult = await pool.request()
      .input('label_id', sql.NVarChar, labelId)
      .query('SELECT org_cd, itm_cd, item_name FROM ESL_LABELS WHERE label_id = @label_id');
    
    if (labelResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Label not found' });
    }
    const { org_cd } = labelResult.recordset[0];

    // 2. Find active Solum AIMS Gateway for this store
    const gwResult = await pool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query("SELECT gateway_ip, hostname, api_key FROM ESL_GATEWAYS WHERE org_cd = @org_cd AND status = 'online'");

    if (gwResult.recordset.length === 0) {
      return res.status(400).json({ error: `No active Solum Gateway AP online for store branch ${org_cd}.` });
    }
    const gateway = gwResult.recordset[0];

    // 3. Call Solum AIMS REST API endpoint /api/v2/common/labels/blink
    const blinkUrl = `http://${gateway.gateway_ip}/api/v2/common/labels/blink`;
    console.log(`[SOLUM-API] Sending POST request to ${blinkUrl}`);
    
    const blinkRes = await fetch(blinkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.api_key || ''}`
      },
      body: JSON.stringify({ labelId, duration: 10, color: 'GREEN' })
    });

    const blinkResText = await blinkRes.text();
    console.log(`[SOLUM-API] Flash LED Response: ${blinkRes.status} - ${blinkResText}`);

    if (!blinkRes.ok) {
      throw new Error(`Failed to send LED blink command: ${blinkRes.statusText} - ${blinkResText}`);
    }

    res.json({ 
      success: true, 
      message: `LED command transmitted to Solum Gateway [${gateway.hostname}]. Label ${labelId} is now blinking.` 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
