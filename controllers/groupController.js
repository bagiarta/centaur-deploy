
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

export const getGroups = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        g.id,
        g.name,
        g.description,
        g.color,
        COUNT(d.id) AS device_count
      FROM DeviceGroups g
      LEFT JOIN Devices d
        ON ',' + ISNULL(d.group_ids, '') + ',' LIKE '%,' + g.id + ',%'
      GROUP BY g.id, g.name, g.description, g.color
      ORDER BY g.name ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const createGroup = async (req, res) => {
  try {
    const { id, name, description, color } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id || `group-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('color', sql.NVarChar, color || '#3b82f6')
      .query(`
        INSERT INTO DeviceGroups (id, name, description, color)
        VALUES (@id, @name, @description, @color)
      `);
    res.status(201).json({ message: 'Group created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const updateGroup = async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('color', sql.NVarChar, color || '#3b82f6')
      .query(`
        UPDATE DeviceGroups SET name = @name, description = @description, color = @color
        WHERE id = @id
      `);
    res.json({ message: 'Group updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const deleteGroup = async (req, res) => {
  try {
    const pool = await poolPromise;
    const groupId = req.params.id;

    // Optional: Remove group association from devices instead of cascading?
    // For now, simple delete. If Devices table uses a comma-separated list, 
    // we might need more complex logic to clean up Devices.group_ids.

    await pool.request()
      .input('id', sql.NVarChar, groupId)
      .query('DELETE FROM DeviceGroups WHERE id = @id');

    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const manageGroupDevices = async (req, res) => {
  const groupId = req.params.id;
  const { device_ids } = req.body; // Array of device IDs that should belong to this group

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Fetch all devices to process memberships
      const allDevicesRes = await transaction.request().query('SELECT id, group_ids FROM Devices');
      const allDevices = allDevicesRes.recordset;

      for (const device of allDevices) {
        let currentGroups = device.group_ids ? device.group_ids.split(',').filter(Boolean) : [];
        const shouldBeIn = device_ids.includes(device.id);
        const isIn = currentGroups.includes(groupId);

        let modified = false;
        if (shouldBeIn && !isIn) {
          currentGroups.push(groupId);
          modified = true;
        } else if (!shouldBeIn && isIn) {
          currentGroups = currentGroups.filter(id => id !== groupId);
          modified = true;
        }

        if (modified) {
          const newGroupIds = currentGroups.join(',');
          await transaction.request()
            .input('id', sql.NVarChar, device.id)
            .input('group_ids', sql.NVarChar, newGroupIds)
            .query('UPDATE Devices SET group_ids = @group_ids WHERE id = @id');
        }
      }

      await transaction.commit();
      res.json({ message: 'Group memberships updated successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
