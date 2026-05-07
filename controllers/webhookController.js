
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
  const { hostname, ports, date: mtDate, time: mtTime } = payload;

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

    let portsJson = null;
    if (ports) {
      portsJson = typeof ports === 'string' ? ports : JSON.stringify(ports);
    }

    if (check.recordset.length > 0) {
      // Update existing device
      const oldStatus = check.recordset[0].status;
      const isoNow = new Date().toISOString();
      await pool.request()
        .input('hostname', sql.NVarChar, hostname)
        .input('last_seen', sql.NVarChar, isoNow)
        .input('status', sql.NVarChar, 'online')
        .input('network_ports', sql.NVarChar, portsJson)
        .query(`
          UPDATE Devices 
          SET last_seen = @last_seen, status = @status, network_ports = ISNULL(@network_ports, network_ports)
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
        .input('os_version', sql.NVarChar, 'Agentless (Webhook)')
        .input('status', sql.NVarChar, 'online')
        .input('last_seen', sql.NVarChar, new Date().toISOString())
        .input('device_type', sql.NVarChar, 'Network')
        .input('network_ports', sql.NVarChar, portsJson)
        .query(`
          INSERT INTO Devices (id, hostname, ip, os_version, status, last_seen, device_type, network_ports)
          VALUES (@id, @hostname, @ip, @os_version, @status, @last_seen, @device_type, @network_ports)
        `);
      console.log(`✅ Network Hook: Registered new device ${hostname}`);
    }

    res.json({ success: true, message: 'Device status updated' });
  } catch (err) {
    console.error('❌ Webhook processing error:', err);
    res.status(500).json({ error: 'Failed to process webhook', detail: err.message });
  }
};
