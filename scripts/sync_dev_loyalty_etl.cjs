const sql = require('f:/PepiUpdater/centaur-deploy/node_modules/mssql/index.js');
const dotenv = require('f:/PepiUpdater/centaur-deploy/node_modules/dotenv/lib/main.js');
dotenv.config({ path: 'f:/PepiUpdater/centaur-deploy/.env' });

// Local DB Config (Destination where LOYAL_ tables are)
const localDbConfig = {
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

// Helpers to dynamically load other servers' configurations
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
    requestTimeout: 60000
  };
}

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
    .query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");

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
    requestTimeout: 60000
  };
}

const { evaluateAchievements } = require('./loyalty_achievements.cjs');

async function runDevEtl(fromDateStr, toDateStr, logCallback) {
  const log = logCallback || console.log;

  log(`[ETL] Starting Dev CRM Loyalty ETL from ${fromDateStr} to ${toDateStr}...`);

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
          log(`[ETL] Database pool not connected. Establishing connection (attempt ${attempt})...`);
          pool = new sql.ConnectionPool(poolConfig);
          await pool.connect();
          setPoolFn(pool);
        }
        return await queryFn(pool);
      } catch (err) {
        log(`[ETL] Query failed (attempt ${attempt}/3): ${err.message}`);
        let pool = getPoolFn();
        if (pool) {
          try { await pool.close(); } catch (_) {}
          setPoolFn(null);
        }
        if (attempt === 3) throw err;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  try {
    // 1. Establish local pool
    localPool = new sql.ConnectionPool(localDbConfig);
    await localPool.connect();
    log(`[ETL] Connected to local app DBWH_8529.`);

    const crmConfig = await getCrmServerConfig(localPool);
    const hoConfig = await getHoServerConfig(localPool);

    // 2. Generate daily dates in range
    const start = new Date(fromDateStr);
    const end = new Date(toDateStr);
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    log(`[ETL] Total days to process: ${dates.length}`);

    const affectedMembers = new Set();

    // 3. Process day-by-day
    for (const date of dates) {
      log(`[ETL] Processing date: ${date}...`);

      const dateStart = date + 'T00:00:00';
      const dateEnd = date + 'T23:59:59';

      // Fetch member bills for this day from DBWH SERVER
      const billsRes = await runQuery(
        crmConfig,
        () => crmPool,
        p => { crmPool = p; },
        pool => pool.request()
          .input('start', sql.NVarChar, dateStart)
          .input('end', sql.NVarChar, dateEnd)
          .query(`
            SELECT 
                q.RLITQ_CARD_NO AS card_no,
                h.BILL_NO AS bill_no,
                h.ORG_CD AS org_cd,
                CONVERT(VARCHAR(10), h.BILL_DT, 120) AS bill_dt,
                h.BILL_TIME AS bill_time,
                ISNULL(h.NET_VALUE, 0) AS bill_val,
                ISNULL(m.RLICM_NAME, 'Member') AS name,
                ISNULL(m.RLICM_MOBILE_NO, '') AS mobile_no
            FROM POS_SALES_HDR (NOLOCK) h
            INNER JOIN RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q ON h.BILL_NO = q.RLITQ_BILL_NO AND h.ORG_CD = q.RLITQ_ORG_CD
            LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
            WHERE h.BILL_DT >= @start AND h.BILL_DT <= @end AND h.VOID_FLAG = 'F'
            AND q.RLITQ_INTEG_CODE='110'
          `)
      );

      const bills = billsRes.recordset;
      if (bills.length === 0) {
        log(`[ETL] No loyalty transactions found on ${date}.`);
        continue;
      }

      log(`[ETL] Found ${bills.length} member transactions on ${date}. Fetching item details...`);

      // Fetch transaction details for this day from HOSERVER
      const detailsRes = await runQuery(
        hoConfig,
        () => hoPool,
        p => { hoPool = p; },
        pool => pool.request()
          .input('start', sql.NVarChar, dateStart)
          .input('end', sql.NVarChar, dateEnd)
          .query(`
            SELECT 
                d.BILL_NO,
                d.ORG_CD,
                d.ITM_CD,
                d.ITEM_NAME,
                ISNULL(d.NET_VALUE, 0) AS net_value,
                ISNULL(d.QTY, 0) AS qty,
                ISNULL(d.COST_PRICE, 0) AS cost_price,
                ISNULL(d.COST_VALUE, 0) AS cost_value,
                ISNULL(d.PROMO_DISC_AMT, 0) AS promo_disc,
                ISNULL(i.ITM_GROUP_NAME, '') AS group_name,
                ISNULL(i.ITM_DIV_NAME, '') AS div_name
            FROM POS_SALES_DTL (NOLOCK) d
            LEFT JOIN ITEM_DESCRIPTION (NOLOCK) i ON d.ITM_CD = i.ITM_CD
            WHERE d.BILL_DT >= @start AND d.BILL_DT <= @end AND d.VOID_FLAG = 'F'
          `)
      );

      const details = detailsRes.recordset;
      log(`[ETL] Retrieved ${details.length} item lines on HOSERVER.`);

      // Index item details by org_cd & bill_no
      const detailsMap = new Map();
      details.forEach(det => {
        const key = `${det.ORG_CD}_${det.BILL_NO}`;
        if (!detailsMap.has(key)) detailsMap.set(key, []);
        detailsMap.get(key).push(det);
      });

      // Group summaries by card_no & store (org_cd)
      const dailyGroup = {};

      bills.forEach(bill => {
        const key = `${bill.card_no}_${bill.org_cd}`;
        if (!dailyGroup[key]) {
          dailyGroup[key] = {
            member_id: bill.card_no,
            summary_date: bill.bill_dt,
            org_cd: bill.org_cd,
            total_sales: 0,
            total_cost: 0,
            total_promo: 0,
            total_margin: 0,
            total_qty: 0,
            total_txn: 0,
            last_purchase_time: bill.bill_time,
            categories: {}, // map of { group_name_div_name: { qty, sales, div_name, group_name } }
            name: bill.name,
            mobile: bill.mobile_no
          };
        }

        affectedMembers.add(bill.card_no);

        const group = dailyGroup[key];
        group.total_txn += 1;

        if (bill.bill_time > group.last_purchase_time) {
          group.last_purchase_time = bill.bill_time;
        }

        const billDetails = detailsMap.get(`${bill.org_cd}_${bill.bill_no}`) || [];
        if (billDetails.length > 0) {
          billDetails.forEach(det => {
            group.total_sales += det.net_value;
            group.total_cost += det.cost_value || (det.cost_price * det.qty);
            group.total_promo += det.promo_disc;
            group.total_qty += det.qty;

            const catKey = `${det.group_name || 'Unknown'}_${det.div_name || 'Unknown'}`;
            if (!group.categories[catKey]) {
              group.categories[catKey] = {
                qty: 0,
                sales: 0,
                group_name: det.group_name,
                div_name: det.div_name
              };
            }
            group.categories[catKey].qty += det.qty;
            group.categories[catKey].sales += det.net_value;
          });
        } else {
          // Fallback if detail not found
          group.total_sales += bill.bill_val;
        }
      });

      // Insert summaries to LOYAL_MEMBER_DAILY_SUMMARY on local DB
      log(`[ETL] Saving ${Object.keys(dailyGroup).length} summary records to LOYAL_MEMBER_DAILY_SUMMARY...`);
      for (const key of Object.keys(dailyGroup)) {
        const item = dailyGroup[key];
        item.total_margin = item.total_sales - item.total_cost - item.total_promo;

        const categoriesJson = JSON.stringify(Object.values(item.categories));

        await runQuery(
          localDbConfig,
          () => localPool,
          p => { localPool = p; },
          pool => pool.request()
            .input('member_id', sql.NVarChar, item.member_id)
            .input('summary_date', sql.Date, item.summary_date)
            .input('org_cd', sql.NVarChar, item.org_cd)
            .input('sales', sql.Decimal(18, 2), item.total_sales)
            .input('cost', sql.Decimal(18, 2), item.total_cost)
            .input('promo', sql.Decimal(18, 2), item.total_promo)
            .input('margin', sql.Decimal(18, 2), item.total_margin)
            .input('qty', sql.Decimal(18, 2), item.total_qty)
            .input('txn', sql.Int, item.total_txn)
            .input('last_time', sql.VarChar(10), item.last_purchase_time)
            .input('categories', sql.NVarChar, categoriesJson)
            .query(`
              IF EXISTS (
                SELECT 1 FROM LOYAL_MEMBER_DAILY_SUMMARY
                WHERE member_id = @member_id AND summary_date = @summary_date AND org_cd = @org_cd
              )
              BEGIN
                UPDATE LOYAL_MEMBER_DAILY_SUMMARY SET
                  total_sales = @sales,
                  total_cost = @cost,
                  total_promo = @promo,
                  total_margin = @margin,
                  total_qty = @qty,
                  total_txn = @txn,
                  last_purchase_time = @last_time,
                  categories_bought = @categories
                WHERE member_id = @member_id AND summary_date = @summary_date AND org_cd = @org_cd
              END
              ELSE
              BEGIN
                INSERT INTO LOYAL_MEMBER_DAILY_SUMMARY
                  (member_id, summary_date, org_cd, total_sales, total_cost, total_promo, total_margin, total_qty, total_txn, last_purchase_time, categories_bought)
                VALUES
                  (@member_id, @summary_date, @org_cd, @sales, @cost, @promo, @margin, @qty, @txn, @last_time, @categories)
              END
            `)
        );

        // Update profile schema placeholders as well (such as name & mobile) if not present
        await runQuery(
          localDbConfig,
          () => localPool,
          p => { localPool = p; },
          pool => pool.request()
            .input('member_id', sql.NVarChar, item.member_id)
            .input('name', sql.NVarChar, item.name)
            .input('mobile', sql.NVarChar, item.mobile)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM LOYAL_MEMBER_PROFILE WHERE member_id = @member_id)
              BEGIN
                INSERT INTO LOYAL_MEMBER_PROFILE (member_id, name, mobile_no, join_date, city)
                VALUES (@member_id, @name, @mobile, GETDATE(), 'Pepito Local')
              END
              ELSE
              BEGIN
                UPDATE LOYAL_MEMBER_PROFILE
                SET name = @name, mobile_no = @mobile
                WHERE member_id = @member_id AND (name IS NULL OR name = 'Member')
              END
            `)
        );
      }
    }

    // 4. Update Profile Statistics & Achievements
    log(`[ETL] Updating profiles & evaluating achievements for ${affectedMembers.size} affected members...`);

    for (const memberId of affectedMembers) {
      // Get all daily summaries for this member
      const summaryRes = await runQuery(
        localDbConfig,
        () => localPool,
        p => { localPool = p; },
        pool => pool.request()
          .input('member_id', sql.NVarChar, memberId)
          .query("SELECT * FROM LOYAL_MEMBER_DAILY_SUMMARY WHERE member_id = @member_id ORDER BY summary_date ASC")
      );

      const summaries = summaryRes.recordset;
      if (summaries.length === 0) continue;

      let totalSpent = 0;
      let totalTransactions = 0;
      let lastActiveDate = summaries[0].summary_date;
      const storeSpendMap = {};

      summaries.forEach(s => {
        totalSpent += s.total_sales;
        totalTransactions += s.total_txn;
        if (s.summary_date > lastActiveDate) {
          lastActiveDate = s.summary_date;
        }
        if (!storeSpendMap[s.org_cd]) storeSpendMap[s.org_cd] = 0;
        storeSpendMap[s.org_cd] += s.total_sales;
      });

      // Find favorite store (highest spending store)
      let favoriteStore = summaries[0].org_cd;
      let maxSpent = 0;
      Object.keys(storeSpendMap).forEach(store => {
        if (storeSpendMap[store] > maxSpent) {
          maxSpent = storeSpendMap[store];
          favoriteStore = store;
        }
      });

      // Update LOYAL_MEMBER_PROFILE stats
      await runQuery(
        localDbConfig,
        () => localPool,
        p => { localPool = p; },
        pool => pool.request()
          .input('member_id', sql.NVarChar, memberId)
          .input('spent', sql.Decimal(18, 2), totalSpent)
          .input('txn', sql.Int, totalTransactions)
          .input('last_active', sql.Date, lastActiveDate)
          .input('fav_store', sql.NVarChar, favoriteStore)
          .query(`
            UPDATE LOYAL_MEMBER_PROFILE
            SET 
              total_spent = @spent,
              total_transactions = @txn,
              last_active_date = @last_active,
              favorite_store = @fav_store,
              updated_at = GETDATE()
            WHERE member_id = @member_id
          `)
      );

      // Retrieve profile details for achievement logic
      const profileRes = await runQuery(
        localDbConfig,
        () => localPool,
        p => { localPool = p; },
        pool => pool.request()
          .input('member_id', sql.NVarChar, memberId)
          .query("SELECT * FROM LOYAL_MEMBER_PROFILE WHERE member_id = @member_id")
      );

      const profile = profileRes.recordset[0];
      if (!profile) continue;

      // Evaluate achievements
      const earned = evaluateAchievements(memberId, profile, summaries);

      // Insert achievements
      for (const ach of earned) {
        await runQuery(
          localDbConfig,
          () => localPool,
          p => { localPool = p; },
          pool => pool.request()
            .input('member_id', sql.NVarChar, memberId)
            .input('name', sql.NVarChar, ach.name)
            .input('criteria', sql.NVarChar, ach.criteria)
            .query(`
              IF NOT EXISTS (SELECT 1 FROM LOYAL_MEMBER_ACHIEVEMENT WHERE member_id = @member_id AND achievement_name = @name)
              BEGIN
                INSERT INTO LOYAL_MEMBER_ACHIEVEMENT (member_id, achievement_name, unlocked_at, criteria_met)
                VALUES (@member_id, @name, GETDATE(), @criteria)
              END
            `)
        );
      }
    }

    log(`[ETL] DEV CRM Loyalty ETL completed successfully!`);

  } catch (err) {
    log(`[ETL] Error during ETL: ${err.message}`);
    throw err;
  } finally {
    if (localPool) { try { await localPool.close(); } catch (_) {} }
    if (crmPool) { try { await crmPool.close(); } catch (_) {} }
    if (hoPool) { try { await hoPool.close(); } catch (_) {} }
  }
}

// Support running directly from terminal
if (require.main === module) {
  const args = process.argv.slice(2);
  const defaultFrom = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);

  const fromDate = args[0] || defaultFrom;
  const toDate = args[1] || defaultTo;

  runDevEtl(fromDate, toDate, console.log)
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { runDevEtl };
