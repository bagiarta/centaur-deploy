import sql from 'mssql';
import { poolPromise } from '../config/db.js';

// CRM Pool for DimStore access
let crmPoolPromise = null;

async function getCrmPool() {
  if (crmPoolPromise) return crmPoolPromise;
  
  try {
    const config = {
      user: process.env.CRM_DB_USER || 'sa',
      password: process.env.CRM_DB_PASS || process.env.DB_PASS,
      server: process.env.CRM_DB_SERVER || '192.168.85.55',
      database: process.env.CRM_DB_NAME || 'DBWH_8555',
      options: { encrypt: false, trustServerCertificate: true },
      connectionTimeout: 15000,
      requestTimeout: 30000
    };
    
    const crmPool = new sql.ConnectionPool(config);
    crmPoolPromise = crmPool.connect();
    return crmPoolPromise;
  } catch (err) {
    console.error('[SupportManager CRM] Failed to connect to CRM Pool:', err.message);
    crmPoolPromise = null;
    throw err;
  }
}

// 1. GET /api/trial/support-manager/stores
export const getStores = async (req, res) => {
  try {
    const crmPool = await getCrmPool();
    const result = await crmPool.request().query(`
      SELECT DISTINCT ORG_CD AS org_cd, ORG_NAME AS org_name 
      FROM DimStore 
      WHERE ORG_CD IS NOT NULL AND ORG_NAME IS NOT NULL AND ORG_STATUS = 'O'
      ORDER BY ORG_CD ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[SupportManager] getStores error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stores from DimStore', details: err.message });
  }
};

// 2. GET /api/trial/support-manager/pic-users
export const getPicUsers = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT u.id, u.username, u.full_name, r.name as role_name, u.division, u.location
      FROM Users u
      JOIN Roles r ON u.role_id = r.id
      WHERE u.division = 'IT'
      ORDER BY u.full_name ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[SupportManager] getPicUsers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch IT division users', details: err.message });
  }
};

// 3. GET /api/trial/support-manager/cctv-devices
export const getCctvDevices = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT id, name, ip_address, status 
      FROM CCTVDevices 
      WHERE is_active = 1
      ORDER BY name ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[SupportManager] getCctvDevices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch CCTV devices', details: err.message });
  }
};

// 4. GET /api/trial/support-manager/schedules
export const getSchedules = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT s.*, u.full_name as pic_fullname 
      FROM Trial_PMSchedules s
      LEFT JOIN Users u ON s.pic_id = u.id
      ORDER BY s.scheduled_date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('[SupportManager] getSchedules error:', err.message);
    res.status(500).json({ error: 'Failed to fetch PM schedules', details: err.message });
  }
};

// 5. POST /api/trial/support-manager/schedules
export const createSchedule = async (req, res) => {
  const { store_code, store_name, scheduled_date, pic_id, pic_name, notes } = req.body;
  if (!store_code || !scheduled_date || !pic_id) {
    return res.status(400).json({ error: 'Store, Date, and PIC are required' });
  }

  try {
    const pool = await poolPromise;
    const id = `sched-${Date.now()}`;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('store_code', sql.NVarChar, store_code)
      .input('store_name', sql.NVarChar, store_name)
      .input('scheduled_date', sql.Date, scheduled_date)
      .input('pic_id', sql.NVarChar, pic_id)
      .input('pic_name', sql.NVarChar, pic_name)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        INSERT INTO Trial_PMSchedules (id, store_code, store_name, scheduled_date, pic_id, pic_name, status, notes)
        VALUES (@id, @store_code, @store_name, @scheduled_date, @pic_id, @pic_name, 'Scheduled', @notes)
      `);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[SupportManager] createSchedule error:', err.message);
    res.status(500).json({ error: 'Failed to create schedule', details: err.message });
  }
};

