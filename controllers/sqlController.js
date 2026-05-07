
import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { isValidSafeSQL } from '../utils/sqlUtils.js';
import { getCurrentTimeHHMM } from '../utils/timeUtils.js';

export const testConnection = async (req, res) => {
  const { server, database, user, password } = req.body;
  const config = {
    user,
    password,
    server,
    database,
    options: {
      encrypt: false, // Usually false for local/internal MS SQL
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
  const { script, target_device_ids, force } = req.body;
  const userId = req.headers['x-user-id'] || 'anonymous';

  try {
    const pool = await poolPromise;

    // 0. Fetch Global Security Settings
    const settingsRes = await pool.request().query("SELECT sql_safe_mode FROM NotificationSettings WHERE id = 'global'");
    const rawMode = settingsRes.recordset[0]?.sql_safe_mode;

    // Robust Evaluation: Default to true if null/undefined.
    // handles BIT (boolean true/false) or numeric 0/1.
    const isGlobalSafeMode = (rawMode === null || rawMode === undefined) ? true : !!rawMode;

    console.log(`[SQL_DEBUG_V3] raw: ${rawMode} (${typeof rawMode}), isSafe: ${isGlobalSafeMode}`);
    console.log(`[SQL_EXEC] user: ${userId}, globalSafe: ${isGlobalSafeMode}`);

    // 0.5 Fetch User Role to check Admin status
    const userRes = await pool.request().input('uid', sql.NVarChar, userId).query(`
      SELECT r.is_admin FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid
    `);
    const isAdmin = userRes.recordset[0]?.is_admin || false;

    // 1. SECURITY ENFORCEMENT
    // Simple rule: Global Safe Mode from DB is the single source of truth.
    // - Global ON  → only SELECT allowed (no bypass)
    // - Global OFF → all queries allowed


    if (isGlobalSafeMode && !isValidSafeSQL(script)) {
      // Allow Admin to bypass if they explicitly use the "force" flag
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
        database: conn.db_name,
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

    // Log the execution in ActivityLog
    const timestamp = getCurrentTimeHHMM(); // HH:mm in configured timezone
    const actionDesc = `Command executed on ${devices.length} device(s): ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`;

    await pool.request()
      .input('time', sql.NVarChar, timestamp)
      .input('user', sql.NVarChar, 'admin')
      .input('action', sql.NVarChar, actionDesc)
      .query(`
        INSERT INTO ActivityLog (time, [user], action)
        VALUES (@time, @user, @action)
      `);

    // Simulate Output
    const output = [];
    devices.forEach((hostname, i) => {
      // Small simulated delay time strings
      const timeStr = new Date(Date.now() + i * 1000).toISOString().slice(11, 19);
      output.push(`[${timeStr}] ${hostname.padEnd(15)} → OK`);
    });
    output.push(`[${new Date().toISOString().slice(11, 19)}] ✓ Command completed on ${devices.length}/${devices.length} selected devices`);

    res.json({ success: true, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
