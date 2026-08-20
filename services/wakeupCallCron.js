import cron from 'node-cron';
import sql from 'mssql';
import { getHoServerPool, crmPool, poolPromise } from '../config/db.js';

global.masterWakeupStatus = 'IDLE';

async function generateWakeupCallCache() {
  if (global.masterWakeupStatus === 'PROCESSING') return;
  global.masterWakeupStatus = 'PROCESSING';
  console.log('[WAKEUP-CRON] Starting full YTD cache generation to DB...');

  let hoPool = null;
  try {
    hoPool = await getHoServerPool();
    const mainPool = await poolPromise; // DBWH_8529
    const ytdFromDate = new Date(new Date().getFullYear(), 0, 1);
    
    // 1. Fetch ALL Loyalty Queues for the year
    console.log(`[WAKEUP-CRON] Fetching loyalty queue...`);
    const queueRes = await crmPool.request().query(`
      SELECT RLITQ_CARD_NO, RLITQ_BILL_NO, RLITQ_ORG_CD 
      FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) 
      WHERE RLITQ_INTEG_CODE = '110'
    `);
    const allQueue = queueRes.recordset;
    const allBillNos = [...new Set(allQueue.map(q => q.RLITQ_BILL_NO))];
    console.log(`[WAKEUP-CRON] Found ${allBillNos.length} unique bills in queue.`);

    // 2. Fetch bills from HOSERVER in batches
    const BATCH = 2000;
    const batchQuery = async (pool, sql_str, ids) => {
      const all = [];
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const list = chunk.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',');
        const q = sql_str.replace('__LIST__', list);
        const r = await pool.request().query(q);
        all.push(...r.recordset);
      }
      return all;
    };

    console.log('[WAKEUP-CRON] Fetching bills from HOSERVER...');
    const allBills = await batchQuery(hoPool, `
      SELECT BILL_NO, ORG_CD, BILL_DT, NET_VALUE, BILL_TIME 
      FROM POS_SALES_HDR (NOLOCK) 
      WHERE VOID_FLAG = 'F' AND BILL_NO IN (__LIST__)
    `, allBillNos);

    // Filter to YTD only and map
    const ytdBillMap = {};
    allBills.forEach(b => {
      if (b.BILL_DT >= ytdFromDate) {
        ytdBillMap[b.BILL_NO] = b;
      }
    });

    console.log('[WAKEUP-CRON] Mapping YTD data...');
    const cardYTD = {};
    
    allQueue.forEach(q => {
      const bill = ytdBillMap[q.RLITQ_BILL_NO];
      if (!bill) return;

      if (!cardYTD[q.RLITQ_CARD_NO]) {
        cardYTD[q.RLITQ_CARD_NO] = {
          card_no: q.RLITQ_CARD_NO,
          billNos: new Set(),
          totalAmount: 0,
          lastOrgCd: null,
          lastBillDt: new Date(0),
          lastBillTime: null
        };
      }
      
      const cy = cardYTD[q.RLITQ_CARD_NO];
      cy.billNos.add(q.RLITQ_BILL_NO);
      cy.totalAmount += (bill.NET_VALUE || 0);

      if (bill.BILL_DT > cy.lastBillDt) {
        cy.lastBillDt = bill.BILL_DT;
        cy.lastBillTime = bill.BILL_TIME;
        cy.lastOrgCd = bill.ORG_CD;
      } else if (bill.BILL_DT.getTime() === cy.lastBillDt.getTime()) {
        if (!cy.lastBillTime || bill.BILL_TIME > cy.lastBillTime) {
          cy.lastBillTime = bill.BILL_TIME;
          cy.lastOrgCd = bill.ORG_CD;
        }
      }
    });

    const targetCardNos = Object.keys(cardYTD);
    console.log(`[WAKEUP-CRON] Found ${targetCardNos.length} unique cards YTD. Fetching members...`);

    const allLastOrgCds = [...new Set(Object.values(cardYTD).map(v => v.lastOrgCd).filter(Boolean))];
    const [memberRes, storeRes] = await Promise.all([
      batchQuery(crmPool, `SELECT RLICM_CARD_NO, RLICM_NAME, RLICM_MOBILE_NO FROM RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) WHERE RLICM_CARD_NO IN (__LIST__)`, targetCardNos),
      allLastOrgCds.length > 0 ? batchQuery(crmPool, `SELECT ORG_CD, ORG_NAME FROM DimStore WHERE ORG_CD IN (__LIST__)`, allLastOrgCds) : Promise.resolve([])
    ]);

    const memberMap = {}; memberRes.forEach(m => { memberMap[m.RLICM_CARD_NO] = m; });
    const storeNameMap = {}; storeRes.forEach(s => { storeNameMap[s.ORG_CD] = s.ORG_NAME; });

    console.log('[WAKEUP-CRON] Saving to DBWH_8529 WakeupCallCache...');
    
    // Clear old data
    await mainPool.request().query('TRUNCATE TABLE WakeupCallCache');
    
    // Bulk insert new data
    const table = new sql.Table('WakeupCallCache');
    table.create = false;
    table.columns.add('card_no', sql.VarChar(50), { nullable: false, primary: true });
    table.columns.add('member_name', sql.NVarChar(255), { nullable: true });
    table.columns.add('total_amount', sql.Decimal(18,2), { nullable: true });
    table.columns.add('total_transactions', sql.Int, { nullable: true });
    table.columns.add('last_purchase_date', sql.DateTime, { nullable: true });
    table.columns.add('last_store', sql.VarChar(50), { nullable: true });
    table.columns.add('updated_at', sql.DateTime, { nullable: true });

    const now = new Date();
    targetCardNos.forEach(cardNo => {
      const cy = cardYTD[cardNo];
      const member = memberMap[cardNo] || {};
      const storeName = storeNameMap[cy.lastOrgCd] || cy.lastOrgCd || null;
      table.rows.add(
        cardNo,
        member.RLICM_NAME || null,
        cy.totalAmount || 0,
        cy.billNos.size,
        cy.lastBillDt,
        storeName,
        now
      );
    });

    await mainPool.request().bulk(table);

    global.masterWakeupStatus = 'COMPLETED';
    console.log(`[WAKEUP-CRON] Successfully generated cache with ${targetCardNos.length} rows.`);

  } catch (error) {
    console.error('[WAKEUP-CRON] Error generating cache:', error);
    global.masterWakeupStatus = 'ERROR';
  } finally {
    if (hoPool) {
      try { await hoPool.close(); } catch (_) {}
    }
  }
}

function initCron() {
  // Run once immediately on startup
  generateWakeupCallCache();

  // Schedule to run every day at 2:00 AM
  cron.schedule('0 2 * * *', () => {
    generateWakeupCallCache();
  });
  console.log('[WAKEUP-CRON] Scheduled to run once a day at 2:00 AM.');
}

module.exports = {
  initCron,
  generateWakeupCallCache
};