// 6. POST /api/trial/support-manager/results (Submit Checklist)
export const submitPMResult = async (req, res) => {
  const { schedule_id, store_code, store_name, pic_id, pic_name, overall_status, general_notes, device_checks } = req.body;
  
  if (!schedule_id || !store_code || !device_checks || !Array.isArray(device_checks)) {
    return res.status(400).json({ error: 'Invalid PM submission payload' });
  }

  const transaction = new sql.Transaction(await poolPromise);
  try {
    await transaction.begin();
    const result_id = `res-${Date.now()}`;

    // 1. Insert into Trial_PMResults
    await transaction.request()
      .input('id', sql.NVarChar, result_id)
      .input('schedule_id', sql.NVarChar, schedule_id)
      .input('store_code', sql.NVarChar, store_code)
      .input('store_name', sql.NVarChar, store_name)
      .input('pic_id', sql.NVarChar, pic_id)
      .input('pic_name', sql.NVarChar, pic_name)
      .input('overall_status', sql.NVarChar, overall_status || 'Success')
      .input('general_notes', sql.NVarChar, general_notes || null)
      .query(`
        INSERT INTO Trial_PMResults (id, schedule_id, store_code, store_name, pic_id, pic_name, overall_status, general_notes)
        VALUES (@id, @schedule_id, @store_code, @store_name, @pic_id, @pic_name, @overall_status, @general_notes)
      `);

    // 2. Query previous checks for this store to identify recurring issues
    const prevChecksRes = await transaction.request()
      .input('store_code', sql.NVarChar, store_code)
      .query(`
        SELECT TOP 30 c.device_category, c.device_name, c.status 
        FROM Trial_PMDeviceChecks c
        JOIN Trial_PMResults r ON c.result_id = r.id
        WHERE r.store_code = @store_code
        ORDER BY r.execution_date DESC
      `);
    
    // Map of device -> was_broken
    const lastBrokenDevices = new Set();
    prevChecksRes.recordset.forEach(row => {
      if (row.status === 'Needs Repair' || row.status === 'Needs Replacement') {
        lastBrokenDevices.add(`${row.device_category}:${row.device_name}`);
      }
    });

    // 3. Insert each device check
    for (const check of device_checks) {
      const isBroken = check.status === 'Needs Repair' || check.status === 'Needs Replacement';
      const key = `${check.device_category}:${check.device_name}`;
      const is_recurring = (isBroken && lastBrokenDevices.has(key)) ? 1 : 0;

      await transaction.request()
        .input('result_id', sql.NVarChar, result_id)
        .input('device_category', sql.NVarChar, check.device_category)
        .input('device_name', sql.NVarChar, check.device_name)
        .input('cctv_device_id', sql.NVarChar, check.cctv_device_id || null)
        .input('status', sql.NVarChar, check.status)
        .input('issues_found', sql.NVarChar, check.issues_found || null)
        .input('is_recurring', sql.Bit, is_recurring)
        .query(`
          INSERT INTO Trial_PMDeviceChecks (result_id, device_category, device_name, cctv_device_id, status, issues_found, is_recurring)
          VALUES (@result_id, @device_category, @device_name, @cctv_device_id, @status, @issues_found, @is_recurring)
        `);

      // 4. Create action item if it needs repair or replacement
      if (isBroken) {
        const action_type = check.status === 'Needs Replacement' ? 'Replacement' : 'Repair';
        await transaction.request()
          .input('result_id', sql.NVarChar, result_id)
          .input('store_code', sql.NVarChar, store_code)
          .input('device_category', sql.NVarChar, check.device_category)
          .input('device_name', sql.NVarChar, check.device_name)
          .input('cctv_device_id', sql.NVarChar, check.cctv_device_id || null)
          .input('issue_description', sql.NVarChar, check.issues_found || 'Issues detected during Preventive Maintenance')
          .input('action_type', sql.NVarChar, action_type)
          .query(`
            INSERT INTO Trial_PMActionItems (result_id, store_code, device_category, device_name, cctv_device_id, issue_description, action_type, status)
            VALUES (@result_id, @store_code, @device_category, @device_name, @cctv_device_id, @issue_description, @action_type, 'Pending')
          `);
      }
    }

    // 5. Update PM Schedule Status to Completed
    await transaction.request()
      .input('schedule_id', sql.NVarChar, schedule_id)
      .query(`
        UPDATE Trial_PMSchedules 
        SET status = 'Completed', updated_at = GETDATE()
        WHERE id = @schedule_id
      `);

    await transaction.commit();
    res.json({ success: true, result_id });
  } catch (err) {
    await transaction.rollback();
    console.error('[SupportManager] submitPMResult error:', err.message);
    res.status(500).json({ error: 'Failed to submit PM checklist', details: err.message });
  }
};

