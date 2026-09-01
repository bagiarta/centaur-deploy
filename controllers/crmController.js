import sql from 'mssql';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { poolPromise } from '../config/db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { runSync: runHoServerDimItemSync } = require('../scripts/sync_hoserver_dim_item.cjs');
const { runSync: runItemSalesSync } = require('../scripts/sync_dev_item_sales_member.cjs');

let devEtlLogs = [];
let devEtlRunning = false;
let crmPoolPromise = null;

async function getCrmPool() {
  if (crmPoolPromise) return crmPoolPromise;
  try {
    const pool = await poolPromise;
    const deviceRes = await pool.request()
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
    console.error("Failed to connect to CRM Pool", err);
    throw err;
  }
}

async function getHoServerPool() {
  const pool = await poolPromise;

  // Dynamic lookup for HOSERVER
  const hoDevRes = await pool.request()
    .input('hostname', sql.NVarChar, 'HOSERVER')
    .query('SELECT id, ip FROM Devices WHERE hostname = @hostname');

  if (hoDevRes.recordset.length === 0) throw new Error('HOSERVER device not found in Devices table');

  const { id: hoDeviceId, ip: dbIp } = hoDevRes.recordset[0];
  // Per user request, ensure we use 192.168.85.18 if the record says otherwise or just confirm it
  const hoIp = (dbIp === '192.168.85.18' || dbIp.includes('85.18')) ? dbIp : '192.168.85.18';

  const hoConnRes = await pool.request()
    .input('did', sql.NVarChar, hoDeviceId)
    .query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');

  if (hoConnRes.recordset.length === 0) throw new Error('HOSERVER DB connection not configured in DeviceDbConnections');

  const hoConn = hoConnRes.recordset[0];
  console.log(`[CRM] Connecting to HO Database at ${hoIp} (DB: ${hoConn.db_name}, User: ${hoConn.db_user})`);

  const hoPool = new sql.ConnectionPool({
    user: hoConn.db_user,
    password: hoConn.db_password,
    server: hoIp,
    database: hoConn.db_name,
    options: {
      encrypt: false,
      enableArithAbort: true,
      trustServerCertificate: true,
      connectTimeout: 15000
    },
    pool: { max: 1, min: 0, idleTimeoutMillis: 30000 }
  });

  try {
    await hoPool.connect();
    const checkDb = await hoPool.request().query('SELECT DB_NAME() as current_db');
    console.log(`[CRM] Connected. Current DB: ${checkDb.recordset[0].current_db}`);
    return hoPool;
  } catch (err) {
    console.error(`[CRM] Failed to connect to HO Server (${hoIp}):`, err.message);
    throw err;
  }
}

