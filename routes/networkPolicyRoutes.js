import express from 'express';
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

const router = express.Router();

// ─€─€ GET /api/network-policies ─€─€
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT p.*,
        CASE
          WHEN p.target_type = 'group' THEN g.name
          WHEN p.target_type = 'device' THEN d.hostname
          ELSE 'All Devices'
        END as target_name,
        sg.name as site_group_name,
        CONVERT(varchar, d.last_network_poll, 120) AS last_network_poll
      FROM NetworkPolicies p
      LEFT JOIN DeviceGroups g ON p.target_id = g.id AND p.target_type = 'group'
      LEFT JOIN Devices d ON p.target_id = d.id AND p.target_type = 'device'
      LEFT JOIN SiteGroups sg ON p.site_group_id = sg.id
      ORDER BY p.created_at DESC
    `);
    res.json({ success: true, policies: result.recordset });
  } catch (err) {
    console.error('Error fetching network policies:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─€─€ POST /api/network-policies ─€─€
router.post('/', async (req, res) => {
  const { action, domain, site_group_id, target_type, target_id, id, is_active } = req.body;
  try {
    const pool = await poolPromise;
    if (action === 'add') {
      if (!domain && !site_group_id) return res.status(400).json({ success: false, error: 'Domain or Site Group is required' });
      await pool.request()
        .input('domain', sql.NVarChar, domain || null)
        .input('site_group_id', sql.Int, site_group_id || null)
        .input('target_type', sql.NVarChar, target_type || 'global')
        .input('target_id', sql.NVarChar, target_id || null)
        .query('INSERT INTO NetworkPolicies (domain, site_group_id, target_type, target_id) VALUES (@domain, @site_group_id, @target_type, @target_id)');
      res.json({ success: true });
    } else if (action === 'delete') {
      if (!id) return res.status(400).json({ success: false, error: 'ID is required' });
      await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM NetworkPolicies WHERE id = @id');
      res.json({ success: true });
    } else if (action === 'toggle_status') {
      if (!id) return res.status(400).json({ success: false, error: 'ID is required' });
      await pool.request()
        .input('id', sql.Int, id)
        .input('is_active', sql.Bit, is_active ? 1 : 0)
        .query('UPDATE NetworkPolicies SET is_active = @is_active, updated_at = GETDATE() WHERE id = @id');
      res.json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (err) {
    console.error('Error modifying network policies:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─€─€ GET /api/network-policies/summary ─€─€
router.get('/summary', async (req, res) => {
  try {
    const pool = await poolPromise;
    const stats = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM Devices) as total_devices,
        (SELECT COUNT(*) FROM NetworkPolicies) as total_policies,
        (SELECT COUNT(*) FROM NetworkPolicies WHERE is_active = 1) as active_policies,
        (SELECT COUNT(*) FROM SiteGroups) as total_site_groups,
        (SELECT COUNT(*) FROM SiteGroupItems) as total_domains_in_groups
    `);
    res.json({ success: true, summary: stats.recordset[0] });
  } catch (err) {
    console.error('Error fetching network policies summary:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─€─€ GET /api/network-policies/site-groups ─€─€
router.get('/site-groups', async (req, res) => {
  try {
    const pool = await poolPromise;
    const groupsRes = await pool.request().query('SELECT * FROM SiteGroups ORDER BY name ASC');
    const itemsRes = await pool.request().query('SELECT * FROM SiteGroupItems');
    
    const groups = groupsRes.recordset.map(g => {
      return {
        ...g,
        domains: itemsRes.recordset.filter(i => i.group_id === g.id).map(i => i.domain),
        items: itemsRes.recordset.filter(i => i.group_id === g.id)
      };
    });
    
    res.json({ success: true, siteGroups: groups });
  } catch (err) {
    console.error('Error fetching site groups:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─€─€ POST /api/network-policies/site-groups ─€─€
router.post('/site-groups', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .query('INSERT INTO SiteGroups (name, description) OUTPUT INSERTED.id VALUES (@name, @description)');
    res.json({ success: true, id: result.recordset[0].id });
  } catch (err) {
    console.error('Error adding site group:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─€─€ POST /api/network-policies/site-groups/delete ─€─€
router.post('/site-groups/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'ID is required' });
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id).query('DELETE FROM SiteGroups WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─€─€ POST /api/network-policies/site-group-items ─€─€
router.post('/site-group-items', async (req, res) => {
  const { group_id, domain } = req.body;
  if (!group_id || !domain) return res.status(400).json({ success: false, error: 'Group ID and domain are required' });
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('group_id', sql.Int, group_id)
      .input('domain', sql.NVarChar, domain)
      .query('INSERT INTO SiteGroupItems (group_id, domain) VALUES (@group_id, @domain)');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─€─€ POST /api/network-policies/site-group-items/delete ─€─€
router.post('/site-group-items/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'ID is required' });
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id).query('DELETE FROM SiteGroupItems WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
