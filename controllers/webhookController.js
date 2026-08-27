import fs from 'fs';
import path from 'path';
import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { getCurrentTimestamp } from '../utils/timeUtils.js';

// ES Module dirname equivalent
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const testDevicePing = (req, res) => {
  const payload = req.body;

  // If MikroTik sends GET or raw body not parsed as json properly, try capturing query
  const finalPayload = Object.keys(payload).length === 0 ? req.query : payload;

  const logEntry = `[${getCurrentTimestamp()}] TRIAL WEBHOOK RECEIVED: ${JSON.stringify(finalPayload)}\n`;

  const logFile = path.join(__dirname, 'scratch', 'test_webhook_log.txt');
  if (!fs.existsSync(path.join(__dirname, 'scratch'))) {
    fs.mkdirSync(path.join(__dirname, 'scratch'));
  }

  fs.appendFileSync(logFile, logEntry);
  console.log('✅ Trial Webhook Data Received:', finalPayload);

  res.json({ success: true, message: 'Trial data received', data: finalPayload });
};

export const testResults = (req, res) => {
  const logFile = path.join(__dirname, 'scratch', 'test_webhook_log.txt');
  if (fs.existsSync(logFile)) {
    const data = fs.readFileSync(logFile, 'utf8');
    res.type('text/plain');
    res.send("=== HASIL UJI COBA MIKROTIK (AUTO-REFRESH) ===\n\n" + data);
  } else {
    res.send("Belum ada data uji coba yang masuk.");
  }
};