export const getCrmSyncStatusLegacy = async (req, res) => {
  try {
    const pool = await poolPromise;

    // Fetch HOSERVER connection
    const hoDevRes = await pool.request()
      .input('hostname', sql.NVarChar, 'HOSERVER')
      .query('SELECT id, ip FROM Devices WHERE hostname = @hostname');

    if (hoDevRes.recordset.length === 0) {
      return res.status(404).json({ error: 'HOSERVER device not found.' });
    }

    const { id: hoDeviceId, ip: hoIp } = hoDevRes.recordset[0];
    const hoConnRes = await pool.request()
      .input('did', sql.NVarChar, hoDeviceId)
      .query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');

    if (hoConnRes.recordset.length === 0) {
      return res.status(404).json({ error: 'HOSERVER DB credentials not configured.' });
    }

    const hoConn = hoConnRes.recordset[0];
    const hoPool = new sql.ConnectionPool({
      user: hoConn.db_user,
      password: hoConn.db_password,
      server: hoIp,
      database: hoConn.db_name,
      options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
      connectionTimeout: 10000,
      requestTimeout: 15000
    });
    await hoPool.connect();

    const crmRes = await hoPool.request().query(`
      SELECT
        CONVERT(date, last_timestamp) as sync_date,
        CASE WHEN CONVERT(date, last_timestamp) = CONVERT(date, GETDATE()) THEN 1 ELSE 0 END as is_today,
        SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced_count,
        SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending_count
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -1, GETDATE()))
      GROUP BY CONVERT(date, last_timestamp)
      ORDER BY sync_date DESC
    `);
    await hoPool.close();

    // Label is determined by SQL Server (is_today flag) â€” no JS timezone issues
    const rows = crmRes.recordset.map(r => ({
      label: r.is_today === 1 ? 'Today' : 'Yesterday',
      synced_count: r.synced_count || 0,
      pending_count: r.pending_count || 0,
      total: (r.synced_count || 0) + (r.pending_count || 0),
      date: r.sync_date
    }));

    res.json(rows);
  } catch (err) {
    console.error('Reports CRM Sync Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

const h2hConfig = {
  baseUrl: (process.env.H2H_BASE_URL || '').replace(/\/$/, ''),
  clientId: process.env.H2H_CLIENT_ID,
  clientSecret: process.env.H2H_CLIENT_SECRET,
  username: process.env.H2H_USERNAME,
  password: process.env.H2H_PASSWORD,
  clientCode: process.env.H2H_CLIENT_CODE,
  verifySsl: process.env.H2H_VERIFY_SSL === 'true'
};

let h2hTokenCache = {
  token: null,
  expiresAt: 0
};

async function getH2hToken() {
  const now = Date.now();
  if (h2hTokenCache.token && h2hTokenCache.expiresAt > now) {
    return h2hTokenCache.token;
  }

  console.log('\uD83D\uDD04 Fetching new H2H CRM token...');

  const fetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: h2hConfig.username,
      password: h2hConfig.password,
      client_id: h2hConfig.clientId,
      client_secret: h2hConfig.clientSecret
    })
  };

  const response = await fetch(`${h2hConfig.baseUrl}/oauth/token`, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('H2H Token Error:', response.status, errorText);
    throw new Error(`H2H Token Error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('H2H Token Error: access_token not found in response');
  }

  h2hTokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in - 300) * 1000 // 5 min buffer
  };

  return h2hTokenCache.token;
}

export const getApiCrmCustomerPhone = async (req, res) => {
  const { phone } = req.params;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  try {
    const token = await getH2hToken();

    const apiUrl = `${h2hConfig.baseUrl}/api/v1/tenant/customer/${phone}?client_code=${h2hConfig.clientCode}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.message || `H2H API Error: ${response.status}`,
        details: errorData
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('CRM Lookup Error:', err.message);
    res.status(500).json({ error: 'Failed to connect to H2H CRM.', message: err.message });
  }
}

export const getApiDevLoyaltyStats = async (req, res) => {
  const { fromDate, toDate, store = '' } = req.query;
  try {
    const pool = await poolPromise;
    const request = pool.request();

    let whereClause = "WHERE 1=1";
    if (fromDate && toDate) {
      whereClause += " AND summary_date BETWEEN @fromDate AND @toDate";
      request.input('fromDate', sql.Date, fromDate);
      request.input('toDate', sql.Date, toDate);
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND org_cd = @store";
      request.input('store', sql.NVarChar, store);
    }

    const statsRes = await request.query(`
      SELECT 
        ISNULL(COUNT(DISTINCT member_id), 0) AS totalProfiles,
        ISNULL(SUM(total_sales), 0) AS totalSpend,
        ISNULL(SUM(total_txn), 0) AS totalTransactions
      FROM LOYAL_MEMBER_DAILY_SUMMARY
      ${whereClause}
    `);
    const stats = statsRes.recordset[0];

    const achCountRes = await pool.request().query("SELECT COUNT(1) AS totalAchievements FROM LOYAL_MEMBER_ACHIEVEMENT");
    const totalAchievements = achCountRes.recordset[0].totalAchievements || 0;

    res.json({
      totalProfiles: stats.totalProfiles,
      totalSpend: stats.totalSpend,
      totalTransactions: stats.totalTransactions,
      totalAchievements: totalAchievements
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const getApiDevLoyaltySummary = async (req, res) => {
  const { page = 1, perPage = 50, search = '', sortBy = 'summary_date', sortDir = 'desc', fromDate, toDate, store = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(perPage);
  const limit = parseInt(perPage);
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowedSortCols = ['summary_date', 'total_sales', 'total_margin', 'total_txn', 'member_id', 'org_cd'];
  const safeSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'summary_date';

  try {
    const pool = await poolPromise;
    let whereClause = "WHERE 1=1";
    const request = pool.request();

    if (search) {
      whereClause += " AND s.member_id LIKE @search";
      request.input('search', sql.NVarChar, `%${search}%`);
    }
    if (fromDate && toDate) {
      whereClause += " AND s.summary_date BETWEEN @fromDate AND @toDate";
      request.input('fromDate', sql.Date, fromDate);
      request.input('toDate', sql.Date, toDate);
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND s.org_cd = @store";
      request.input('store', sql.NVarChar, store);
    }

    const countRes = await request.query(`
      SELECT COUNT(1) AS total FROM LOYAL_MEMBER_DAILY_SUMMARY s ${whereClause}
    `);
    const total = countRes.recordset[0].total;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const result = await request.query(`
      SELECT s.*, p.name, p.mobile_no 
      FROM LOYAL_MEMBER_DAILY_SUMMARY s
      LEFT JOIN LOYAL_MEMBER_PROFILE p ON s.member_id = p.member_id
      ${whereClause}
      ORDER BY s.${safeSortCol} ${safeSortDir}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({ summaries: result.recordset, total, page: parseInt(page), perPage: limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const getApiDevLoyaltyProfiles = async (req, res) => {
  const { page = 1, perPage = 50, search = '', sortBy = 'total_spent', sortDir = 'desc', fromDate, toDate, store = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(perPage);
  const limit = parseInt(perPage);
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowedSortCols = ['total_spent', 'total_transactions', 'member_id', 'name', 'last_active_date'];
  const safeSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'total_spent';

  try {
    const pool = await poolPromise;
    let whereClause = "WHERE 1=1";
    const request = pool.request();

    if (search) {
      whereClause += " AND (member_id LIKE @search OR name LIKE @search OR mobile_no LIKE @search OR city LIKE @search)";
      request.input('search', sql.NVarChar, `%${search}%`);
    }
    if (fromDate && toDate) {
      whereClause += " AND member_id IN (SELECT DISTINCT member_id FROM LOYAL_MEMBER_DAILY_SUMMARY WHERE summary_date BETWEEN @fromDate AND @toDate)";
      request.input('fromDate', sql.Date, fromDate);
      request.input('toDate', sql.Date, toDate);
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND member_id IN (SELECT DISTINCT member_id FROM LOYAL_MEMBER_DAILY_SUMMARY WHERE org_cd = @store)";
      request.input('store', sql.NVarChar, store);
    }

    const countRes = await request.query(`
      SELECT COUNT(1) AS total FROM LOYAL_MEMBER_PROFILE ${whereClause}
    `);
    const total = countRes.recordset[0].total;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const profilesRes = await request.query(`
      SELECT * FROM LOYAL_MEMBER_PROFILE 
      ${whereClause}
      ORDER BY ${safeSortCol} ${safeSortDir}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    const profiles = profilesRes.recordset;

    if (profiles.length === 0) {
      return res.json({ profiles: [], total, page: parseInt(page), perPage: limit });
    }

    const memberIds = profiles.map(p => p.member_id);

    const chunkArray = (arr, size) => {
      const res = [];
      for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
      return res;
    };
    const idChunks = chunkArray(memberIds, 500);

    const allSummaries = [];
    const allPromos = [];

    for (const chunk of idChunks) {
      if (chunk.length === 0) continue;

      const idPlaceholders = chunk.map((id, idx) => `@id_${idx}`).join(', ');

      let summaryQuery = `
        SELECT * FROM LOYAL_MEMBER_DAILY_SUMMARY 
        WHERE member_id IN (${idPlaceholders})
      `;
      const sumRequest = pool.request();
      chunk.forEach((id, idx) => sumRequest.input(`id_${idx}`, sql.NVarChar, id));

      if (fromDate && toDate) {
        summaryQuery += " AND summary_date BETWEEN @fromDate AND @toDate";
        sumRequest.input('fromDate', sql.Date, fromDate);
        sumRequest.input('toDate', sql.Date, toDate);
      }
      if (store && store !== 'All Stores') {
        summaryQuery += " AND org_cd = @store";
        sumRequest.input('store', sql.NVarChar, store);
      }

      const sumRes = await sumRequest.query(summaryQuery);
      allSummaries.push(...sumRes.recordset);

      let promoQuery = `
        SELECT card_no, itm_cd, item_name, promo_detail, SUM(disc_amt) AS total_disc, SUM(qty) AS total_qty
        FROM ITEM_SALES_MEMBER 
        WHERE card_no IN (${idPlaceholders}) AND disc_amt > 0
      `;
      const promoRequest = pool.request();
      chunk.forEach((id, idx) => promoRequest.input(`id_${idx}`, sql.NVarChar, id));

      if (fromDate && toDate) {
        promoQuery += " AND bill_dt >= @fromDate AND bill_dt <= @toDate";
        promoRequest.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        promoRequest.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (store && store !== 'All Stores') {
        promoQuery += " AND org_cd = @store";
        promoRequest.input('store', sql.NVarChar, store);
      }

      promoQuery += `
        GROUP BY card_no, itm_cd, item_name, promo_detail
        ORDER BY total_disc DESC
      `;
      const promoRes = await promoRequest.query(promoQuery);
      allPromos.push(...promoRes.recordset);
    }

    // Group promos by card_no (member_id)
    const promosByMember = {};
    allPromos.forEach(pr => {
      if (!promosByMember[pr.card_no]) promosByMember[pr.card_no] = [];
      promosByMember[pr.card_no].push(pr);
    });

    // Group summaries by member_id
    const summariesByMember = {};
    allSummaries.forEach(s => {
      if (!summariesByMember[s.member_id]) summariesByMember[s.member_id] = [];
      summariesByMember[s.member_id].push(s);
    });

    // Evaluate achievements and compute stats dynamically
    const { evaluateAchievements } = require('../scripts/loyalty_achievements.cjs');

    const result = profiles.map(p => {
      const memberSummaries = summariesByMember[p.member_id] || [];

      // Calculate dynamic spent and txn based on filtered summaries
      let dynamicSpent = 0;
      let dynamicTxn = 0;
      memberSummaries.forEach(s => {
        dynamicSpent += s.total_sales;
        dynamicTxn += s.total_txn;
      });

      const mockProfile = {
        ...p,
        total_spent: dynamicSpent,
        total_transactions: dynamicTxn
      };

      const dynamicAchievements = evaluateAchievements(p.member_id, mockProfile, memberSummaries);

      return {
        ...p,
        total_spent: dynamicSpent,
        total_transactions: dynamicTxn,
        achievements: dynamicAchievements.map(ach => {
          let criteria = ach.criteria;
          if (ach.name === 'Promo Hunter') {
            const memberPromos = promosByMember[p.member_id] || [];
            if (memberPromos.length > 0) {
              const promoDetails = memberPromos.map(pr => `- ${pr.item_name} (${pr.promo_detail || 'Promo'}): Saved Rp ${Math.round(pr.total_disc).toLocaleString('id-ID')}`).join('\n');
              criteria += `\n\nPromo items bought:\n${promoDetails}`;
            }
          }
          return {
            name: ach.name,
            unlocked_at: new Date(),
            criteria_met: criteria
          };
        })
      };
    });

    res.json({ profiles: result, total, page: parseInt(page), perPage: limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const getApiDevLoyaltyItemsales = async (req, res) => {
  const { page = 1, perPage = 50, search = '', sortBy = 'bill_dt', sortDir = 'desc', fromDate, toDate, store = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(perPage);
  const limit = parseInt(perPage);
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowedSortCols = ['bill_dt', 'org_cd', 'card_no', 'item_name', 'qty', 'gross_value'];
  const safeSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'bill_dt';

  try {
    const pool = await poolPromise;
    let whereClause = "WHERE 1=1";
    const request = pool.request();

    if (search) {
      whereClause += ` AND (
        m.itm_cd LIKE @search OR 
        m.item_name LIKE @search OR 
        m.card_no LIKE @search OR 
        A4.anm_desc LIKE @search OR
        A7.anm_desc LIKE @search OR
        COALESCE(p1.name, p2.name) LIKE @search OR
        COALESCE(p1.mobile_no, p2.mobile_no) LIKE @search
      )`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }
    if (fromDate && toDate) {
      whereClause += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
      request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
      request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND m.org_cd = @store";
      request.input('store', sql.NVarChar, store);
    }

    const countRes = await request.query(`
      SELECT COUNT(1) AS total 
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN LOYAL_MEMBER_PROFILE p1 ON m.card_no = p1.member_id
      LEFT JOIN LOYAL_MEMBER_PROFILE p2 ON m.card_no = p2.mobile_no
      LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
      LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
      ${whereClause}
    `);
    const total = countRes.recordset[0].total;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const salesRes = await request.query(`
      SELECT 
          m.id, m.org_cd, m.itm_cd, m.item_name, m.qty, m.uom, m.promo_item_flag, m.promo_detail, m.disc_amt, m.bill_dt, m.card_no,
          COALESCE(p1.name, p2.name) as member_name,
          A2.anm_desc AS division,
          A3.anm_desc AS groups,
          A4.anm_desc AS department,
          A5.anm_desc AS class,
          A6.anm_desc AS sub_class,
          A7.anm_desc AS brand,
          A8.anm_desc AS principle,
          A9.anm_desc AS sources,
          A10.anm_desc AS size_measure,
          A11.anm_desc AS plano_name,
          A13.anm_desc AS returnable,
          A18.anm_desc AS item_type
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN LOYAL_MEMBER_PROFILE p1 ON m.card_no = p1.member_id
      LEFT JOIN LOYAL_MEMBER_PROFILE p2 ON m.card_no = p2.mobile_no
      LEFT JOIN attribute_nesting_mst A2 ON m.division = A2.anm_attr_cd AND A2.anm_attr = 'ATTR2'
      LEFT JOIN attribute_nesting_mst A3 ON m.groups = A3.anm_attr_cd AND A3.anm_attr = 'ATTR3'
      LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
      LEFT JOIN attribute_nesting_mst A5 ON m.class = A5.anm_attr_cd AND A5.anm_attr = 'ATTR5'
      LEFT JOIN attribute_nesting_mst A6 ON m.sub_class = A6.anm_attr_cd AND A6.anm_attr = 'ATTR6'
      LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
      LEFT JOIN attribute_nesting_mst A8 ON m.principle = A8.anm_attr_cd AND A8.anm_attr = 'ATTR8'
      LEFT JOIN attribute_nesting_mst A9 ON m.sources = A9.anm_attr_cd AND A9.anm_attr = 'ATTR9'
      LEFT JOIN attribute_nesting_mst A10 ON m.size_measure = A10.anm_attr_cd AND A10.anm_attr = 'ATTR10'
      LEFT JOIN attribute_nesting_mst A11 ON m.plano_name = A11.anm_attr_cd AND A11.anm_attr = 'ATTR11'
      LEFT JOIN attribute_nesting_mst A13 ON m.returnable = A13.anm_attr_cd AND A13.anm_attr = 'ATTR13'
      LEFT JOIN attribute_nesting_mst A18 ON m.item_type = A18.anm_attr_cd AND A18.anm_attr = 'ATTR18'
      ${whereClause}
      ORDER BY m.${safeSortCol} ${safeSortDir}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    // Fetch names from DBWH_8555
    const uniqueCards = [...new Set(salesRes.recordset.map(r => r.card_no))].filter(Boolean);
    if (uniqueCards.length > 0) {
      try {
        const crmPool = await getCrmPool();
        const nameMap = new Map();
        const batchSize = 1000;

        for (let i = 0; i < uniqueCards.length; i += batchSize) {
          const batch = uniqueCards.slice(i, i + batchSize);
          const nameReq = crmPool.request();
          const cardParams = batch.map((c, idx) => {
            nameReq.input('c' + idx, sql.NVarChar, c);
            return '@c' + idx;
          }).join(',');

          const namesRes = await nameReq.query(`SELECT MEMBER_ID, PHONE_NUMBER, CUST_NAME FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK) WHERE MEMBER_ID IN (${cardParams}) OR PHONE_NUMBER IN (${cardParams})`);
          namesRes.recordset.forEach(n => {
            if (n.MEMBER_ID) nameMap.set(n.MEMBER_ID, n.CUST_NAME);
            if (n.PHONE_NUMBER) nameMap.set(n.PHONE_NUMBER, n.CUST_NAME);
          });
        }

        salesRes.recordset.forEach(r => {
          r.member_name = nameMap.get(r.card_no) || r.member_name;
        });
      } catch (err) {
        console.error("Failed to fetch names from DBWH_8555:", err.message);
      }
    }

    // Top Departments Aggregation
    const deptRequest = pool.request();
    let deptWhere = "WHERE 1=1";
    if (fromDate && toDate) {
      deptWhere += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
      deptRequest.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
      deptRequest.input('toDate', sql.VarChar, toDate + ' 23:59:59');
    }
    if (store && store !== 'All Stores') {
      deptWhere += " AND m.org_cd = @store";
      deptRequest.input('store', sql.NVarChar, store);
    }
    const deptRes = await deptRequest.query(`
      SELECT TOP 5 ISNULL(A4.anm_desc, 'UNKNOWN') as department, SUM(m.qty) as total_qty, COUNT(1) as tx_count
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
      ${deptWhere}
      GROUP BY A4.anm_desc
      ORDER BY total_qty DESC
    `);

    // Top Brands Aggregation
    const brandRequest = pool.request();
    let brandWhere = "WHERE 1=1";
    if (fromDate && toDate) {
      brandWhere += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
      brandRequest.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
      brandRequest.input('toDate', sql.VarChar, toDate + ' 23:59:59');
    }
    if (store && store !== 'All Stores') {
      brandWhere += " AND m.org_cd = @store";
      brandRequest.input('store', sql.NVarChar, store);
    }
    const brandRes = await brandRequest.query(`
      SELECT TOP 5 ISNULL(A7.anm_desc, 'UNKNOWN') as brand, SUM(m.qty) as total_qty, COUNT(1) as tx_count
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
      ${brandWhere}
      GROUP BY A7.anm_desc
      ORDER BY total_qty DESC
    `);

    res.json({
      sales: salesRes.recordset,
      total,
      deptStats: deptRes.recordset,
      brandStats: brandRes.recordset,
      page: parseInt(page),
      perPage: limit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const exportDevLoyalty = async (req, res) => {
  const { tab, format } = req.params;
  if (format !== 'excel') return res.status(400).json({ error: 'Only excel supported for now' });

  const { store, fromDate, toDate, search } = req.query;

  try {
    const pool = await poolPromise;
    const request = pool.request();
    let query = "";
    let columns = [];
    let title = "";

    if (tab === 'profiles') {
      title = "Member Profiles";
      columns = [
        { header: 'Member ID', key: 'member_id', width: 20 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Phone', key: 'mobile_no', width: 15 },
        { header: 'Join Date', key: 'join_date', width: 15 },
        { header: 'City', key: 'city', width: 15 },
        { header: 'Total Spent', key: 'total_spent', width: 15 },
        { header: 'Total Txn', key: 'total_transactions', width: 10 },
        { header: 'Last Active', key: 'last_active_date', width: 15 },
        { header: 'Fav Store', key: 'favorite_store', width: 15 }
      ];

      let where = "WHERE 1=1";
      if (store && store !== 'All Stores') {
        where += " AND favorite_store = @store";
        request.input('store', sql.NVarChar, store);
      }
      if (fromDate && toDate) {
        where += " AND join_date >= @fromDate AND join_date <= @toDate";
        request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (search) {
        where += " AND (member_id LIKE @search OR name LIKE @search OR mobile_no LIKE @search)";
        request.input('search', sql.NVarChar, `%${search}%`);
      }

      query = `
        SELECT member_id, name, mobile_no, join_date, city,
               ISNULL(total_spent, 0) as total_spent, ISNULL(total_transactions, 0) as total_transactions, last_active_date, favorite_store
        FROM LOYAL_MEMBER_PROFILE WITH (NOLOCK)
        ${where}
        ORDER BY total_spent DESC
      `;
    } else if (tab === 'summaries') {
      title = "Daily Summaries";
      columns = [
        { header: 'Member ID', key: 'member_id', width: 20 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Phone', key: 'mobile_no', width: 15 },
        { header: 'Date', key: 'summary_date', width: 15 },
        { header: 'Store', key: 'org_cd', width: 10 },
        { header: 'Total Sales', key: 'total_sales', width: 15 },
        { header: 'Total Cost', key: 'total_cost', width: 15 },
        { header: 'Total Qty', key: 'total_qty', width: 10 },
        { header: 'Total Txn', key: 'total_txn', width: 10 }
      ];

      let where = "WHERE 1=1";
      if (store && store !== 'All Stores') {
        where += " AND s.org_cd = @store";
        request.input('store', sql.NVarChar, store);
      }
      if (fromDate && toDate) {
        where += " AND s.summary_date >= @fromDate AND s.summary_date <= @toDate";
        request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (search) {
        where += " AND (s.member_id LIKE @search OR p.name LIKE @search)";
        request.input('search', sql.NVarChar, `%${search}%`);
      }

      query = `
        SELECT s.*, p.name as name, p.mobile_no as mobile_no
        FROM LOYAL_MEMBER_DAILY_SUMMARY s WITH (NOLOCK)
        LEFT JOIN LOYAL_MEMBER_PROFILE p WITH (NOLOCK) ON s.member_id = p.member_id
        ${where}
        ORDER BY s.summary_date DESC
      `;
    } else if (tab === 'item-sales') {
      title = "Item Sales";
      columns = [
        { header: 'Member ID', key: 'card_no', width: 20 },
        { header: 'Customer Name', key: 'member_name', width: 25 },
        { header: 'Store', key: 'org_cd', width: 10 },
        { header: 'Date', key: 'bill_dt', width: 15 },
        { header: 'Item Code', key: 'itm_cd', width: 15 },
        { header: 'Item Name', key: 'item_name', width: 25 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'Gross Value', key: 'gross_value', width: 15 },
        { header: 'Net Value', key: 'net_value', width: 15 },
        { header: 'Department', key: 'department_name', width: 20 },
        { header: 'Brand', key: 'brand_name', width: 20 }
      ];

      let where = "WHERE 1=1";
      if (store && store !== 'All Stores') {
        where += " AND m.org_cd = @store";
        request.input('store', sql.NVarChar, store);
      }
      if (fromDate && toDate) {
        where += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
        request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (search) {
        where += ` AND (
          m.itm_cd LIKE @search OR 
          m.item_name LIKE @search OR 
          m.card_no LIKE @search OR 
          p1.name LIKE @search OR 
          p2.name LIKE @search
        )`;
        request.input('search', sql.NVarChar, `%${search}%`);
      }

      query = `
        SELECT m.*, 
               COALESCE(p1.name, p2.name, 'Anonymous member') as member_name,
               ISNULL(A4.anm_desc, 'UNKNOWN') as department_name, 
               ISNULL(A7.anm_desc, 'UNKNOWN') as brand_name
        FROM ITEM_SALES_MEMBER m
        LEFT JOIN LOYAL_MEMBER_PROFILE p1 ON m.card_no = p1.member_id
        LEFT JOIN LOYAL_MEMBER_PROFILE p2 ON m.card_no = p2.mobile_no
        LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
        LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
        ${where}
        ORDER BY m.bill_dt DESC
      `;
    } else {
      return res.status(400).json({ error: 'Invalid tab' });
    }

    const result = await request.query(query);
    const rows = result.recordset;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(title);

    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    worksheet.addRows(rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const exportDate = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename=${tab}-report_${exportDate}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("API_ERR:", err); res.status(500).json({ error: err.message });
  }
}

export const getApiDevLoyaltyEtlstatus = (req, res) => {
  res.json({ running: devEtlRunning, logs: devEtlLogs });
}

export const postApiDevLoyaltyTriggeretl = async (req, res) => {
  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) {
    return res.status(400).json({ error: 'Please specify fromDate and toDate' });
  }

  if (devEtlRunning) {
    return res.status(400).json({ error: 'ETL is already running' });
  }

  const { runDevEtl } = require('../scripts/sync_dev_loyalty_etl.cjs');

  devEtlRunning = true;
  devEtlLogs = [];

  const logFn = (msg) => {
    const timeStr = new Date().toLocaleTimeString();
    devEtlLogs.push(`[${timeStr}] ${msg}`);
    console.log(`[DEV-ETL] ${msg}`);
  };

  logFn(`Starting manual ETL trigger for range: ${fromDate} to ${toDate}`);

  (async () => {
    try {
      logFn(`Step 1/3: Syncing HOSERVER DIM_ITEM...`);
      await runHoServerDimItemSync();

      logFn(`Step 2/3: Syncing ITEM_SALES_MEMBER...`);
      await runItemSalesSync(fromDate, toDate, logFn);

      logFn(`Step 3/3: Running DEV_LOYALTY ETL...`);
      await runDevEtl(fromDate, toDate, logFn);

      logFn(`ETL completed successfully!`);
      devEtlRunning = false;
    } catch (err) {
      logFn(`ETL failed: ${err.message}`);
      devEtlRunning = false;
    }
  })();

  res.json({ message: 'ETL process started in background' });
}

export const getApiCrmReportsStores = async (req, res) => {
  try {
    const crmPool = await getCrmPool();
    const result = await crmPool.request().query(`
      SELECT DISTINCT ORG_CD AS org_cd, ORG_NAME AS org_name 
      FROM DimStore 
      WHERE ORG_STATUS = 'O' AND ORG_LEVEL_NUMBER = 3
      ORDER BY ORG_CD ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export const exportCrmReport = async (req, res) => {
  const { type, format } = req.params;
  const { fromDate, toDate, store, search, sortBy, sortDir = 'desc' } = req.query;

  try {
    const crmPool = await getCrmPool();
    let query = "";
    let params = { fromDate, toDate };
    let columns = [];
    let title = "";

    // Reuse the same logic as the main endpoint, but WITHOUT pagination
    if (type === 'txn-analysis') {
      title = "Wise Customer Transaction Analysis";
      columns = [
        { header: 'Store Code', key: 'org_cd', width: 15 },
        { header: 'Store Name', key: 'store_name', width: 25 },
        { header: 'Bill No', key: 'bill_no', width: 20 },
        { header: 'Date', key: 'txn_date', width: 15 },
        { header: 'Time', key: 'txn_time', width: 10 },
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Customer', key: 'cust_name', width: 25 },
        { header: 'Phone', key: 'phone_no', width: 15 },
        { header: 'Prev Pts', key: 'prev_points', width: 10 },
        { header: 'Earned', key: 'point_earned', width: 10 },
        { header: 'Value', key: 'bill_value', width: 15, style: { numFmt: '#,##0' } },
        { header: 'Total Pts', key: 'total_points', width: 10 },
        { header: 'Status', key: 'point_status', width: 10 },
        { header: 'Category', key: 'bill_category', width: 10 },
      ];

      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.bill_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }
      const orderCol = sortBy || 'h.bill_DT';
      const orderDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      query = `
        SELECT
            q.RLITQ_ORG_CD AS org_cd, d.ORG_NAME AS store_name, q.RLITQ_BILL_NO AS bill_no,
            CONVERT(DATE, h.bill_dt) AS txn_date, h.bill_time AS txn_time,
            q.RLITQ_CARD_NO AS card_no, m.RLICM_NAME AS cust_name, m.RLICM_MOBILE_NO AS phone_no,
            q.RLITQ_OPENING_POINTS AS prev_points, FLOOR(ISNULL(h.NET_VALUE, 0) / 50000) AS point_earned,
            h.NET_VALUE AS bill_value, (ISNULL(q.RLITQ_OPENING_POINTS, 0) + FLOOR(ISNULL(h.NET_VALUE, 0) / 50000)) AS total_points,
            CASE WHEN FLOOR(ISNULL(h.NET_VALUE, 0) / 50000) > 0 THEN 'Earned' ELSE 'No Points' END AS point_status,
            CASE WHEN h.NET_VALUE >= 500000 THEN 'Premium' WHEN h.NET_VALUE >= 200000 THEN 'High' WHEN h.NET_VALUE >= 50000 THEN 'Medium' ELSE 'Low' END AS bill_category
        FROM POS_SALES_HDR (NOLOCK) h
        INNER JOIN RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q ON h.BILL_NO = q.RLITQ_BILL_NO AND h.ORG_CD = q.RLITQ_ORG_CD
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        ${where}
        ORDER BY ${orderCol} ${orderDir}
      `;
    }
    else if (type === 'frequent-shopper') {
      title = "Customer Frequently Shopper";
      columns = [
        { header: 'Org Code', key: 'org_cd', width: 10 },
        { header: 'Store Name', key: 'store_name', width: 25 },
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Customer', key: 'cust_name', width: 25 },
        { header: 'Phone No', key: 'phone_no', width: 15 },
        { header: 'Frequency', key: 'frequently', width: 10 },
        { header: 'Category', key: 'cust_category', width: 15 },
      ];

      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.bill_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT x.*, CASE WHEN x.frequently > 3 THEN 'LOYAL' WHEN x.frequently >= 1 THEN 'REGULAR' ELSE 'PASSIVE' END AS cust_category
        FROM (
            SELECT q.RLITQ_ORG_CD AS org_cd, d.ORG_NAME AS store_name, q.RLITQ_CARD_NO AS card_no,
                   m.RLICM_NAME AS cust_name, m.RLICM_MOBILE_NO AS phone_no, COUNT(q.RLITQ_CARD_NO) AS frequently
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q
            LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
            LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
            LEFT JOIN POS_SALES_HDR (NOLOCK) h ON q.RLITQ_BILL_NO = h.bill_no
            ${where}
            GROUP BY q.RLITQ_ORG_CD, d.ORG_NAME, q.RLITQ_CARD_NO, m.RLICM_NAME, m.RLICM_MOBILE_NO
        ) x
        ORDER BY frequently DESC
      `;
    }
    else if (type === 'member-enrollment') {
      title = "Member Enrollment Analysis";
      columns = [
        { header: 'Store Name', key: 'STORE_NAME', width: 25 },
        { header: 'Member ID', key: 'MEMBER_ID', width: 20 },
        { header: 'Customer Name', key: 'CUST_NAME', width: 25 },
        { header: 'Phone No', key: 'PHONE_NUMBER', width: 15 },
        { header: 'Join Date', key: 'JOIN_DATE', width: 15 },
        { header: 'Channel', key: 'REGISTRATION_TYPE', width: 20 },
        { header: 'Starting Points', key: 'STARTING_POINTS', width: 15 },
        { header: 'Active', key: 'IS_ACTIVE', width: 10 },
      ];

      let where = "WHERE JOIN_DATE BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND STORE_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (MEMBER_ID LIKE @search OR CUST_NAME LIKE @search OR PHONE_NUMBER LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT STORE_NAME, MEMBER_ID, CUST_NAME, PHONE_NUMBER, 
               JOIN_DATE, REGISTRATION_TYPE, STARTING_POINTS,
               CASE WHEN IS_ACTIVE = 1 THEN 'Yes' ELSE 'No' END AS IS_ACTIVE
        FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK)
        ${where}
        ORDER BY JOIN_DATE DESC, CREATED_AT DESC
      `;
    }
    else if (type === 'top-spender') {
      const topLimit = parseInt(req.query.top) || 100;
      title = "Top Spender Analysis";
      columns = [
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Customer', key: 'cust_name', width: 25 },
        { header: 'Phone No', key: 'phone_no', width: 15 },
        { header: 'Net Sales', key: 'total_net_sales', width: 20, style: { numFmt: '#,##0' } },
        { header: 'Total Txn', key: 'total_txn', width: 10 },
        { header: 'Tier', key: 'spender_tier', width: 15 },
      ];

      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.BILL_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT TOP ${topLimit}
            q.RLITQ_CARD_NO AS card_no,
            MAX(m.RLICM_NAME) AS cust_name,
            MAX(m.RLICM_MOBILE_NO) AS phone_no,
            COUNT(DISTINCT q.RLITQ_BILL_NO) AS total_txn,
            SUM(ISNULL(h.NET_VALUE, 0)) AS total_net_sales,
            CASE 
                WHEN SUM(ISNULL(h.NET_VALUE, 0)) >= 5000000 THEN 'Platinum'
                WHEN SUM(ISNULL(h.NET_VALUE, 0)) >= 1000000 THEN 'Gold'
                ELSE 'Silver' 
            END AS spender_tier
        FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        LEFT JOIN POS_SALES_HDR (NOLOCK) h ON q.RLITQ_BILL_NO = h.BILL_NO AND q.RLITQ_ORG_CD = h.ORG_CD
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        ${where}
        GROUP BY q.RLITQ_CARD_NO
        ORDER BY total_net_sales DESC
      `;
    }
    else if (type === 'wakeup-call') {
      title = "Wakeup Call Customer";
      columns = [
        { header: 'Store', key: 'last_store', width: 25 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Mobile No', key: 'phone_no', width: 15 },
        { header: 'Transaction Type', key: 'transaction_type', width: 15 },
        { header: 'Last Txn Date', key: 'last_txn_date', width: 15 },
        { header: 'Last Txn Days', key: 'last_txn_days', width: 15 },
        { header: 'Current Points', key: 'current_point', width: 15 },
        { header: 'Last Txn Store', key: 'last_store_name', width: 25 },
        { header: 'Tier', key: 'tier', width: 10 }
      ];

      let batasAkhir = toDate ? toDate.split(' ')[0] : new Date().toISOString().split('T')[0];
      params.batas_akhir = batasAkhir;

      let storeFilter = "(@store_cd IS NULL OR T.STORE_CD = @store_cd)";
      if (store && store !== 'All Store') {
        const scRes = await crmPool.request().input('sn', sql.NVarChar, store).query('SELECT TOP 1 ORG_CD FROM DimStore WHERE ORG_NAME=@sn');
        if (scRes.recordset.length > 0) {
          params.store_cd = scRes.recordset[0].ORG_CD;
        } else {
          params.store_cd = null;
        }
      } else {
        params.store_cd = null;
      }

      let searchFilter = '';
      if (search) {
        searchFilter = " AND (L.CUST_NAME LIKE @search OR L.MEMBER_ID LIKE @search)";
        params.search = `%${search}%`;
      }

      let orderCol = 'L.TRANS_DATE';
      if (sortBy === 'name') orderCol = 'L.CUST_NAME';
      else if (sortBy === 'phone_no') orderCol = 'L.PHONE_NUMBER';
      else if (sortBy === 'last_txn_date') orderCol = 'L.TRANS_DATE';
      else if (sortBy === 'last_store') orderCol = 'L.STORE_NAME';
      else if (sortBy === 'card_no') orderCol = 'L.MEMBER_ID';
      else if (sortBy === 'tier') orderCol = 'C.CARD_TIER_NAME';
      if (!sortDir) sortDir = 'desc';

      query = `
        WITH LastTxn AS (
          SELECT
            T.MEMBER_ID,
            T.STORE_CD,
            T.STORE_NAME,
            T.CUST_NAME,
            T.PHONE_NUMBER,
            T.TRANSACTION_TYPE,
            T.TRANS_DATE,
            T.LATEST_POINT,
            ROW_NUMBER() OVER (
              PARTITION BY T.MEMBER_ID
              ORDER BY T.TRANS_DATE DESC, T.CREATED_AT DESC
            ) AS RN
          FROM RXL_LOYALID_TRANSACTIONS (NOLOCK) T
          WHERE ${storeFilter}
        )
        SELECT
          L.STORE_CD AS last_store,
          L.CUST_NAME AS name,
          L.MEMBER_ID AS card_no,
          L.PHONE_NUMBER AS phone_no,
          CAST(L.TRANS_DATE AS DATE) AS last_txn_date,
          DATEDIFF(DAY, CAST(L.TRANS_DATE AS DATE), CAST(GETDATE() AS DATE)) AS last_txn_days,
          L.LATEST_POINT AS current_point,
          L.STORE_NAME AS last_store_name,
          C.CARD_TIER_NAME AS tier,
          L.TRANSACTION_TYPE as transaction_type
        FROM LastTxn L
        INNER JOIN RXL_LOYALID_CUSTOMER_MST (NOLOCK) C
          ON C.RLICM_CARD_NO = L.MEMBER_ID
        WHERE L.RN = 1
          AND L.TRANS_DATE <= @batas_akhir
          ${searchFilter}
        ORDER BY ${orderCol} ${sortDir}
      `;
    }

    let request = crmPool.request();
    Object.keys(params).forEach(key => {
      request.input(key, sql.NVarChar, params[key]);
    });

    const result = await request.query(query);
    const rows = result.recordset;

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');

      // Style headers
      worksheet.columns = columns;
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      worksheet.addRows(rows);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      const exportDate = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Disposition', `attachment; filename=${type}-report_${exportDate}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    }
    else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      const exportDate = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Disposition', `attachment; filename=${type}-report_${exportDate}.pdf`);
      doc.pipe(res);

      doc.fontSize(18).text(title, { align: 'center' });
      doc.fontSize(10).text(`Period: ${fromDate} to ${toDate}`, { align: 'center' });
      doc.moveDown();

      // Simple table drawing logic
      const tableTop = 100;
      let y = tableTop;

      // Draw Headers
      doc.fontSize(8).font('Helvetica-Bold');
      let x = 30;
      columns.forEach(col => {
        doc.text(col.header, x, y, { width: col.width * 7, truncate: true });
        x += col.width * 7;
      });

      y += 15;
      doc.moveTo(30, y).lineTo(x, y).stroke();
      y += 5;

      // Draw Rows
      doc.font('Helvetica');
      rows.slice(0, 500).forEach(row => { // Limit PDF to 500 rows for performance
        if (y > 550) {
          doc.addPage({ layout: 'landscape' });
          y = 30;

          // Redraw headers on new page
          doc.fontSize(8).font('Helvetica-Bold');
          x = 30;
          columns.forEach(col => {
            doc.text(col.header, x, y, { width: col.width * 7, truncate: true });
            x += col.width * 7;
          });
          y += 15;
          doc.moveTo(30, y).lineTo(x, y).stroke();
          y += 5;
          doc.font('Helvetica');
        }
        x = 30;
        columns.forEach(col => {
          let val = row[col.key];
          if (val instanceof Date) val = val.toISOString().split('T')[0];
          doc.text(String(val || '-'), x, y, { width: col.width * 7, truncate: true });
          x += col.width * 7;
        });
        y += 12;
      });

      if (rows.length > 500) {
        doc.moveDown().text(`... and ${rows.length - 500} more records (Export to Excel for full data)`, { italic: true });
      }

      doc.end();
    } else {
      res.status(400).send('Invalid format');
    }
  } catch (err) {
    console.error('Export Error:', err);
    res.status(500).send(err.message);
  }
}

export const getApiCrmSyncstatus = async (req, res) => {
  let hoPool = null;
  try {
    hoPool = await getHoServerPool();

    const totals = await hoPool.request().query(`
      SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced,
        SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -7, GETDATE()))
    `);

    const configRes = await hoPool.request().query(
      'SELECT TOP 1 PROCESS_EXEC_DATE FROM dbo.LOYAL_CRM_PROCESS_CONFIG'
    );

    const daily = await hoPool.request().query(`
      SELECT
        CONVERT(date, last_timestamp) as sync_date,
        SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced_count,
        SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending_count,
        COUNT(*) as total
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -7, GETDATE()))
      GROUP BY CONVERT(date, last_timestamp)
      ORDER BY sync_date DESC
    `);

    const recentErrors = await hoPool.request().query(`
      SELECT TOP 5 ITEM_CODE, ITEM_NAME, RESPONSE_MSG, LAST_TIMESTAMP
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE RESPONSE_MSG NOT LIKE 'Success%' 
        AND ISNULL(RESPONSE_MSG, '') <> ''
        AND CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -7, GETDATE()))
      ORDER BY CAST(LAST_TIMESTAMP AS DATETIME) DESC
    `);

    res.json({
      totals: totals.recordset[0],
      process_exec_date: configRes.recordset[0]?.PROCESS_EXEC_DATE || null,
      daily: daily.recordset,
      recent_errors: recentErrors.recordset
    });
  } catch (err) {
    console.error('Error fetching CRM sync status:', err);
    res.status(500).json({ error: 'Failed to fetch sync status', details: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
}

export const getApiCrmTestconnection = async (req, res) => {
  let hoPool = null;
  try {
    hoPool = await getHoServerPool();
    const result = await hoPool.request().query('SELECT @@VERSION as version');
    res.json({ success: true, message: 'Connected to HOSERVER successfully.', version: result.recordset[0].version });
  } catch (err) {
    console.error('CRM Connection test failed:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
}

export const getApiCrmSynclogs = async (req, res) => {
  let hoPool = null;
  try {
    hoPool = await getHoServerPool();

    // Ensure table exists (fail-safe)
    await hoPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_item_crm_job_log')
      BEGIN
          CREATE TABLE dbo.sync_item_crm_job_log (
              log_id INT IDENTITY(1,1) PRIMARY KEY,
              log_date DATETIME DEFAULT GETDATE(),
              issue_date DATETIME,
              item_code VARCHAR(50),
              item_name VARCHAR(150),
              item_stk_uom VARCHAR(10),
              item_vendor_cd VARCHAR(50),
              status VARCHAR(50),
              message VARCHAR(MAX)
          );
      END
    `);

    const result = await hoPool.request().query(`
      SELECT TOP 5 * FROM sync_item_crm_job_log ORDER BY log_date DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching sync logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
}

export const postApiCrmSyncretry = async (req, res) => {
  let hoPool = null;
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.body.days) || 2));
    hoPool = await getHoServerPool();

    // Ensure table exists
    await hoPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_item_crm_job_log')
      BEGIN
          CREATE TABLE dbo.sync_item_crm_job_log (
              log_id INT IDENTITY(1,1) PRIMARY KEY,
              log_date DATETIME DEFAULT GETDATE(),
              issue_date DATETIME,
              item_code VARCHAR(50),
              item_name VARCHAR(150),
              item_stk_uom VARCHAR(10),
              item_vendor_cd VARCHAR(50),
              status VARCHAR(50),
              message VARCHAR(MAX)
          );
      END
    `);

    // Check failed count in the configured days range
    const checkFailed = await hoPool.request()
      .input('days', sql.Int, days)
      .query(`
        SELECT COUNT(*) as failedCount 
        FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
        WHERE IS_SYNC = '-1'
          AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE())
      `);

    const countFailed = checkFailed.recordset[0].failedCount;

    if (countFailed > 0) {
      // Find the oldest target date
      const targetDateRes = await hoPool.request()
        .input('days', sql.Int, days)
        .query(`
          SELECT TOP 1 CAST(CAST(LAST_TIMESTAMP AS DATETIME) AS DATE) as targetDate
          FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
          WHERE IS_SYNC = '-1'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE())
          ORDER BY CAST(LAST_TIMESTAMP AS DATETIME) ASC
        `);

      const targetDate = targetDateRes.recordset[0].targetDate;

      const transaction = new sql.Transaction(hoPool);
      await transaction.begin();

      try {
        const reqQuery = new sql.Request(transaction);
        reqQuery.input('targetDate', sql.Date, targetDate);
        reqQuery.input('days', sql.Int, days);

        await reqQuery.query(`
          INSERT INTO dbo.sync_item_crm_job_log (
              log_date, issue_date, item_code, item_name, item_stk_uom, item_vendor_cd, status, message
          )
          SELECT 
              GETDATE(), CAST(LAST_TIMESTAMP AS DATETIME), ITEM_CODE, ITEM_NAME, ITEM_STK_UOM, ITEM_VENDOR_CD, 'FAILED', RESPONSE_MSG
          FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
          WHERE IS_SYNC = '-1'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE());
        `);

        await reqQuery.query(`
          UPDATE dbo.LOYAL_CRM_ITEM_MST 
          SET IS_SYNC='0', 
              RESPONSE_MSG='',
              RETRY_COUNT ='0',
              LAST_TIMESTAMP = FORMAT(GETDATE(), 'yyyy-MM-dd HH:mm:ss')
          WHERE IS_SYNC = '-1'
            AND RETRY_COUNT != '0'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE());
        `);

        await transaction.commit();
        res.json({ success: true, message: `Successfully pushed ${countFailed} failed items for retry (${days}-day range).` });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } else {
      await hoPool.request().query(`
        INSERT INTO dbo.sync_item_crm_job_log (
            log_date, issue_date, status, message
        )
        VALUES (
            GETDATE(),
            CAST(CAST(DATEADD(day, -1, GETDATE()) AS DATE) AS DATETIME), 
            'SUCCESS',
            'No failed records found. Process date remains unchanged.'
        );
      `);

      res.json({ success: true, message: `No failed records found in the last ${days} day(s). Process date remains unchanged.` });
    }
  } catch (err) {
    console.error('Error during CRM sync retry:', err);
    res.status(500).json({ error: 'Failed to process sync retry', details: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
}


export const getApiCrmReportsType = async (req, res) => {
  const { type } = req.params;
  const { fromDate, toDate, store, search, page = 1, perPage = 100, sortBy, sortDir = 'desc' } = req.query;

  try {
    const crmPool = await getCrmPool();
    const offset = (parseInt(page) - 1) * parseInt(perPage);
    const limit = parseInt(perPage);

    let query = "";
    let countQuery = "";
    let params = { fromDate, toDate };

    if (type === 'txn-analysis') {
      let where = "WHERE TRANS_DATE BETWEEN @fromDate AND @toDate AND BILL_NO NOT LIKE '%mig%'";
      if (store && store !== 'All Store') {
        where += " AND STORE_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (MEMBER_ID LIKE @search OR CUST_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      const orderCol = sortBy || 'TRANS_DATE';
      const orderDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      query = `
        SELECT
            STORE_CD AS org_cd,
            STORE_NAME AS store_name,
            TRANSACTION_PARTNER_ID AS bill_no,
            CAST(TRANS_DATE AS DATE) AS txn_date,
            CONVERT(VARCHAR(8), CREATED_AT, 108) AS txn_time,
            MEMBER_ID AS card_no,
            CUST_NAME AS cust_name,
            PHONE_NUMBER AS phone_no,
            (ISNULL(LATEST_POINT, 0) - ISNULL(POINTS_EARNED, 0)) AS prev_points,
            ISNULL(POINTS_EARNED, 0) AS point_earned,
            ISNULL(LATEST_POINT, 0) AS total_points,
            CASE WHEN ISNULL(POINTS_EARNED, 0) > 0 THEN 'Earned' ELSE 'No Points' END AS point_status,
            ISNULL(BILL_VALUE, 0) AS bill_value,
            CASE WHEN ISNULL(BILL_VALUE, 0) >= 500000 THEN 'Premium' WHEN ISNULL(BILL_VALUE, 0) >= 200000 THEN 'High' WHEN ISNULL(BILL_VALUE, 0) >= 50000 THEN 'Medium' ELSE 'Low' END AS bill_category
        FROM RXL_LOYALID_TRANSACTIONS (NOLOCK)
        ${where}
        ORDER BY ${orderCol} ${orderDir}
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;

      countQuery = `
        SELECT 
            COUNT(*) as total,
            SUM(ISNULL(BILL_VALUE, 0)) AS total_bill_value,
            SUM(ISNULL(POINTS_EARNED, 0)) AS total_points_earned
        FROM RXL_LOYALID_TRANSACTIONS (NOLOCK)
        ${where}
      `;
    }
    else if (type === 'frequent-shopper') {
      let where = "WHERE TRANS_DATE BETWEEN @fromDate AND @toDate AND BILL_NO NOT LIKE '%mig%' AND TRANSACTION_PARTNER_ID IS NOT NULL";
      if (store && store !== 'All Store') {
        where += " AND STORE_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (MEMBER_ID LIKE @search OR CUST_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT x.*,
               CASE WHEN x.frequently > 3 THEN 'LOYAL' WHEN x.frequently >= 1 THEN 'REGULAR' ELSE 'PASSIVE' END AS cust_category
        FROM (
            SELECT
                STORE_CD AS org_cd,
                MAX(STORE_NAME) AS store_name,
                MEMBER_ID AS card_no,
                MAX(CUST_NAME) AS cust_name,
                MAX(PHONE_NUMBER) AS phone_no,
                COUNT(BILL_NO) AS frequently
            FROM RXL_LOYALID_TRANSACTIONS (NOLOCK)
            ${where}
            GROUP BY STORE_CD, MEMBER_ID
        ) x
        ORDER BY frequently DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;

      countQuery = `
        SELECT COUNT(DISTINCT MEMBER_ID) as total
        FROM RXL_LOYALID_TRANSACTIONS (NOLOCK)
        ${where}
      `;
    }
    else if (type === 'member-enrollment') {
      // member-enrollment and top-spender typically use data warehouse tables
      // For trial, I'll implement member-enrollment
      let where = "WHERE JOIN_DATE BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND STORE_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (MEMBER_ID LIKE @search OR CUST_NAME LIKE @search OR PHONE_NUMBER LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
         SELECT STORE_NAME, MEMBER_ID, CUST_NAME, PHONE_NUMBER, 
                JOIN_DATE, REGISTRATION_TYPE, STARTING_POINTS,
                CASE WHEN IS_ACTIVE = 1 THEN 'Yes' ELSE 'No' END AS IS_ACTIVE
         FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK)
         ${where}
         ORDER BY JOIN_DATE DESC, CREATED_AT DESC
         OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
       `;
      countQuery = `SELECT COUNT(*) as total FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK) ${where}`;
    }
    else if (type === 'top-spender') {
      const topLimit = parseInt(req.query.top) || 100;
      let where = "WHERE TRANS_DATE BETWEEN @fromDate AND @toDate AND BILL_NO NOT LIKE '%mig%'";
      if (store && store !== 'All Store') {
        where += " AND STORE_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (MEMBER_ID LIKE @search OR CUST_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT TOP ${topLimit}
            MEMBER_ID AS card_no,
            MAX(CUST_NAME) AS cust_name,
            MAX(PHONE_NUMBER) AS phone_no,
            COUNT(DISTINCT BILL_NO) AS total_txn,
            SUM(ISNULL(BILL_VALUE, 0)) AS total_net_sales
        FROM RXL_LOYALID_TRANSACTIONS (NOLOCK)
        ${where}
        GROUP BY MEMBER_ID
        ORDER BY total_net_sales DESC
      `;
      countQuery = `SELECT ${topLimit} AS total`;
    }
    else if (type === 'fraud-analysis') {
      let where = "WHERE h.BILL_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      const cte = `
        WITH DailyCounts AS (
            SELECT 
                q.RLITQ_CARD_NO as card_no,
                MAX(m.RLICM_NAME) as cust_name,
                CAST(h.BILL_DT AS DATE) as trx_date,
                COUNT(q.RLITQ_BILL_NO) as daily_trx_count,
                MAX(q.RLITQ_ORG_CD) as org_cd,
                MAX(d.ORG_NAME) as store_name,
                MAX(h.COUNTER_NO) as counter_no,
                MAX(h.SESSION_NO) as session_no,
                MAX(h.SALESMAN_ID_SEC) as salesman_id
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE q (NOLOCK)
            JOIN POS_SALES_HDR h (NOLOCK) ON q.RLITQ_BILL_NO = h.BILL_NO AND q.RLITQ_ORG_CD = h.ORG_CD
            LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST m (NOLOCK) ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
            LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
            ${where}
            GROUP BY q.RLITQ_CARD_NO, CAST(h.BILL_DT AS DATE)
            HAVING COUNT(q.RLITQ_BILL_NO) >= 3
               AND COUNT(DISTINCT h.COUNTER_NO) = 1
               AND COUNT(DISTINCT h.SESSION_NO) = 1
        ),
        ConsecutiveLag AS (
            SELECT 
                card_no, 
                cust_name, 
                org_cd,
                store_name,
                trx_date as latest_date,
                LAG(trx_date) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_date,
                daily_trx_count as latest_count, 
                LAG(daily_trx_count) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_count,
                salesman_id as latest_salesman,
                LAG(salesman_id) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_salesman,
                'Suspicious Activity' as fraud_warning
            FROM DailyCounts
        ),
        ConsecutiveCheck AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY card_no ORDER BY latest_date DESC) as rn
            FROM ConsecutiveLag 
            WHERE DATEDIFF(day, prev_date, latest_date) = 1
              AND latest_salesman = prev_salesman
        )
      `;

      query = `
        ${cte}
        SELECT * FROM ConsecutiveCheck WHERE rn = 1
        ORDER BY latest_date DESC, latest_count DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;

      countQuery = `
        ${cte}
        SELECT COUNT(*) as total FROM ConsecutiveCheck WHERE rn = 1
      `;
    }
    else if (type === 'wakeup-call') {
      const pageNum = parseInt(page) || 1;
      const perPageNum = parseInt(perPage) || 50;
      const offset = (pageNum - 1) * perPageNum;

      try {
        const reqDb = crmPool.request();

        let batasAkhir = toDate ? toDate.split(' ')[0] : new Date().toISOString().split('T')[0];
        reqDb.input('batas_akhir', sql.VarChar, batasAkhir);

        let storeFilter = "(@store_cd IS NULL OR T.STORE_CD = @store_cd)";
        if (store && store !== 'All Store') {
          const scRes = await crmPool.request().input('sn', sql.NVarChar, store).query('SELECT TOP 1 ORG_CD FROM DimStore WHERE ORG_NAME=@sn');
          if (scRes.recordset.length > 0) {
            reqDb.input('store_cd', sql.VarChar, scRes.recordset[0].ORG_CD);
          } else {
            reqDb.input('store_cd', sql.VarChar, null);
          }
        } else {
          reqDb.input('store_cd', sql.VarChar, null);
        }

        let searchFilter = '';
        if (search) {
          searchFilter = " AND (L.CUST_NAME LIKE @search OR L.MEMBER_ID LIKE @search)";
          reqDb.input('search', sql.NVarChar, `%${search}%`);
        }

        const baseCte = `
          WITH LastTxn AS (
            SELECT
              T.MEMBER_ID,
              T.STORE_CD,
              T.STORE_NAME,
              T.CUST_NAME,
              T.PHONE_NUMBER,
              T.TRANSACTION_TYPE,
              T.TRANS_DATE,
              T.LATEST_POINT,
              ROW_NUMBER() OVER (
                PARTITION BY T.MEMBER_ID
                ORDER BY T.TRANS_DATE DESC, T.CREATED_AT DESC
              ) AS RN
            FROM RXL_LOYALID_TRANSACTIONS (NOLOCK) T
            WHERE ${storeFilter}
              AND T.BILL_NO NOT LIKE '%mig%'
          )
        `;

        const baseSelect = `
          SELECT
            L.STORE_CD AS last_store,
            L.CUST_NAME AS name,
            L.MEMBER_ID AS card_no,
            L.PHONE_NUMBER AS phone_no,
            CAST(L.TRANS_DATE AS DATE) AS last_txn_date,
            DATEDIFF(DAY, CAST(L.TRANS_DATE AS DATE), CAST(GETDATE() AS DATE)) AS last_txn_days,
            L.LATEST_POINT AS current_point,
            L.STORE_NAME AS last_store_name,
            C.CARD_TIER_NAME AS tier,
            L.TRANSACTION_TYPE as transaction_type
          FROM LastTxn L
          INNER JOIN RXL_LOYALID_CUSTOMER_MST (NOLOCK) C
            ON C.RLICM_CARD_NO = L.MEMBER_ID
          WHERE L.RN = 1
            AND L.TRANS_DATE <= @batas_akhir
            ${searchFilter}
        `;

        const countQuery = `
          ${baseCte}
          SELECT COUNT(*) as total
          FROM LastTxn L
          INNER JOIN RXL_LOYALID_CUSTOMER_MST (NOLOCK) C ON C.RLICM_CARD_NO = L.MEMBER_ID
          WHERE L.RN = 1 AND L.TRANS_DATE <= @batas_akhir ${searchFilter}
        `;

        const countRes = await reqDb.query(countQuery);
        const total = countRes.recordset[0].total;

        let orderCol = 'last_txn_date';
        if (sortBy === 'name') orderCol = 'name';
        else if (sortBy === 'phone_no') orderCol = 'phone_no';
        else if (sortBy === 'last_txn_date') orderCol = 'last_txn_date';
        else if (sortBy === 'last_txn_days') orderCol = 'last_txn_days';
        else if (sortBy === 'last_store') orderCol = 'last_store_name';
        else if (sortBy === 'card_no') orderCol = 'card_no';
        else if (sortBy === 'tier') orderCol = 'tier';
        if (!sortDir) sortDir = 'desc';

        const dataQuery = `
          ${baseCte}
          ${baseSelect}
          ORDER BY ${orderCol} ${sortDir}
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `;

        reqDb.input('offset', sql.Int, offset);
        reqDb.input('limit', sql.Int, perPageNum);

        const dataRes = await reqDb.query(dataQuery);

        const rows = dataRes.recordset.map(r => ({
          last_store: r.last_store,
          name: r.name,
          card_no: r.card_no,
          phone_no: r.phone_no,
          transaction_type: r.transaction_type,
          last_txn_date: r.last_txn_date,
          last_txn_days: r.last_txn_days,
          current_point: r.current_point || 0,
          last_store_name: r.last_store_name || r.last_store,
          tier: r.tier || 'Regular'
        }));

        return res.json({
          rows,
          total,
          summary: { total: total, status: 'COMPLETED' },
          page: pageNum,
          perPage: perPageNum,
          totalPages: Math.ceil(total / perPageNum)
        });
      } catch (e) {
        return res.status(500).json({ error: `WAKEUP-CALL: ${e.message}` });
      }
    }
    else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const request = crmPool.request();
    Object.keys(params).forEach(key => {
      request.input(key, sql.NVarChar, params[key]);
    });

    const [dataRes, countRes] = await Promise.all([
      request.query(query),
      request.query(countQuery)
    ]);

    let total = countRes.recordset[0]?.total || 0;
    let summary = countRes.recordset[0] || {};

    if (type === 'top-spender') {
      total = dataRes.recordset.length;
      summary = { total };
    }

    res.json({
      rows: dataRes.recordset,
      total,
      summary,
      page: parseInt(page),
      perPage: parseInt(perPage),
      totalPages: type === 'top-spender' ? 1 : Math.ceil(total / parseInt(perPage))
    });

  } catch (err) {
    console.error(`CRM Report Error (${type}):`, err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function getApiCrmDashboard(req, res) {
  try {
    const query = `
      SELECT
        JOIN_DATE AS join_date,
        COUNT(MEMBER_ID) AS new_members,
        SUM(COUNT(MEMBER_ID)) OVER (
          ORDER BY JOIN_DATE
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_members,
        SUM(CASE WHEN IS_ACTIVE = 1 THEN 1 ELSE 0 END) AS active_members,
        SUM(CASE WHEN IS_ACTIVE = 0 THEN 1 ELSE 0 END) AS inactive_members
      FROM RXL_LOYALID_ENROLLMENT (NOLOCK)
      WHERE JOIN_DATE IS NOT NULL
      GROUP BY JOIN_DATE
      ORDER BY JOIN_DATE
    `;

    const crmPool = await getCrmPool();
    const request = crmPool.request();
    const result = await request.query(query);

    return res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('CRM Dashboard Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

let storeDailyTxnCache = {
  date: null,
  data: new Map()
};

export async function getApiCrmDashboardTransactions(req, res) {
  const { startDate, endDate } = req.query;
  const todayDate = new Date().toISOString().split('T')[0];

  try {
    if (storeDailyTxnCache.date !== todayDate) {
      storeDailyTxnCache.date = todayDate;
      storeDailyTxnCache.data.clear();
    }

    const cacheKey = `${startDate}_${endDate}`;
    if (storeDailyTxnCache.data.has(cacheKey)) {
      return res.json({
        success: true,
        data: storeDailyTxnCache.data.get(cacheKey),
        cached: true
      });
    }

    let dateFilter = "WHERE TRANS_DATE IS NOT NULL AND BILL_NO NOT LIKE '%mig%'";
    if (startDate) {
      dateFilter += " AND TRANS_DATE >= @startDate";
    }
    if (endDate) {
      dateFilter += " AND TRANS_DATE <= @endDate";
    }

    const query = `
      SELECT
        TRANS_DATE AS trans_date
       ,STORE_CD AS store_cd
       ,STORE_NAME AS store_name
       ,COUNT(BILL_NO) AS total_transactions
       ,COUNT(DISTINCT MEMBER_ID) AS unique_customers
       ,SUM(BILL_VALUE) AS total_bill_value
       ,SUM(POINTS_EARNED) AS total_points_earned
       ,SUM(POINTS_REDEEM) AS total_points_redeem
       ,AVG(BILL_VALUE) AS avg_bill_value
      FROM RXL_LOYALID_TRANSACTIONS (NOLOCK)
      ${dateFilter}
      GROUP BY TRANS_DATE, STORE_CD, STORE_NAME
      ORDER BY TRANS_DATE, STORE_CD
    `;

    const crmPool = await getCrmPool();
    const request = crmPool.request();

    if (startDate) request.input('startDate', startDate);
    if (endDate) request.input('endDate', endDate);

    const result = await request.query(query);

    storeDailyTxnCache.data.set(cacheKey, result.recordset);

    return res.json({
      success: true,
      data: result.recordset,
      cached: false
    });
  } catch (err) {
    console.error('CRM Dashboard Transactions Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

export async function getApiCrmDashboardCompetition(req, res) {
  const { period = '1M' } = req.query;

  try {
    const query = `
      DECLARE @periode VARCHAR(5) = @periodParam;

      DECLARE @date_from DATE = CASE
          WHEN @periode = '1M' THEN CAST(DATEADD(MONTH, -1, GETDATE()) AS DATE)
          WHEN @periode = '1Y' THEN CAST(DATEADD(YEAR,  -1, GETDATE()) AS DATE)
          ELSE CAST(DATEADD(MONTH, -1, GETDATE()) AS DATE)
      END;

      SELECT
        T.STORE_CD AS store_cd
       ,MAX(T.STORE_NAME) AS store_name

        -- Volume transaksi
       ,COUNT(T.BILL_NO) AS total_transactions
       ,COUNT(DISTINCT T.MEMBER_ID) AS unique_members
       ,COUNT(DISTINCT T.TRANS_DATE) AS active_days

        -- Nilai transaksi
       ,SUM(T.BILL_VALUE) AS total_bill_value
       ,AVG(T.BILL_VALUE) AS avg_bill_value
       ,MAX(T.BILL_VALUE) AS max_bill_value

        -- Points
       ,SUM(T.POINTS_EARNED) AS total_points_earned
       ,SUM(T.POINTS_REDEEM) AS total_points_redeem

        -- Rata-rata transaksi per hari aktif
       ,CAST(COUNT(T.BILL_NO) * 1.0 /
        NULLIF(COUNT(DISTINCT T.TRANS_DATE), 0) AS DECIMAL(10, 2))
        AS avg_txn_per_day

        -- Rata-rata member per hari aktif
       ,CAST(COUNT(DISTINCT T.MEMBER_ID) * 1.0 /
        NULLIF(COUNT(DISTINCT T.TRANS_DATE), 0) AS DECIMAL(10, 2))
        AS avg_member_per_day

        -- Rank berdasarkan total transaksi
       ,RANK() OVER (ORDER BY COUNT(T.BILL_NO) DESC) AS rank_by_txn
       ,RANK() OVER (ORDER BY SUM(T.BILL_VALUE) DESC) AS rank_by_value
       ,RANK() OVER (ORDER BY COUNT(DISTINCT T.MEMBER_ID) DESC) AS rank_by_member

      FROM RXL_LOYALID_TRANSACTIONS T (NOLOCK)
      WHERE T.TRANS_DATE >= @date_from
      AND T.BILL_NO NOT LIKE '%mig%'
      AND T.TRANS_DATE <= CAST(GETDATE() AS DATE)
      GROUP BY T.STORE_CD
      ORDER BY total_transactions DESC
    `;

    const crmPool = await getCrmPool();
    const request = crmPool.request();
    request.input('periodParam', period);
    const result = await request.query(query);

    return res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('CRM Dashboard Competition Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
