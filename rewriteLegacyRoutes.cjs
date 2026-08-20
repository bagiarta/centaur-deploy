const fs = require('fs');
const file = 'f:/PepiUpdater/centaur-deploy/routes/legacyRoutes.js';
const code = fs.readFileSync(file, 'utf-8');

const firstBlockStart = `    else if (type === 'wakeup-call') {
      const pageNum    = parseInt(page)    || 1;
      const perPageNum = parseInt(perPage) || 50;
      const s = search ? search.toLowerCase() : null;`;
      
const firstBlockEnd = `      } catch (e) {
        return res.status(500).json({ error: \`WAKEUP-CALL: \${e.message}\` });
      }
    }`;

const secondBlockStart = `    else if (type === 'wakeup-call') {
      title = "Wakeup Call Customer";
      columns = [`;

const secondBlockEnd = `        }
        merged.sort((a, b) => b.total_amount - a.total_amount);

        rows = merged;
      } catch (e) {
        return res.status(500).json({ error: \`WAKEUP-CALL: \${e.message}\` });
      }
    }`;

const newFirstBlock = `    else if (type === 'wakeup-call') {
      const pageNum    = parseInt(page)    || 1;
      const perPageNum = parseInt(perPage) || 50;
      const offset = (pageNum - 1) * perPageNum;

      try {
        let where = 'WHERE 1=1';
        const reqDb = pool.request();

        if (store && store !== 'All Store') {
          where += \` AND last_store = @storeName\`;
          reqDb.input('storeName', pool.constructor.VarChar || require('mssql').VarChar, store);
        }

        if (fromDate && toDate) {
           where += \` AND last_purchase_date >= @fromDate AND last_purchase_date <= @toDate\`;
           reqDb.input('fromDate', pool.constructor.DateTime || require('mssql').DateTime, new Date(fromDate + ' 00:00:00'));
           reqDb.input('toDate', pool.constructor.DateTime || require('mssql').DateTime, new Date(toDate + ' 23:59:59'));
        }

        if (search) {
           where += \` AND (member_name LIKE @s OR card_no LIKE @s)\`;
           reqDb.input('s', pool.constructor.NVarChar || require('mssql').NVarChar, \`%\${search}%\`);
        }

        const countRes = await reqDb.query(\`SELECT COUNT(*) as total FROM WakeupCallCache \${where}\`);
        const total = countRes.recordset[0].total;

        reqDb.input('offset', pool.constructor.Int || require('mssql').Int, offset);
        reqDb.input('limit', pool.constructor.Int || require('mssql').Int, perPageNum);
        const dataRes = await reqDb.query(\`
          SELECT * FROM WakeupCallCache 
          \${where} 
          ORDER BY total_amount DESC 
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        \`);

        const rows = dataRes.recordset.map(r => ({
          name: r.member_name,
          card_no: r.card_no,
          phone_no: null,
          tier: 'Regular',
          activation_status: 'Activated',
          total_point: Math.floor((r.total_amount || 0) / 50000),
          total_txn: r.total_transactions,
          total_amount: r.total_amount,
          last_txn_date: r.last_purchase_date,
          last_store: r.last_store
        }));

        return res.json({
          rows,
          total,
          summary: { total: rows.length, status: 'COMPLETED' },
          page: pageNum,
          perPage: perPageNum,
          totalPages: Math.ceil(total / perPageNum)
        });
      } catch (e) {
        return res.status(500).json({ error: \`WAKEUP-CALL: \${e.message}\` });
      }
    }`;

const newSecondBlock = `    else if (type === 'wakeup-call') {
      title = "Wakeup Call Customer";
      columns = [
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Phone No', key: 'phone_no', width: 15 },
        { header: 'Tier', key: 'tier', width: 10 },
        { header: 'Activation Status', key: 'activation_status', width: 15 },
        { header: 'Total Point', key: 'total_point', width: 15 },
        { header: 'Total Transaction', key: 'total_txn', width: 15 },
        { header: 'Total Amount', key: 'total_amount', width: 20, style: { numFmt: '#,##0' } },
        { header: 'Last Txn Date', key: 'last_txn_date', width: 15 },
        { header: 'Last Txn Store', key: 'last_store', width: 25 },
      ];

      try {
        let where = 'WHERE 1=1';
        const reqDb = pool.request();

        if (store && store !== 'All Store') {
          where += \` AND last_store = @storeName\`;
          reqDb.input('storeName', pool.constructor.VarChar || require('mssql').VarChar, store);
        }

        if (fromDate && toDate) {
           where += \` AND last_purchase_date >= @fromDate AND last_purchase_date <= @toDate\`;
           reqDb.input('fromDate', pool.constructor.DateTime || require('mssql').DateTime, new Date(fromDate + ' 00:00:00'));
           reqDb.input('toDate', pool.constructor.DateTime || require('mssql').DateTime, new Date(toDate + ' 23:59:59'));
        }

        if (search) {
           where += \` AND (member_name LIKE @s OR card_no LIKE @s)\`;
           reqDb.input('s', pool.constructor.NVarChar || require('mssql').NVarChar, \`%\${search}%\`);
        }

        const dataRes = await reqDb.query(\`SELECT * FROM WakeupCallCache \${where} ORDER BY total_amount DESC\`);

        rows = dataRes.recordset.map(r => ({
          name: r.member_name,
          card_no: r.card_no,
          phone_no: null,
          tier: 'Regular',
          activation_status: 'Activated',
          total_point: Math.floor((r.total_amount || 0) / 50000),
          total_txn: r.total_transactions,
          total_amount: r.total_amount,
          last_txn_date: r.last_purchase_date ? new Date(r.last_purchase_date).toISOString().split('T')[0] : '',
          last_store: r.last_store
        }));
      } catch (e) {
        return res.status(500).json({ error: \`WAKEUP-CALL EXPORT: \${e.message}\` });
      }
    }`;

let i1 = code.indexOf(firstBlockStart);
let j1 = code.indexOf(firstBlockEnd, i1);

if (i1 === -1 || j1 === -1) {
    console.error("First block not found!");
    process.exit(1);
}

let modified = code.substring(0, i1) + newFirstBlock + code.substring(j1 + firstBlockEnd.length);

let i2 = modified.indexOf(secondBlockStart);
let j2 = modified.indexOf(secondBlockEnd, i2);

if (i2 === -1 || j2 === -1) {
    console.error("Second block not found!");
    process.exit(1);
}

modified = modified.substring(0, i2) + newSecondBlock + modified.substring(j2 + secondBlockEnd.length);

fs.writeFileSync(file, modified);
console.log("Rewrite successful.");
