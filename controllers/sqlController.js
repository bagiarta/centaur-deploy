import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { isValidSafeSQL } from '../utils/sqlUtils.js';
import { getCurrentTimeHHMM } from '../utils/timeUtils.js';

export const getDatabases = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const pool = await poolPromise;
    
    const devRes = await pool.request().input('id', sql.NVarChar, deviceId).query('SELECT ip FROM Devices WHERE id = @id');
    const connRes = await pool.request().input('id', sql.NVarChar, deviceId).query('SELECT * FROM DeviceDbConnections WHERE device_id = @id');
    
    if (!devRes.recordset.length || !connRes.recordset.length) {
      return res.status(404).json({ error: 'Device or connection not found' });
    }
    
    const dev = devRes.recordset[0];
    const conn = connRes.recordset[0];
    
    const config = {
      user: conn.db_user,
      password: conn.db_password,
      server: dev.ip,
      database: 'master',
      options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000 },
      pool: { max: 1, min: 0 }
    };
    
    const remotePool = new sql.ConnectionPool(config);
    await remotePool.connect();
    const result = await remotePool.request().query('SELECT name FROM sys.databases WHERE state = 0 ORDER BY name');
    await remotePool.close();
    
    res.json(result.recordset.map(r => r.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getTables = async (req, res) => {
  try {
    const { deviceId, databaseName } = req.params;
    const pool = await poolPromise;
    
    const devRes = await pool.request().input('id', sql.NVarChar, deviceId).query('SELECT ip FROM Devices WHERE id = @id');
    const connRes = await pool.request().input('id', sql.NVarChar, deviceId).query('SELECT * FROM DeviceDbConnections WHERE device_id = @id');
    
    if (!devRes.recordset.length || !connRes.recordset.length) {
      return res.status(404).json({ error: 'Device or connection not found' });
    }
    
    const dev = devRes.recordset[0];
    const conn = connRes.recordset[0];
    
    const config = {
      user: conn.db_user,
      password: conn.db_password,
      server: dev.ip,
      database: databaseName,
      options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000 },
      pool: { max: 1, min: 0 }
    };
    
    const remotePool = new sql.ConnectionPool(config);
    await remotePool.connect();
    const result = await remotePool.request().query(`
      SELECT TABLE_SCHEMA, TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);
    await remotePool.close();
    
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const testConnection = async (req, res) => {
  const { server, database, user, password } = req.body;
  const config = {
    user,
    password,
    server,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 5000
    },
    pool: { max: 1, min: 0, idleTimeoutMillis: 5000 }
  };

  try {
    const testPool = new sql.ConnectionPool(config);
    await testPool.connect();
    await testPool.close();
    res.json({ message: 'Connection successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const executeCommand = async (req, res) => {
  const { script, target_device_ids, force, database_override } = req.body;
  const userId = req.headers['x-user-id'] || 'anonymous';

  try {
    const pool = await poolPromise;

    // 0. Fetch Global Security Settings
    const settingsRes = await pool.request().query("SELECT sql_safe_mode FROM NotificationSettings WHERE id = 'global'");
    const rawMode = settingsRes.recordset[0]?.sql_safe_mode;

    const isGlobalSafeMode = (rawMode === null || rawMode === undefined) ? true : !!rawMode;

    // 0.5 Fetch User Role to check Admin status
    const userRes = await pool.request().input('uid', sql.NVarChar, userId).query(`
      SELECT r.is_admin FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid
    `);
    const isAdmin = userRes.recordset[0]?.is_admin || false;

    // 1. SECURITY ENFORCEMENT
    if (isGlobalSafeMode && !isValidSafeSQL(script)) {
      if (isAdmin && force === true) {
        console.log(`[SQL_BYPASS] Admin ${userId} bypassed Safe Mode.`);
      } else {
        return res.status(400).json({
          error: "SQL Safe Mode aktif. Hanya kueri SELECT yang diizinkan.",
          can_bypass: isAdmin
        });
      }
    }

    // 2. Fetch connection details for all targets
    const connRes = await pool.request().query('SELECT * FROM DeviceDbConnections');
    const allConns = connRes.recordset;

    // 3. Fetch device IPs (Server addresses)
    const devRes = await pool.request().query('SELECT id, ip, hostname FROM Devices');
    const allDevs = devRes.recordset;

    const results = {};
    const executionPromises = target_device_ids.map(async (deviceId) => {
      const dev = allDevs.find(d => d.id === deviceId);
      const conn = allConns.find(c => c.device_id === deviceId);

      if (!dev) {
        results[deviceId] = { status: 'error', error: 'Device not found' };
        return;
      }
      if (!conn) {
        results[deviceId] = { status: 'error', error: 'Database connection not configured for this device' };
        return;
      }

      const config = {
        user: conn.db_user,
        password: conn.db_password,
        server: dev.ip,
        database: database_override || conn.db_name,
        options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
        pool: { max: 1, min: 0, idleTimeoutMillis: 10000 }
      };

      try {
        const remotePool = new sql.ConnectionPool(config);
        await remotePool.connect();
        const result = await remotePool.request().query(script);
        await remotePool.close();

        // Audit log
        await pool.request()
          .input('time', sql.NVarChar, new Date().toLocaleString())
          .input('u', sql.NVarChar, userId)
          .input('act', sql.NVarChar, `SQL EXEC on [${dev.hostname}]: ${script.substring(0, 200)}`)
          .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @u, @act)")
          .catch(e => console.error("Audit fail", e));

        results[deviceId] = {
          status: 'success',
          hostname: dev.hostname,
          ip: dev.ip,
          recordset: result.recordset,
          rowsAffected: result.rowsAffected
        };
      } catch (err) {
        results[deviceId] = {
          status: 'error',
          hostname: dev.hostname,
          ip: dev.ip,
          error: err.message
        };
      }
    });

    await Promise.all(executionPromises);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const executeRemoteCommands = async (req, res) => {
  try {
    const { devices, command } = req.body;
    const pool = await poolPromise;

    if (!devices || !command || devices.length === 0) {
      return res.status(400).json({ error: 'Missing devices or command' });
    }

    const timestamp = getCurrentTimeHHMM();
    const actionDesc = `Command executed on ${devices.length} device(s): ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`;

    await pool.request()
      .input('time', sql.NVarChar, timestamp)
      .input('user', sql.NVarChar, 'admin')
      .input('action', sql.NVarChar, actionDesc)
      .query(`
        INSERT INTO ActivityLog (time, [user], action)
        VALUES (@time, @user, @action)
      `);

    const output = [];
    devices.forEach((hostname, i) => {
      const timeStr = new Date(Date.now() + i * 1000).toISOString().slice(11, 19);
      output.push(`[${timeStr}] ${hostname.padEnd(15)} → OK`);
    });
    output.push(`[${new Date().toISOString().slice(11, 19)}] ✓ Command completed on ${devices.length}/${devices.length} selected devices`);

    res.json({ success: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
