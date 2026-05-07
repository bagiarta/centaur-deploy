
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

export const getDbConnection = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('device_id', sql.NVarChar, id)
      .query('SELECT * FROM DeviceDbConnections WHERE device_id = @device_id');

    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.json(null);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const saveDbConnection = async (req, res) => {
  const { id } = req.params;
  const { db_name, db_user, db_password } = req.body;

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('device_id', sql.NVarChar, id)
      .input('db_name', sql.NVarChar, db_name)
      .input('db_user', sql.NVarChar, db_user)
      .input('db_password', sql.NVarChar, db_password)
      .query(`
        IF EXISTS (SELECT 1 FROM DeviceDbConnections WHERE device_id = @device_id)
        BEGIN
          UPDATE DeviceDbConnections 
          SET db_name = @db_name, db_user = @db_user, db_password = @db_password, updated_at = GETDATE()
          WHERE device_id = @device_id
        END
        ELSE
        BEGIN
          INSERT INTO DeviceDbConnections (device_id, db_name, db_user, db_password)
          VALUES (@device_id, @db_name, @db_user, @db_password)
        END
      `);
    res.json({ message: 'Database connection settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getAllDevices = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Devices');

    // Parse the group_ids back into arrays and convert last_seen to local timezone
    const devices = result.recordset.map(row => {
      let lastSeenLocal = 'Never';
      if (row.last_seen) {
        try {
          const utcDate = new Date(row.last_seen);
          if (!isNaN(utcDate.getTime())) {
            lastSeenLocal = utcDate.toLocaleString('id-ID', {
              timeZone: process.env.TZ || 'Asia/Makassar',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
          } else {
            lastSeenLocal = row.last_seen;
          }
        } catch (e) {
          lastSeenLocal = row.last_seen;
        }
      }

      return {
        ...row,
        group_ids: row.group_ids ? row.group_ids.split(',').filter(Boolean) : [],
        last_seen: lastSeenLocal
      };
    });

    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createDevice = async (req, res) => {
  try {
    const { id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, group_ids, last_seen, device_type, location, latitude, longitude } = req.body;
    console.log(`[DEVICE_POST] id: ${id}, location: ${location}, lat: ${latitude}, lon: ${longitude}`);
    const pool = await poolPromise;
    const gids = Array.isArray(group_ids) ? group_ids.join(',') : '';

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version || '')
      .input('cpu', sql.NVarChar, cpu || '')
      .input('ram', sql.NVarChar, ram || '')
      .input('disk', sql.NVarChar, disk || '')
      .input('agent_version', sql.NVarChar, agent_version || '')
      .input('status', sql.NVarChar, status || 'online')
      .input('group_ids', sql.NVarChar, gids)
      .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
      .input('device_type', sql.NVarChar, device_type || 'PC')
      .input('location', sql.NVarChar, location)
      .input('latitude', sql.Float, latitude)
      .input('longitude', sql.Float, longitude)
      .query(`
        INSERT INTO Devices (id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, group_ids, last_seen, device_type, location, latitude, longitude)
        VALUES (@id, @hostname, @ip, @os_version, @cpu, @ram, @disk, @agent_version, @status, @group_ids, @last_seen, @device_type, @location, @latitude, @longitude)
      `);

    res.status(201).json({ message: 'Device created completely' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateDevice = async (req, res) => {
  try {
    const { hostname, ip, os_version, cpu, ram, disk, agent_version, status, group_ids, last_seen, device_type, location, latitude, longitude } = req.body;
    console.log(`[DEVICE_PUT] id: ${req.params.id}, location: ${location}, lat: ${latitude}, lon: ${longitude}`);
    const pool = await poolPromise;
    const gids = Array.isArray(group_ids) ? group_ids.join(',') : '';

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version || '')
      .input('cpu', sql.NVarChar, cpu || '')
      .input('ram', sql.NVarChar, ram || '')
      .input('disk', sql.NVarChar, disk || '')
      .input('agent_version', sql.NVarChar, agent_version || '')
      .input('status', sql.NVarChar, status || 'online')
      .input('group_ids', sql.NVarChar, gids)
      .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
      .input('device_type', sql.NVarChar, device_type || 'PC')
      .input('location', sql.NVarChar, location)
      .input('latitude', sql.Float, latitude)
      .input('longitude', sql.Float, longitude)
      .query(`
        UPDATE Devices SET 
          hostname = @hostname, ip = @ip, os_version = @os_version, 
          cpu = @cpu, ram = @ram, disk = @disk, agent_version = @agent_version, 
          status = @status, group_ids = @group_ids, last_seen = @last_seen, device_type = @device_type,
          location = @location, latitude = @latitude, longitude = @longitude
        WHERE id = @id
      `);

    res.status(200).json({ message: 'Device updated completely' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteDevice = async (req, res) => {
  try {
    const pool = await poolPromise;
    const deviceId = req.params.id;

    // Get hostname before deleting
    const devRes = await pool.request()
      .input('id', sql.NVarChar, deviceId)
      .query('SELECT hostname FROM Devices WHERE id = @id');

    const hostname = devRes.recordset[0]?.hostname;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input('id', sql.NVarChar, deviceId)
        .query('DELETE FROM DeploymentTargets WHERE device_id = @id');

      if (hostname) {
        await transaction.request()
          .input('hostname', sql.NVarChar, hostname)
          .query('DELETE FROM AgentInstallTargets WHERE hostname = @hostname');

        await transaction.request()
          .input('hostnamePattern', sql.NVarChar, '%' + hostname + '%')
          .query('DELETE FROM ActivityLog WHERE action LIKE @hostnamePattern');
      }

      await transaction.request()
        .input('id', sql.NVarChar, deviceId)
        .query('DELETE FROM Devices WHERE id = @id');

      await transaction.commit();
      res.json({ message: 'Device deleted successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const registerDevice = async (req, res) => {
  try {
    const { id, hostname, ip, os, status, last_seen } = req.body;
    const pool = await poolPromise;

    // Check if device already exists by hostname
    const existing = await pool.request()
      .input('hostname', sql.NVarChar, hostname)
      .query('SELECT * FROM Devices WHERE hostname = @hostname');

    if (existing.recordset.length > 0) {
      await pool.request()
        .input('hostname', sql.NVarChar, hostname)
        .input('ip', sql.NVarChar, ip || existing.recordset[0].ip)
        .input('os', sql.NVarChar, os || existing.recordset[0].os_version)
        .input('status', sql.NVarChar, status || 'online')
        .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
        .query(`
          UPDATE Devices SET ip = @ip, os_version = @os, status = @status, last_seen = @last_seen
          WHERE hostname = @hostname
        `);
    } else {
      await pool.request()
        .input('id', sql.NVarChar, id || `dev-${Date.now()}`)
        .input('hostname', sql.NVarChar, hostname)
        .input('ip', sql.NVarChar, ip || '')
        .input('os', sql.NVarChar, os || 'Windows')
        .input('status', sql.NVarChar, status || 'online')
        .input('last_seen', sql.NVarChar, last_seen || new Date().toISOString())
        .query(`
          INSERT INTO Devices (id, hostname, ip, os_version, status, last_seen)
          VALUES (@id, @hostname, @ip, @os, @status, @last_seen)
        `);
    }

    res.status(200).json({ message: 'Device registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
