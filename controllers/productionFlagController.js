import sql from 'mssql';
import { getHoServerPool } from './crmController.js';
import { poolPromise, initDb } from '../config/db.js';

const FLAG_LABELS = {
  '0': 'Regular',
  '1': 'Production',
  '2': 'Preproduction'
};

let historyTablePromise;
const ensureHistoryTable = async () => {
  if (!historyTablePromise) {
    historyTablePromise = (async () => {
      await initDb();
      const pool = await poolPromise;
      await pool.request().query(`
        IF OBJECT_ID('dbo.SUPPORT_ITEM_PRODUCTION_FLAG_LOGS', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.SUPPORT_ITEM_PRODUCTION_FLAG_LOGS (
            id INT IDENTITY(1,1) PRIMARY KEY,
            item_code VARCHAR(40) NOT NULL,
            item_name VARCHAR(200) NULL,
            old_flag VARCHAR(1) NOT NULL,
            new_flag VARCHAR(1) NOT NULL,
            changed_by VARCHAR(100) NULL,
            changed_by_name VARCHAR(150) NULL,
            changed_at DATETIME NOT NULL DEFAULT GETDATE()
          );
        END
      `);
      return pool;
    })().catch(error => {
      historyTablePromise = null;
      throw error;
    });
  }
  return historyTablePromise;
};

export const getProductionFlagItems = async (req, res) => {
  const search = String(req.query.search || '').trim();
  let hoPool;

  try {
    hoPool = await getHoServerPool();
    const result = await hoPool.request()
      .input('search', sql.VarChar, search ? `%${search}%` : '%')
      .query(`
        SELECT TOP 100
          ITM_CD AS item_code,
          ITM_NAME AS item_name,
          ITM_PRODUCTION_FLAG AS production_flag,
          LAST_UPDATED_DATE AS updated_date,
          LAST_UPDATED_TIME AS updated_time
        FROM ITEM_MST WITH (NOLOCK)
        WHERE ITM_CD LIKE @search OR ITM_NAME LIKE @search
        ORDER BY ITM_CD
      `);

    res.json(result.recordset.map(item => ({
      ...item,
      production_label: FLAG_LABELS[String(item.production_flag)] || 'Unknown'
    })));
  } catch (err) {
    console.error('[ProductionFlag] list error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil data item dari pepito_ho.', details: err.message });
  } finally {
    if (hoPool) await hoPool.close().catch(() => {});
  }
};

export const updateProductionFlag = async (req, res) => {
  const itemCode = String(req.params.itemCode || '').trim();
  const productionFlag = String(req.body.production_flag ?? '').trim();
  const changedBy = String(req.body.changed_by || 'SYSTEM').trim();
  const changedByName = String(req.body.changed_by_name || changedBy).trim();

  if (!itemCode) return res.status(400).json({ error: 'Item code wajib diisi.' });
  if (!Object.prototype.hasOwnProperty.call(FLAG_LABELS, productionFlag)) {
    return res.status(400).json({ error: 'Production flag harus 0 (Regular), 1 (Production), atau 2 (Preproduction).' });
  }

  let hoPool;
  try {
    hoPool = await getHoServerPool();
    const before = await hoPool.request()
      .input('item_code', sql.VarChar, itemCode)
      .query('SELECT TOP 1 ITM_PRODUCTION_FLAG AS production_flag FROM ITEM_MST WITH (NOLOCK) WHERE ITM_CD = @item_code');
    const oldFlag = before.recordset[0]?.production_flag;
    if (oldFlag === undefined) return res.status(404).json({ error: `Item ${itemCode} tidak ditemukan.` });

    const result = await hoPool.request()
      .input('item_code', sql.VarChar, itemCode)
      .input('production_flag', sql.VarChar, productionFlag)
      .query(`
        UPDATE ITEM_MST
        SET ITM_PRODUCTION_FLAG = @production_flag,
            LAST_UPDATED_DATE = CONVERT(date, GETDATE()),
            LAST_UPDATED_TIME = REPLACE(CONVERT(varchar(8), GETDATE(), 108), ':', '')
        WHERE ITM_CD = @item_code;

        SELECT TOP 1
          ITM_CD AS item_code,
          ITM_NAME AS item_name,
          ITM_PRODUCTION_FLAG AS production_flag,
          LAST_UPDATED_DATE AS updated_date,
          LAST_UPDATED_TIME AS updated_time
        FROM ITEM_MST WITH (NOLOCK)
        WHERE ITM_CD = @item_code;
      `);

    // mssql does not create a recordset for the UPDATE statement, so the
    // following SELECT is normally recordsets[0]. Keep the fallback for
    // drivers/configurations that expose an additional resultset.
    const item = result.recordset?.[0] || result.recordsets?.at(-1)?.[0];
    if (!item) return res.status(404).json({ error: `Item ${itemCode} tidak ditemukan.` });

    let historyWarning = null;
    try {
      const historyPool = await ensureHistoryTable();
      await historyPool.request()
        .input('item_code', sql.VarChar, item.item_code)
        .input('item_name', sql.VarChar, item.item_name || null)
        .input('old_flag', sql.VarChar, String(oldFlag))
        .input('new_flag', sql.VarChar, String(item.production_flag))
        .input('changed_by', sql.VarChar, changedBy)
        .input('changed_by_name', sql.VarChar, changedByName)
        .query(`
          INSERT INTO dbo.SUPPORT_ITEM_PRODUCTION_FLAG_LOGS
            (item_code, item_name, old_flag, new_flag, changed_by, changed_by_name)
          VALUES (@item_code, @item_name, @old_flag, @new_flag, @changed_by, @changed_by_name)
        `);
    } catch (historyError) {
      historyWarning = 'Update berhasil, tetapi history gagal disimpan.';
      console.error('[ProductionFlag] history error:', historyError.message);
    }

    res.json({
      success: true,
      item: { ...item, production_label: FLAG_LABELS[String(item.production_flag)] },
      history_warning: historyWarning
    });
  } catch (err) {
    console.error('[ProductionFlag] update error:', err.message);
    res.status(500).json({ error: 'Gagal memperbarui production flag item.', details: err.message });
  } finally {
    if (hoPool) await hoPool.close().catch(() => {});
  }
};

export const getProductionFlagHistory = async (req, res) => {
  const itemCode = String(req.query.item_code || '').trim();
  if (!itemCode) return res.status(400).json({ error: 'Item code wajib dipilih untuk melihat history.' });
  try {
    const pool = await ensureHistoryTable();
    const request = pool.request().input('item_code', sql.VarChar, itemCode);
    const result = await request.query(`
      SELECT TOP 100
        id, item_code, item_name, old_flag, new_flag,
        changed_by, changed_by_name, changed_at
      FROM dbo.SUPPORT_ITEM_PRODUCTION_FLAG_LOGS
      WHERE item_code = @item_code
      ORDER BY changed_at DESC, id DESC
    `);
    res.json(result.recordset.map(row => ({
      ...row,
      old_label: FLAG_LABELS[String(row.old_flag)] || 'Unknown',
      new_label: FLAG_LABELS[String(row.new_flag)] || 'Unknown'
    })));
  } catch (err) {
    console.error('[ProductionFlag] history list error:', err.message);
    res.status(500).json({ error: 'Gagal mengambil history production flag.', details: err.message });
  }
};