export const devicePing = async (req, res) => {
  console.log(`[DEBUG] Received Live Ping at ${new Date().toISOString()}`);
  console.log(`[DEBUG] Body:`, JSON.stringify(req.body));
  console.log(`[DEBUG] Query:`, JSON.stringify(req.query));

  const payload = Object.keys(req.body).length === 0 ? req.query : req.body;
  const { 
    hostname, 
    ports, 
    interfaces,
    date: mtDate, 
    time: mtTime,
    routeros_version,
    board,
    architecture,
    uptime,
    health,
    system
  } = payload;

  if (mtDate || mtTime) {
    console.log(`[DEBUG] Router Clock: ${mtDate} ${mtTime}`);
  }

  if (!hostname) {
    console.log(`[DEBUG] No hostname found in payload.`);
    return res.status(400).json({ error: 'hostname is required' });
  }

  console.log(`[DEBUG] Processing ping for hostname: "${hostname}"`);

  try {
    const pool = await poolPromise;
    console.log(`[DEBUG] DB Pool acquired for ${hostname}`);
    const nowObj = new Date();

    // Check if device exists
    const check = await pool.request()
      .input('hostname', sql.NVarChar, hostname)
      .query('SELECT id, status, network_ports, device_type FROM Devices WHERE hostname = @hostname');
    console.log(`[DEBUG] DB Check completed for ${hostname}. Found: ${check.recordset.length}`);

    const finalInterfaces = interfaces || ports;
    let portsJson = null;
    if (finalInterfaces) {
      portsJson = typeof finalInterfaces === 'string' ? finalInterfaces : JSON.stringify(finalInterfaces);
    }

    let cpu = null;
    let ram = null;
    let disk = null;
    let systemMetricsJson = null;
    
    const formatBytes = (bytes) => {
      if (bytes === 0 || bytes === '0' || !bytes) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    if (system) {
      cpu = (system.cpu_load !== undefined && system.cpu_load !== null) ? `${system.cpu_load}%` : null;
      ram = system.memory ? `${formatBytes(system.memory.used)} / ${formatBytes(system.memory.total)}` : null;
      disk = system.storage ? `${formatBytes(system.storage.used)} / ${formatBytes(system.storage.total)}` : null;
    }
    
    if (routeros_version || system || health) {
      systemMetricsJson = JSON.stringify({
        routeros_version,
        board,
        architecture,
        uptime,
        health,
        system
      });
    }

    if (check.recordset.length > 0) {
      // Update existing device
      const oldStatus = check.recordset[0].status;
      const isoNow = new Date().toISOString();
      await pool.request()
        .input('hostname', sql.NVarChar, hostname)
        .input('last_seen', sql.NVarChar, isoNow)
        .input('status', sql.NVarChar, 'online')
        .input('network_ports', sql.NVarChar(sql.MAX), portsJson)
        .input('os_version', sql.NVarChar, routeros_version || null)
        .input('cpu', sql.NVarChar, cpu)
        .input('ram', sql.NVarChar, ram)
        .input('disk', sql.NVarChar, disk)
        .input('system_metrics', sql.NVarChar(sql.MAX), systemMetricsJson)
        .query(`
          UPDATE Devices 
          SET 
            last_seen = @last_seen, 
            status = @status, 
            network_ports = ISNULL(@network_ports, network_ports),
            os_version = ISNULL(@os_version, os_version),
            cpu = ISNULL(@cpu, cpu),
            ram = ISNULL(@ram, ram),
            disk = ISNULL(@disk, disk),
            system_metrics = ISNULL(@system_metrics, system_metrics)
          WHERE hostname = @hostname
        `);

      if (oldStatus !== 'online') {
        console.log(`✅ Network Hook: Device ${hostname} is back online.`);
      }
    } else {
      // Create new network device if doesn't exist
      const deviceId = 'net-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
      console.log(`[DEBUG] Registering NEW device: ${hostname} with ID: ${deviceId}`);
      await pool.request()
        .input('id', sql.NVarChar, deviceId)
        .input('hostname', sql.NVarChar, hostname)
        .input('ip', sql.NVarChar, req.ip || '')
        .input('os_version', sql.NVarChar, routeros_version || 'Agentless (Webhook)')
        .input('status', sql.NVarChar, 'online')
        .input('last_seen', sql.NVarChar, new Date().toISOString())
        .input('device_type', sql.NVarChar, 'Network')
        .input('network_ports', sql.NVarChar(sql.MAX), portsJson)
        .input('cpu', sql.NVarChar, cpu)
        .input('ram', sql.NVarChar, ram)
        .input('disk', sql.NVarChar, disk)
        .input('system_metrics', sql.NVarChar(sql.MAX), systemMetricsJson)
        .query(`
          INSERT INTO Devices (
            id, hostname, ip, os_version, status, last_seen, device_type, network_ports, cpu, ram, disk, system_metrics
          )
          VALUES (
            @id, @hostname, @ip, @os_version, @status, @last_seen, @device_type, @network_ports, @cpu, @ram, @disk, @system_metrics
          )
        `);
      
      // Auto-generate Asset Code and Register to AM_Assets
      const assetCode = 'AST-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
      const assetName = hostname || ('Device ' + req.ip);
      try {
        await pool.request()
          .input('asset_code', sql.NVarChar, assetCode)
          .input('asset_name', sql.NVarChar, assetName)
          .input('category_code', sql.NVarChar, 'CAT-NET')
          .input('status', sql.NVarChar, 'IN_USE')
          .input('condition', sql.NVarChar, 'GOOD')
          .input('location_code', sql.NVarChar, 'HQ') // Default location
          .query(`
            INSERT INTO AM_Assets (asset_code, asset_name, category_code, status, condition, location_code)
            VALUES (@asset_code, @asset_name, @category_code, @status, @condition, @location_code)
          `);
        
        await pool.request()
          .input('asset_code', sql.NVarChar, assetCode)
          .input('id', sql.NVarChar, deviceId)
          .query(`UPDATE Devices SET asset_code = @asset_code WHERE id = @id`);
      } catch (e) {
        console.error('Failed to auto-register asset for webhook device:', e);
      }

      console.log(`✅ Network Hook: Registered new device ${hostname}`);
    }

    res.json({ success: true, message: 'Device status updated' });
  } catch (err) {
    console.error('❌ Webhook processing error:', err);
    res.status(500).json({ error: 'Failed to process webhook', detail: err.message });
  }
};

export const ssoUserSync = async (req, res) => {
  console.log(`[DEBUG] Received SSO User Sync Webhook at ${new Date().toISOString()}`);
  console.log(`[DEBUG] Body:`, JSON.stringify(req.body));
  
  const { username, first_name, last_name, email, roles } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'username is required' });
  }
  
  try {
    const pool = await poolPromise;
    // roles is an array of strings e.g. ["IT OPERATIONAL", "Manager"]
    if (!roles || roles.length === 0) {
      return res.json({ success: true, message: 'No roles provided, skipped.' });
    }
    
    // Find matching role in Centaur
    let matchedRoleId = null;
    let matchedRoleName = null;
    for (const roleName of roles) {
      const roleCheck = await pool.request()
        .input('role_name', sql.NVarChar, roleName)
        .query('SELECT id, name FROM Roles WHERE name = @role_name');
      if (roleCheck.recordset.length > 0) {
        matchedRoleId = roleCheck.recordset[0].id;
        matchedRoleName = roleCheck.recordset[0].name;
        break; // Map to first matching role found
      }
    }
    
    if (!matchedRoleId) {
      return res.json({ success: true, message: 'No matching role found in Centaur, skipped.' });
    }
    
    // Check if user already exists
    const userCheck = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT id FROM Users WHERE username = @username');
      
    if (userCheck.recordset.length > 0) {
      // Update existing user's role
      await pool.request()
        .input('username', sql.NVarChar, username)
        .input('role_id', sql.NVarChar, matchedRoleId)
        .query('UPDATE Users SET role_id = @role_id WHERE username = @username');
      console.log(`[DEBUG] SSO User Sync: Updated existing user ${username} to role ${matchedRoleName}`);
    } else {
      // Create new user
      const newId = 'user_sso_' + Date.now();
      const fullName = (first_name && last_name) ? `${first_name} ${last_name}` : (first_name || username);
      await pool.request()
        .input('id', sql.NVarChar, newId)
        .input('username', sql.NVarChar, username)
        .input('full_name', sql.NVarChar, fullName)
        .input('role_id', sql.NVarChar, matchedRoleId)
        .input('password_hash', sql.NVarChar, 'SSO_AUTHENTICATED')
        .query(`
          INSERT INTO Users (id, username, full_name, role_id, password_hash, created_at, division)
          VALUES (@id, @username, @full_name, @role_id, @password_hash, GETDATE(), 'SSO_SYNC')
        `);
      console.log(`[DEBUG] SSO User Sync: Created new user ${username} with role ${matchedRoleName}`);
    }
    
    res.json({ success: true, message: `Synced user ${username} with role ${matchedRoleName}` });
  } catch (err) {
    console.error('❌ SSO Sync processing error:', err);
    res.status(500).json({ error: 'Failed to process SSO sync', detail: err.message });
  }
};