// 7. GET /api/trial/support-manager/action-items
export const getActionItems = async (req, res) => {
  try {
    const pool = await poolPromise;
    const { status, store_code } = req.query;
    
    let query = `
      SELECT a.*, r.execution_date, r.pic_name, s.store_name
      FROM Trial_PMActionItems a
      JOIN Trial_PMResults r ON a.result_id = r.id
      JOIN Trial_PMSchedules s ON r.schedule_id = s.id
      WHERE 1=1
    `;
    const request = pool.request();
    
    if (status) {
      query += ` AND a.status = @status`;
      request.input('status', sql.NVarChar, status);
    }
    if (store_code) {
      query += ` AND a.store_code = @store_code`;
      request.input('store_code', sql.NVarChar, store_code);
    }
    
    query += ` ORDER BY a.created_at DESC`;
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error('[SupportManager] getActionItems error:', err.message);
    res.status(500).json({ error: 'Failed to fetch action items', details: err.message });
  }
};

// 8. PUT /api/trial/support-manager/action-items/:id/resolve
export const resolveActionItem = async (req, res) => {
  const { id } = req.params;
  const { resolution_notes } = req.body;

  if (!resolution_notes) {
    return res.status(400).json({ error: 'Resolution notes are required to resolve an item' });
  }

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, id)
      .input('resolution_notes', sql.NVarChar, resolution_notes)
      .query(`
        UPDATE Trial_PMActionItems
        SET status = 'Resolved',
            resolution_notes = @resolution_notes,
            resolved_at = GETDATE(),
            updated_at = GETDATE()
        WHERE id = @id
      `);
    res.json({ success: true });
  } catch (err) {
    console.error('[SupportManager] resolveActionItem error:', err.message);
    res.status(500).json({ error: 'Failed to resolve action item', details: err.message });
  }
};

// 9. GET /api/trial/support-manager/analytics
export const getAnalytics = async (req, res) => {
  try {
    const pool = await poolPromise;

    // A. Stats Cards data
    const statsQuery = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Trial_PMSchedules WHERE status = 'Scheduled') as pending_schedules,
        (SELECT COUNT(*) FROM Trial_PMSchedules WHERE status = 'Completed') as completed_pms,
        (SELECT COUNT(*) FROM Trial_PMActionItems WHERE status = 'Pending') as active_action_items,
        (SELECT COUNT(*) FROM Trial_PMActionItems WHERE status = 'Pending' AND action_type = 'Replacement') as replacement_needed
    `);
    const stats = statsQuery.recordset[0];

    // B. Most Problematic Devices (by category & name check fail counts)
    const problematicQuery = await pool.request().query(`
      SELECT device_category, device_name, COUNT(*) as fail_count
      FROM Trial_PMDeviceChecks
      WHERE status IN ('Needs Repair', 'Needs Replacement')
      GROUP BY device_category, device_name
      ORDER BY fail_count DESC
    `);
    const problematicDevices = problematicQuery.recordset;

    // C. Store Health Rankings (percentage of Good devices in their most recent PM result)
    const storesQuery = await pool.request().query(`
      WITH RecentResults AS (
        SELECT r.store_code, r.store_name, r.id as result_id,
               ROW_NUMBER() OVER(PARTITION BY r.store_code ORDER BY r.execution_date DESC) as rn
        FROM Trial_PMResults r
      )
      SELECT 
        rr.store_code, 
        rr.store_name,
        SUM(CASE WHEN c.status = 'Good' THEN 1 ELSE 0 END) as good_count,
        COUNT(c.id) as total_count,
        ROUND((SUM(CASE WHEN c.status = 'Good' THEN 1.0 ELSE 0.0 END) / COUNT(c.id)) * 100, 1) as health_percentage
      FROM RecentResults rr
      JOIN Trial_PMDeviceChecks c ON rr.result_id = c.result_id
      WHERE rr.rn = 1
      GROUP BY rr.store_code, rr.store_name
      ORDER BY health_percentage ASC
    `);
    const storeHealth = storesQuery.recordset;

    // D. Recurring failures
    const recurringQuery = await pool.request().query(`
      SELECT r.store_name, c.device_category, c.device_name, c.issues_found, r.execution_date, r.pic_name
      FROM Trial_PMDeviceChecks c
      JOIN Trial_PMResults r ON c.result_id = r.id
      WHERE c.is_recurring = 1 AND c.status IN ('Needs Repair', 'Needs Replacement')
      ORDER BY r.execution_date DESC
    `);
    const recurringFailures = recurringQuery.recordset;

    res.json({
      stats,
      problematicDevices,
      storeHealth,
      recurringFailures
    });
  } catch (err) {
    console.error('[SupportManager] getAnalytics error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve analytics', details: err.message });
  }
};
