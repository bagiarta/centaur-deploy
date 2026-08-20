
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sql from 'mssql';
import { exec } from 'child_process';
import util from 'util';
import https from 'https';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import mammoth from 'mammoth';
import PDFDocument from 'pdfkit';
import cron from 'node-cron';
import ExcelJS from 'exceljs';
import { createRequire } from 'module';
import crypto from 'crypto';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const { runSync: runAbcSync } = require('../scripts/sync_abc_analysis.cjs');
const { runSync: runHoServerDimItemSync } = require('../scripts/sync_hoserver_dim_item.cjs');
const { runSync: runItemSalesSync } = require('../scripts/sync_dev_item_sales_member.cjs');

import { poolPromise, dbConfig, initDb } from '../config/db.js';
import { h2hConfig, getH2hToken } from '../config/h2h.js';
import { getCurrentTimestamp, getCurrentTimeHHMM, getISOTimestamp } from '../utils/timeUtils.js';

let devEtlLogs = [];
let devEtlRunning = false;

// Recreate some missing utility constants/functions from server.cjs
const execPromise = (cmd, options = {}) => {
  return new Promise((resolve, reject) => {
    exec(cmd, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
};

const workflowStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/workflows/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const workflowUpload = multer({ storage: workflowStorage });

const installerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/installers/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const installerUpload = multer({ storage: installerStorage });

// CRM Pool recreated
let crmPoolPromise = null;

async function getCrmPool() {
  if (crmPoolPromise) return crmPoolPromise;
  try {
    const pool = await poolPromise;
    const deviceRes = await pool.request()
      .input('name', sql.NVarChar, 'DBWH SERVER')
      .input('ip', sql.NVarChar, '192.168.85.55')
      .query(`
        SELECT TOP 1 d.*, c.db_user, c.db_password, c.db_name 
        FROM Devices d
        LEFT JOIN DeviceDbConnections c ON d.id = c.device_id
        WHERE d.hostname = @name OR d.ip = @ip
      `);

    const device = deviceRes.recordset[0];
    let config;

    if (device && device.db_user && device.db_password) {
      config = {
        user: device.db_user,
        password: device.db_password,
        server: device.ip,
        database: device.db_name,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 15000, requestTimeout: 60000
      };
    } else {
      config = {
        user: process.env.CRM_DB_USER || 'sa',
        password: process.env.CRM_DB_PASS || 'default_pass',
        server: process.env.CRM_DB_SERVER || '192.168.85.55',
        database: process.env.CRM_DB_NAME || 'DBWH_8555',
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 15000, requestTimeout: 60000
      };
    }

    const crmPool = new sql.ConnectionPool(config);
    crmPoolPromise = crmPool.connect();
    return crmPoolPromise;
  } catch (err) {
    console.error('âŒ Failed to initialize CRM Pool:', err.message);
    crmPoolPromise = null;
    throw err;
  }
}

// Ensure __dirname is available for file uploads
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.resolve(path.dirname(__filename), '..');
const REPO_PATH = path.resolve('F:\\PepiUpdater\\Repo');
const packageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REPO_PATH),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const packageUpload = multer({ storage: packageStorage });

const router = express.Router();

router.get('/api/deployments', async (req, res) => {
  try {
    console.log('GET /api/deployments called');
    const pool = await poolPromise;
    console.log('Pool obtained');
    const result = await pool.request().query('SELECT * FROM Deployments');
    console.log('Query executed, records:', result.recordset.length);
    res.json(result.recordset);
  } catch (err) {
    console.error('Error in /api/deployments:', err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/deployment-targets \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/deployment-targets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT t.* 
      FROM DeploymentTargets t
      INNER JOIN Devices d ON t.device_id = d.id
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to expand IP ranges (e.g. "192.168.1.1-50" or "192.168.1.1 - 192.168.1.50")
function parseIPRange(input) {
  if (!input) return [];
  const allIps = [];
  const normalized = input.replace(/[â€“â€”]/g, '-').replace(/\s*-\s*/g, '-');
  const parts = normalized.split(/[,;\s]+/).filter(Boolean);
  for (const part of parts) {
    let m = part.match(/^(\d+\.\d+\.\d+\.\d+)-(\d+\.\d+\.\d+\.\d+)$/);
    if (m) {
      const start = m[1].split('.').map(Number);
      const end = m[2].split('.').map(Number);
      if (start[0] === end[0] && start[1] === end[1] && start[2] === end[2]) {
        for (let j = Math.min(start[3], end[3]); j <= Math.max(start[3], end[3]); j++) {
          allIps.push(`${start[0]}.${start[1]}.${start[2]}.${j}`);
        }
      }
      continue;
    }
    m = part.match(/^(\d+\.\d+\.\d+)\.(\d+)-(\d+)$/);
    if (m) {
      const base = m[1];
      const start = parseInt(m[2]);
      const end = parseInt(m[3]);
      for (let j = Math.min(start, end); j <= Math.max(start, end); j++) {
        allIps.push(`${base}.${j}`);
      }
      continue;
    }
    if (part.match(/^(\d{1,3}\.){3}\d{1,3}$/)) {
      allIps.push(part);
    }
  }
  return [...new Set(allIps)];
}

// \u2500€\u2500€ GET /api/agent-jobs \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/agent-jobs', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM AgentJobs ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/agent-jobs \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/agent-jobs', async (req, res) => {
  try {
    const { id, ip_range, created_by, username, password, device_targets } = req.body;
    const pool = await poolPromise;

    let serverUrl = `${req.protocol}://${req.get('host')}`;
    serverUrl = serverUrl.replace(':3002', ':3001').replace('https://', 'http://');
    if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) serverUrl = "http://192.168.85.30:3001";
    const psScript = path.resolve(__dirname, 'scripts', 'push_agent.ps1');
    const installerPath = path.resolve(__dirname, 'public', 'Manual-Agent-Installer-v25.ps1');

    // \u2500€\u2500€ MODE A: device_targets (per-device, from device list) \u2500€\u2500€
    if (device_targets && Array.isArray(device_targets) && device_targets.length > 0) {
      const total = device_targets.length;

      await pool.request()
        .input('id', sql.NVarChar, id)
        .input('created_at', sql.NVarChar, new Date().toISOString())
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .input('ip_range', sql.NVarChar(sql.MAX), ip_range || device_targets.map(d => d.hostname).join(', ').substring(0, 500))
        .input('total', sql.Int, total)
        .query(`INSERT INTO AgentJobs (id, created_at, created_by, ip_range, total, success_count, failed_count, pending_count) VALUES (@id, @created_at, @created_by, @ip_range, @total, 0, 0, @total)`);

      res.status(201).json({ message: 'Job started', total_targets: total });

      // Background sequential execution per device
      (async () => {
        for (const target of device_targets) {
          const tIp = target.ip || '0.0.0.0';
          const tHost = target.hostname || `UNKNOWN-${tIp.split('.').pop()}`;
          const tUser = target.username || username || 'Administrator';
          const tPass = target.password || password || '';

          try {
            await pool.request()
              .input('job_id', sql.NVarChar, id)
              .input('device_ip', sql.NVarChar, tIp)
              .input('hostname', sql.NVarChar, tHost)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM AgentInstallTargets WHERE job_id=@job_id AND device_ip=@device_ip)
                  INSERT INTO AgentInstallTargets (job_id, device_ip, hostname, status, log, updated_at)
                  VALUES (@job_id, @device_ip, @hostname, 'running', 'Starting...', LEFT(CONVERT(VARCHAR, GETDATE(), 108), 5))
              `);
          } catch (e) { /* ignore */ }

          let statusResult = 'failed';
          let logMsg = '';
          try {
            const cmd = `powershell.exe -ExecutionPolicy Bypass -File "${psScript}" -TargetIP "${tIp}" -Username "${tUser}" -Password "${tPass}" -InstallerPath "${installerPath}" -ServerUrl "${serverUrl}"`;
            const { stdout, stderr } = await execPromise(cmd, { timeout: 60000 }).catch(e => ({ stdout: '', stderr: e.message }));
            logMsg = (stdout + '\n' + stderr).trim();
            if (stdout.includes('STATUS:SUCCESS')) {
              statusResult = 'success';
              logMsg = stdout.split('|LOG:')[1]?.trim() || 'Success';
            } else {
              logMsg = stdout.split('|LOG:')[1]?.trim() || logMsg.substring(0, 500) || 'Timeout or error';
            }
          } catch (err) {
            logMsg = err.message || 'Execution error';
          }

          await pool.request()
            .input('job_id', sql.NVarChar, id).input('ip', sql.NVarChar, tIp)
            .input('status', sql.NVarChar, statusResult).input('log', sql.NVarChar, logMsg.substring(0, 500))
            .query(`UPDATE AgentInstallTargets SET status=@status, log=@log, updated_at=LEFT(CONVERT(VARCHAR,GETDATE(),108),5) WHERE job_id=@job_id AND device_ip=@ip`);

          await pool.request()
            .input('id', sql.NVarChar, id)
            .input('s', sql.Int, statusResult === 'success' ? 1 : 0)
            .input('f', sql.Int, statusResult === 'failed' ? 1 : 0)
            .query(`UPDATE AgentJobs SET success_count=success_count+@s, failed_count=failed_count+@f, pending_count=pending_count-1 WHERE id=@id`);
        }
      })();
      return;
    }

    // \u2500€\u2500€ MODE B: IP Range (legacy) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
    const ips = parseIPRange(ip_range);
    const total = ips.length;
    if (total === 0) return res.status(400).json({ error: "No valid IPs found." });

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('created_at', sql.NVarChar, new Date().toISOString())
      .input('created_by', sql.NVarChar, created_by || 'admin')
      .input('ip_range', sql.NVarChar, ip_range)
      .input('total', sql.Int, total)
      .query(`INSERT INTO AgentJobs (id, created_at, created_by, ip_range, total, success_count, failed_count, pending_count) VALUES (@id, @created_at, @created_by, @ip_range, @total, 0, 0, @total)`);

    res.status(201).json({ message: 'Job started', total_targets: total });

    (async () => {
      let currentIdx = 0;
      const worker = async () => {
        while (currentIdx < total) {
          const ip = ips[currentIdx++];
          if (!ip) break;
          try {
            await pool.request()
              .input('job_id', sql.NVarChar, id)
              .input('device_ip', sql.NVarChar, ip)
              .input('hostname', sql.NVarChar, `UNKNOWN-${ip.split('.')[3]}`)
              .input('status', sql.NVarChar, 'running')
              .query(`INSERT INTO AgentInstallTargets (job_id, device_ip, hostname, status, log, updated_at) VALUES (@job_id, @device_ip, @hostname, @status, 'Starting...', LEFT(CONVERT(VARCHAR, GETDATE(), 108), 5))`);

            const command = `powershell.exe -ExecutionPolicy Bypass -File "${psScript}" -TargetIP "${ip}" -Username "${username}" -Password "${password}" -InstallerPath "${installerPath}" -ServerUrl "${serverUrl}"`;
            const { stdout, stderr } = await execPromise(command, { timeout: 45000 }).catch(e => ({ stdout: '', stderr: e.message }));
            let statusResult = 'failed';
            let logMsg = (stdout + "\n" + stderr).trim();
            if (stdout.includes('STATUS:SUCCESS')) {
              statusResult = 'success';
              logMsg = stdout.split('|LOG:')[1]?.trim() || 'Success';
            } else {
              logMsg = stdout.split('|LOG:')[1]?.trim() || logMsg.substring(0, 500) || 'Timeout';
            }

            await pool.request()
              .input('job_id', sql.NVarChar, id).input('ip', sql.NVarChar, ip)
              .input('status', sql.NVarChar, statusResult).input('log', sql.NVarChar, logMsg.substring(0, 500))
              .query(`UPDATE AgentInstallTargets SET status=@status, log=@log, updated_at=LEFT(CONVERT(VARCHAR,GETDATE(),108),5) WHERE job_id=@job_id AND device_ip=@ip`);

            await pool.request()
              .input('id', sql.NVarChar, id)
              .input('s', sql.Int, statusResult === 'success' ? 1 : 0)
              .input('f', sql.Int, statusResult === 'failed' ? 1 : 0)
              .query(`UPDATE AgentJobs SET success_count=success_count+@s, failed_count=failed_count+@f, pending_count=pending_count-1 WHERE id=@id`);
          } catch (err) {
            console.error(`Worker error for ${ip}:`, err.message);
          }
        }
      };
      const workers = Array(Math.min(8, total)).fill(null).map(() => worker());
      await Promise.all(workers);
    })();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/agent-jobs/retry \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/agent-jobs/retry', async (req, res) => {
  const { job_id, device_ip, username, password } = req.body;
  console.log(`[AGENT] Retry requested for Job: ${job_id}, IP: ${device_ip}, User: ${username}`);

  if (!job_id || !device_ip) return res.status(400).json({ error: "Missing job_id or device_ip" });

  try {
    const pool = await poolPromise;

    // 1. Get job and target info
    const jobRes = await pool.request().input('id', sql.NVarChar, job_id).query("SELECT * FROM AgentJobs WHERE id = @id");
    const tarRes = await pool.request()
      .input('jid', sql.NVarChar, job_id)
      .input('ip', sql.NVarChar, device_ip)
      .query("SELECT * FROM AgentInstallTargets WHERE job_id = @jid AND device_ip = @ip");

    const job = jobRes.recordset[0];
    const target = tarRes.recordset[0];

    if (!job) {
      console.warn(`[AGENT] Retry failed: Job ${job_id} not found.`);
      return res.status(404).json({ error: `Job ${job_id} not found.` });
    }
    if (!target) {
      console.warn(`[AGENT] Retry failed: Target ${device_ip} not found in job ${job_id}.`);
      return res.status(404).json({ error: `Target ${device_ip} not found in this job.` });
    }

    // 2. Set target back to running
    await pool.request()
      .input('jid', sql.NVarChar, job_id)
      .input('ip', sql.NVarChar, device_ip)
      .query("UPDATE AgentInstallTargets SET status = 'running', log = 'Retrying...', updated_at = LEFT(CONVERT(VARCHAR, GETDATE(), 108), 5) WHERE job_id = @jid AND device_ip = @ip");

    // 3. Adjust counts
    if (target.status === 'success') {
      await pool.request().input('id', sql.NVarChar, job_id).query("UPDATE AgentJobs SET success_count = success_count - 1, pending_count = pending_count + 1 WHERE id = @id");
    } else if (target.status === 'failed') {
      await pool.request().input('id', sql.NVarChar, job_id).query("UPDATE AgentJobs SET failed_count = failed_count - 1, pending_count = pending_count + 1 WHERE id = @id");
    }

    res.json({ success: true, message: "Retry initiated" });

    // 4. Run installation in background (reusing the logic from POST /api/agent-jobs)
    (async () => {
      const psScript = path.resolve(__dirname, 'scripts', 'push_agent.ps1');
      const installerPath = path.resolve(__dirname, 'public', 'Manual-Agent-Installer-v25.ps1');
      let serverUrl = `${req.protocol}://${req.get('host')}`;
      serverUrl = serverUrl.replace(':3002', ':3001').replace('https://', 'http://');
      if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) serverUrl = "http://192.168.85.30:3001";

      let statusResult = 'failed';
      let logMsg = '';
      try {
        // Using default credentials from job if available or relying on script defaults
        // Note: we don't store passwords, so we might need them passed in or use fallback
        // Using provided credentials
        const cmd = `powershell.exe -ExecutionPolicy Bypass -File "${psScript}" -TargetIP "${device_ip}" -Username "${username || 'Administrator'}" -Password "${password || ''}" -InstallerPath "${installerPath}" -ServerUrl "${serverUrl}"`;
        const { stdout, stderr } = await execPromise(cmd, { timeout: 60000 }).catch(e => ({ stdout: '', stderr: e.message }));

        logMsg = (stdout + '\n' + stderr).trim();
        if (stdout.includes('STATUS:SUCCESS')) {
          statusResult = 'success';
          logMsg = stdout.split('|LOG:')[1]?.trim() || 'Success';
        } else {
          logMsg = stdout.split('|LOG:')[1]?.trim() || logMsg.substring(0, 500) || 'Retry failed';
        }
      } catch (err) {
        logMsg = err.message || 'Execution error during retry';
      }

      await pool.request()
        .input('job_id', sql.NVarChar, job_id).input('ip', sql.NVarChar, device_ip)
        .input('status', sql.NVarChar, statusResult).input('log', sql.NVarChar, logMsg.substring(0, 500))
        .query(`UPDATE AgentInstallTargets SET status=@status, log=@log, updated_at=LEFT(CONVERT(VARCHAR,GETDATE(),108),5) WHERE job_id=@job_id AND device_ip=@ip`);

      await pool.request()
        .input('id', sql.NVarChar, job_id)
        .input('s', sql.Int, statusResult === 'success' ? 1 : 0)
        .input('f', sql.Int, statusResult === 'failed' ? 1 : 0)
        .query(`UPDATE AgentJobs SET success_count=success_count+@s, failed_count=failed_count+@f, pending_count=pending_count-1 WHERE id=@id`);
    })();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ DELETE /api/agent-jobs/:id \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.delete('/api/agent-jobs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, id).query(`
      DELETE FROM AgentInstallTargets WHERE job_id = @id;
      DELETE FROM AgentJobs WHERE id = @id;
    `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/agent-install-targets \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/agent-install-targets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT t.* 
      FROM AgentInstallTargets t
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/activity-log \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/activity-log', async (req, res) => {
  try {
    const pool = await poolPromise;
    const requestUser = await getRequestUser(req, pool);
    if (!requestUser) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const logs = await fetchActivityLogs(pool, requestUser, { date: req.query.date });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/activity-log/export', async (req, res) => {
  try {
    const pool = await poolPromise;
    const requestUser = await getRequestUser(req, pool);
    if (!requestUser) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const dateFilter = normalizeDateFilter(req.query.date);
    const logs = await fetchActivityLogs(pool, requestUser, { date: dateFilter });
    const headers = ['Time', 'Level', 'User', 'Action', 'Created At'];
    const rows = logs.map((entry) => [
      entry.time,
      entry.level,
      entry.user,
      entry.action,
      entry.created_at instanceof Date ? entry.created_at.toISOString() : entry.created_at,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\r\n');

    const scopeLabel = requestUser.is_admin ? 'all-users' : requestUser.username;
    const dateLabel = dateFilter || 'all-dates';
    const filename = `activity-log-${scopeLabel}-${dateLabel}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\uFEFF${csv}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/packages \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/packages', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Packages');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/packages/download/:filename \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/packages/download/:filename', async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(REPO_PATH, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found in repository' });
  }
});

// \u2500€\u2500€ DELETE /api/packages/:id \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.delete('/api/packages/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query('DELETE FROM Packages WHERE id = @id');
    res.json({ message: 'Package deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ DELETE /api/deployments/:id \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.delete('/api/deployments/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input('id', sql.NVarChar, req.params.id)
        .query('DELETE FROM DeploymentTargets WHERE deployment_id = @id');

      await transaction.request()
        .input('id', sql.NVarChar, req.params.id)
        .query('DELETE FROM Deployments WHERE id = @id');

      await transaction.commit();
      res.json({ message: 'Deployment deleted successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/packages \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/packages', packageUpload.single('file'), async (req, res) => {
  try {
    const { id, name, version, type, uploaded_by } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileName = file.originalname;
    const fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('version', sql.NVarChar, version || '')
      .input('checksum', sql.NVarChar, 'sha256:temp')
      .input('file_path', sql.NVarChar, fileName)
      .input('size', sql.NVarChar, fileSize)
      .input('type', sql.NVarChar, type || path.extname(fileName).replace('.', ''))
      .input('uploaded_at', sql.NVarChar, new Date().toISOString())
      .input('uploaded_by', sql.NVarChar, uploaded_by || 'admin')
      .query(`
        INSERT INTO Packages (id, name, version, checksum, file_path, size, type, uploaded_at, uploaded_by)
        VALUES (@id, @name, @version, @checksum, @file_path, @size, @type, @uploaded_at, @uploaded_by)
      `);

    res.json({ success: true, id, file_path: fileName });
  } catch (err) {
    console.error('Package upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/deployments \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/deployments', async (req, res) => {
  try {
    const {
      id, package_id, package_name, package_version,
      target_path, schedule_time, created_by, created_at,
      status, targets
    } = req.body;

    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Insert Deployment
      await transaction.request()
        .input('id', sql.NVarChar, id)
        .input('package_id', sql.NVarChar, package_id)
        .input('package_name', sql.NVarChar, package_name)
        .input('package_version', sql.NVarChar, package_version)
        .input('target_path', sql.NVarChar, target_path)
        .input('schedule_time', sql.NVarChar, schedule_time || null)
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .input('created_at', sql.NVarChar, created_at || new Date().toISOString())
        .input('status', sql.NVarChar, status || 'pending')
        .input('total_targets', sql.Int, targets ? targets.length : 0)
        .input('success_count', sql.Int, 0)
        .input('failed_count', sql.Int, 0)
        .input('pending_count', sql.Int, targets ? targets.length : 0)
        .query(`
          INSERT INTO Deployments 
          (id, package_id, package_name, package_version, target_path, schedule_time, created_by, created_at, status, total_targets, success_count, failed_count, pending_count)
          VALUES 
          (@id, @package_id, @package_name, @package_version, @target_path, @schedule_time, @created_by, @created_at, @status, @total_targets, @success_count, @failed_count, @pending_count)
        `);

      // 2. Insert Deployment Targets
      if (targets && targets.length > 0) {
        for (const t of targets) {
          await transaction.request()
            .input('deployment_id', sql.NVarChar, id)
            .input('device_id', sql.NVarChar, t.device_id)
            .input('hostname', sql.NVarChar, t.hostname)
            .input('ip', sql.NVarChar, t.ip)
            .input('status', sql.NVarChar, 'pending')
            .input('log', sql.NVarChar, 'Waiting for agent...')
            .input('updated_at', sql.NVarChar, new Date().toISOString())
            .input('progress', sql.Int, 0)
            .query(`
              INSERT INTO DeploymentTargets 
              (deployment_id, device_id, hostname, ip, status, log, updated_at, progress)
              VALUES 
              (@deployment_id, @device_id, @hostname, @ip, @status, @log, @updated_at, @progress)
            `);
        }
      }

      await transaction.commit();
      res.status(201).json({ message: 'Deployment created successfully', deployment: req.body });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/deployments/:id/targets \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/deployments/:id/targets', async (req, res) => {
  const { id } = req.params;
  const { targets } = req.body;

  if (!targets || !Array.isArray(targets) || targets.length === 0) {
    return res.status(400).json({ error: "No targets provided" });
  }

  try {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Insert New Targets
      for (const t of targets) {
        // Check if device already exists for this deployment to avoid duplicates
        const check = await transaction.request()
          .input('deployment_id', sql.NVarChar, id)
          .input('device_id', sql.NVarChar, t.device_id)
          .query('SELECT 1 FROM DeploymentTargets WHERE deployment_id = @deployment_id AND device_id = @device_id');

        if (check.recordset.length > 0) continue;

        await transaction.request()
          .input('deployment_id', sql.NVarChar, id)
          .input('device_id', sql.NVarChar, t.device_id)
          .input('hostname', sql.NVarChar, t.hostname)
          .input('ip', sql.NVarChar, t.ip)
          .input('status', sql.NVarChar, 'pending')
          .input('log', sql.NVarChar, 'Waiting for agent...')
          .input('updated_at', sql.NVarChar, new Date().toISOString())
          .input('progress', sql.Int, 0)
          .query(`
            INSERT INTO DeploymentTargets 
            (deployment_id, device_id, hostname, ip, status, log, updated_at, progress)
            VALUES 
            (@deployment_id, @device_id, @hostname, @ip, @status, @log, @updated_at, @progress)
          `);
      }

      // 2. Update Deployment Counts
      await transaction.request()
        .input('id', sql.NVarChar, id)
        .input('new_count', sql.Int, targets.length)
        .query(`
          UPDATE Deployments 
          SET total_targets = total_targets + @new_count,
              pending_count = pending_count + @new_count,
              status = 'running' -- Force status back to running if it was success/failed
          WHERE id = @id
        `);

      await transaction.commit();
      res.json({ success: true, message: 'Targets added successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Add targets error:', err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ DELETE /api/deployments/:deploymentId/targets/:deviceId \u2500€\u2500€
router.delete('/api/deployments/:deploymentId/targets/:deviceId', async (req, res) => {
  const { deploymentId, deviceId } = req.params;
  try {
    const pool = await poolPromise;

    // 1. Delete the target
    const delResult = await pool.request()
      .input('deployment_id', sql.NVarChar, deploymentId)
      .input('device_id', sql.NVarChar, deviceId)
      .query('DELETE FROM DeploymentTargets WHERE deployment_id = @deployment_id AND device_id = @device_id');

    if (delResult.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Target not found' });
    }

    // 2. Recalculate deployment counts
    const statsResult = await pool.request()
      .input('dep_id', sql.NVarChar, deploymentId)
      .query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status NOT IN ('success', 'failed') THEN 1 ELSE 0 END) as pending
        FROM DeploymentTargets
        WHERE deployment_id = @dep_id
      `);

    const stats = statsResult.recordset[0];
    const overallStatus = stats.total === 0
      ? 'success'
      : stats.pending === 0
        ? (stats.failed > 0 ? 'failed' : 'success')
        : 'running';

    await pool.request()
      .input('dep_id', sql.NVarChar, deploymentId)
      .input('total', sql.Int, stats.total)
      .input('success', sql.Int, stats.success)
      .input('failed', sql.Int, stats.failed)
      .input('pending', sql.Int, stats.pending)
      .input('status', sql.NVarChar, overallStatus)
      .query(`
        UPDATE Deployments 
        SET total_targets = @total, success_count = @success, failed_count = @failed, pending_count = @pending, status = @status
        WHERE id = @dep_id
      `);

    res.json({ success: true, message: 'Target removed successfully' });
  } catch (err) {
    console.error('Delete target error:', err);
    res.status(500).json({ error: err.message });
  }
});




// \u2500€\u2500€ POST /api/agent/heartbeat \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/agent/heartbeat', async (req, res) => {
  const hostname = req.body?.hostname || 'unknown';
  try {
    const { ip, cpu, ram, disk, agent_version, os_version, disk_status, bad_sectors, disk_temp, psu_status } = req.body;
    if (!hostname || hostname === 'unknown') {
      return res.status(400).json({ error: "Hostname is required" });
    }

    const pool = await poolPromise;
    const now = new Date().toISOString();

    // Deterministic ID based on hostname to avoid collisions
    const safeId = `dev-${hostname.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    console.log(`[AGENT_HEARTBEAT] Received from ${hostname} | IP: ${ip} | CPU: ${cpu} | RAM: ${ram} | DISK: ${disk}`);

    // Atomic MERGE for registration and updates (removed HOLDLOCK to prevent deadlock)
    const result = await pool.request()
      .input('id', sql.NVarChar, safeId)
      .input('h', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip || '0.0.0.0')
      .input('cpu', sql.NVarChar, cpu || 'N/A')
      .input('ram', sql.NVarChar, ram || 'N/A')
      .input('disk', sql.NVarChar, disk || 'N/A')
      .input('ver', sql.NVarChar, agent_version || '2.5.0')
      .input('os', sql.NVarChar, os_version || 'Windows')
      .input('seen', sql.NVarChar, now)
      .input('disk_status', sql.NVarChar, disk_status || 'Healthy')
      .input('bad_sectors', sql.Int, bad_sectors || 0)
      .input('disk_temp', sql.Float, disk_temp || 0.0)
      .input('psu_status', sql.NVarChar, psu_status || 'Not Supported')
      .query(`
        MERGE INTO Devices AS target
        USING (SELECT @h AS hostname) AS source
        ON target.hostname = source.hostname
        WHEN MATCHED THEN
          UPDATE SET 
            ip = @ip, cpu = @cpu, ram = @ram, disk = @disk, 
            agent_version = @ver, os_version = @os, 
            last_seen = @seen, status = 'online',
            disk_status = @disk_status, bad_sectors = @bad_sectors,
            disk_temp = @disk_temp, psu_status = @psu_status
        WHEN NOT MATCHED THEN
          INSERT (id, hostname, ip, os_version, status, last_seen, cpu, ram, disk, agent_version, disk_status, bad_sectors, disk_temp, psu_status)
          VALUES (@id, @h, @ip, @os, 'online', @seen, @cpu, @ram, @disk, @ver, @disk_status, @bad_sectors, @disk_temp, @psu_status);
      `);

    // Verify update was successful
    if (result.rowsAffected && result.rowsAffected[0] > 0) {
      console.log(`[AGENT_HEARTBEAT] âœ“ Database updated for ${hostname} (${result.rowsAffected[0]} row(s) affected)`);
    } else {
      console.warn(`[AGENT_HEARTBEAT] âš  No rows affected for ${hostname} - possible DB issue`);
    }



    // Fetch config for auto-update response
    const configRes = await pool.request().query("SELECT [key], [value] FROM SystemConfigs WHERE [key] IN ('LATEST_AGENT_VERSION', 'AGENT_UPDATE_URL')");
    const configs = {};
    configRes.recordset.forEach(r => configs[r.key] = r.value);

    res.json({
      status: 'ok',
      timestamp: now,
      latest_agent_version: configs.LATEST_AGENT_VERSION || '2.5.0',
      update_url: configs.AGENT_UPDATE_URL || ''
    });

  } catch (err) {
    console.error(`[AGENT_HEARTBEAT] âœ— Error for ${hostname}:`);
    console.error(`  Message: ${err.message}`);
    console.error(`  Code: ${err.code}`);
    console.error(`  State: ${err.state}`);
    console.error(`  Stack: ${err.stack}`);
    res.status(500).json({ error: err.message, code: err.code });
  }
});

// \u2500€\u2500€ GET /api/devices/:id/software \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/devices/:id/software', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('device_id', sql.NVarChar, id)
      .query(`SELECT name, version, publisher, updated_at FROM DeviceSoftware WHERE device_id = @device_id ORDER BY name ASC`);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/agent/software-inventory \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/agent/software-inventory', async (req, res) => {
  try {
    const { hostname, software } = req.body;
    if (!hostname) return res.status(400).json({ error: "Hostname is required" });
    if (!Array.isArray(software)) return res.status(400).json({ error: "Software array is required" });

    const pool = await poolPromise;
    
    // Look up the actual device ID by hostname from Devices table
    const devRes = await pool.request()
      .input('h', sql.NVarChar, hostname)
      .query("SELECT id FROM Devices WHERE hostname = @h");
      
    let device_id = `dev-${hostname.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (devRes.recordset.length > 0) {
      device_id = devRes.recordset[0].id;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await transaction.request()
        .input('device_id', sql.NVarChar, device_id)
        .query(`DELETE FROM DeviceSoftware WHERE device_id = @device_id`);

      if (software.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < software.length; i += chunkSize) {
          const chunk = software.slice(i, i + chunkSize);
          const reqBatch = transaction.request();
          reqBatch.input('device_id', sql.NVarChar, device_id);

          let insertValues = [];
          chunk.forEach((app, idx) => {
            reqBatch.input(`n${idx}`, sql.NVarChar, (app.name || 'Unknown').substring(0, 255));
            reqBatch.input(`v${idx}`, sql.NVarChar, (app.version || '').substring(0, 100));
            reqBatch.input(`p${idx}`, sql.NVarChar, (app.publisher || '').substring(0, 255));
            insertValues.push(`(@device_id, @n${idx}, @v${idx}, @p${idx}, GETDATE())`);
          });

          await reqBatch.query(`INSERT INTO DeviceSoftware (device_id, name, version, publisher, updated_at) VALUES ${insertValues.join(', ')}`);
        }
      }

      await transaction.commit();
      res.json({ message: "Inventory updated" });
    } catch (err) {
      console.error(`[INVENTORY_DB_ERROR] Original query failure for ${hostname}:`, err.message, err);
      try {
        await transaction.rollback();
      } catch (e) {}
      throw err;
    }
  } catch (err) {
    console.error(`[AGENT] Software inventory error for ${req.body?.hostname}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/agent/config \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/agent/config', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT [key], [value] FROM SystemConfigs WHERE [key] IN ('LATEST_AGENT_VERSION', 'AGENT_UPDATE_URL')");
    const configs = {};
    result.recordset.forEach(r => configs[r.key] = r.value);
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/agent/config \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/agent/config', async (req, res) => {
  const { LATEST_AGENT_VERSION, AGENT_UPDATE_URL } = req.body;
  try {
    const pool = await poolPromise;

    if (LATEST_AGENT_VERSION !== undefined) {
      await pool.request()
        .input('key', sql.NVarChar, 'LATEST_AGENT_VERSION')
        .input('val', sql.NVarChar, LATEST_AGENT_VERSION)
        .query(`
          MERGE INTO SystemConfigs WITH (HOLDLOCK) AS target
          USING (SELECT @key AS [key]) AS source
          ON target.[key] = source.[key]
          WHEN MATCHED THEN UPDATE SET [value] = @val, updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (@key, @val);
        `);
    }

    if (AGENT_UPDATE_URL !== undefined) {
      await pool.request()
        .input('key', sql.NVarChar, 'AGENT_UPDATE_URL')
        .input('val', sql.NVarChar, AGENT_UPDATE_URL)
        .query(`
          MERGE INTO SystemConfigs WITH (HOLDLOCK) AS target
          USING (SELECT @key AS [key]) AS source
          ON target.[key] = source.[key]
          WHEN MATCHED THEN UPDATE SET [value] = @val, updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT ([key], [value]) VALUES (@key, @val);
        `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Config save error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/agent/version \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/agent/version', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT [value] FROM SystemConfigs WHERE [key] = 'LATEST_AGENT_VERSION'");
    const version = result.recordset[0]?.value || '2.7.5';
    res.json({ version });
  } catch (err) {
    res.json({ version: '2.7.5' });
  }
});

// \u2500€\u2500€ GET /api/agent/pending?hostname=... \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/agent/pending', async (req, res) => {
  const { hostname } = req.query;
  if (!hostname) return res.json({ commands: [] });
  try {
    const pool = await poolPromise;
    // Find device_id by hostname
    const devRes = await pool.request()
      .input('h', sql.NVarChar, hostname)
      .query("SELECT id FROM Devices WHERE hostname = @h");
    if (!devRes.recordset[0]) return res.json({ commands: [] });
    const device_id = devRes.recordset[0].id;

    // Fetch pending commands for this device
    const cmdsRes = await pool.request()
      .input('device_id', sql.NVarChar, device_id)
      .query("SELECT id, exec_id, command FROM PendingCommands WHERE device_id = @device_id AND status = 'pending'");

    res.json({ commands: cmdsRes.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/agent/pending-deployments?hostname=... \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/agent/pending-deployments', async (req, res) => {
  const { hostname } = req.query;
  if (!hostname) return res.json({ deployments: [] });
  try {
    const pool = await poolPromise;
    const devRes = await pool.request()
      .input('h', sql.NVarChar, hostname)
      .query("SELECT id FROM Devices WHERE hostname = @h");
    if (!devRes.recordset[0]) return res.json({ deployments: [] });
    const device_id = devRes.recordset[0].id;

    const depRes = await pool.request()
      .input('dev_id', sql.NVarChar, device_id)
      .query(`
        SELECT 
          t.deployment_id, 
          t.device_id, 
          d.package_name, 
          d.target_path, 
          p.file_path as file_name
        FROM DeploymentTargets t
        INNER JOIN Deployments d ON t.deployment_id = d.id
        LEFT JOIN Packages p ON d.package_id = p.id
        WHERE t.device_id = @dev_id AND t.status IN ('pending', 'failed', 'running')
      `);

    res.json({ deployments: depRes.recordset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// \u2500€\u2500€ POST /api/agent/command-result \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/agent/command-result', async (req, res) => {
  const { command_id, exec_id, hostname, status, result_log } = req.body;
  if (!command_id) return res.status(400).json({ error: 'Missing command_id' });
  try {
    const pool = await poolPromise;

    // 1. Update PendingCommands row
    await pool.request()
      .input('id', sql.NVarChar, command_id)
      .input('status', sql.NVarChar, status === 'success' ? 'done' : 'failed')
      .input('log', sql.NVarChar, result_log || '')
      .query("UPDATE PendingCommands SET status = @status, result_log = @log, executed_at = GETDATE() WHERE id = @id");

    // 2. Update in-memory commandExecutions map so frontend polling works
    if (exec_id && commandExecutions.has(exec_id)) {
      const execData = commandExecutions.get(exec_id);
      const existing = execData.logs.find(l => l.hostname === hostname);
      const logEntry = {
        hostname: hostname,
        ip: existing?.ip || '',
        status: status,
        log: result_log || 'Command executed.',
        updated_at: new Date().toISOString()
      };
      if (existing) {
        Object.assign(existing, logEntry);
      } else {
        execData.logs.push(logEntry);
      }

      // Check if all commands for this exec are done
      const allCmds = await pool.request()
        .input('exec_id', sql.NVarChar, exec_id)
        .query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending FROM PendingCommands WHERE exec_id = @exec_id");
      const { total, pending } = allCmds.recordset[0];
      if (pending === 0) execData.is_complete = true;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/agent/deploy-status \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/agent/deploy-status', async (req, res) => {
  const { deployment_id, device_id, status, progress, log } = req.body;
  try {
    const pool = await poolPromise;

    // 1. Update target
    const currentStatusRes = await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .input('dev_id', sql.NVarChar, device_id)
      .query('SELECT status, retry_count FROM DeploymentTargets WHERE deployment_id = @dep_id AND device_id = @dev_id');

    const currentTarget = currentStatusRes.recordset[0];
    let newRetryCount = currentTarget ? (currentTarget.retry_count || 0) : 0;

    if (status === 'failed') {
      newRetryCount += 1;
    } else if (status === 'success') {
      newRetryCount = 0; // reset on success if needed
    }

    await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .input('dev_id', sql.NVarChar, device_id)
      .input('status', sql.NVarChar, status)
      .input('progress', sql.Int, progress)
      .input('log', sql.NVarChar, log)
      .input('retry_count', sql.Int, newRetryCount)
      .input('updated_at', sql.NVarChar, new Date().toISOString())
      .query(`
        UPDATE DeploymentTargets 
        SET status = @status, progress = @progress, log = @log, 
            retry_count = @retry_count, last_error = (CASE WHEN @status = 'failed' THEN @log ELSE last_error END),
            updated_at = @updated_at
        WHERE deployment_id = @dep_id AND device_id = @dev_id
      `);

    // 2. Recalculate deployment overall status
    const statsResult = await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status NOT IN ('success', 'failed') THEN 1 ELSE 0 END) as pending
        FROM DeploymentTargets
        WHERE deployment_id = @dep_id
      `);

    const stats = statsResult.recordset[0];
    const overallStatus = stats.pending === 0 ? (stats.failed > 0 ? 'failed' : 'success') : 'running';

    await pool.request()
      .input('dep_id', sql.NVarChar, deployment_id)
      .input('success', sql.Int, stats.success)
      .input('failed', sql.Int, stats.failed)
      .input('pending', sql.Int, stats.pending)
      .input('status', sql.NVarChar, overallStatus)
      .query(`
        UPDATE Deployments 
        SET success_count = @success, failed_count = @failed, pending_count = @pending, status = @status
        WHERE id = @dep_id
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ AUTHENTICATION (SSO ONLY) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€

router.get('/api/auth/sso-config', (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  const redirectUri = `${protocol}://${host}/sso-callback`;
  const authUrl = `${protocol}://${host}/sso-api/auth/authorize`;

  res.json({
    client_id: process.env.SSO_CLIENT_ID || '',
    auth_url: authUrl,
    redirect_uri: redirectUri
  });
});

router.post('/api/auth/sso-login', async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const tokenUrl = process.env.SSO_TOKEN_URL;
    const userinfoUrl = process.env.SSO_USERINFO_URL;
    const clientId = process.env.SSO_CLIENT_ID;
    const clientSecret = process.env.SSO_CLIENT_SECRET;
    
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const redirectUri = `${protocol}://${host}/sso-callback`;

    // 1. Exchange authorization code for token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    });

    console.log('[SSO_LOGIN] Exchanging code at:', tokenUrl);
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[SSO_LOGIN] Token exchange failed:', errText);
      return res.status(400).json({ error: `SSO token exchange failed: ${errText}` });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.status(400).json({ error: 'No access token received from SSO' });
    }

    // 2. Fetch UserInfo from SSO Server
    console.log('[SSO_LOGIN] Fetching userinfo from:', userinfoUrl);
    const userinfoRes = await fetch(userinfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userinfoRes.ok) {
      const errText = await userinfoRes.text();
      console.error('[SSO_LOGIN] UserInfo fetch failed:', errText);
      return res.status(400).json({ error: `Failed to fetch SSO user profile: ${errText}` });
    }

    const ssoProfile = await userinfoRes.json();
    const username = ssoProfile.preferred_username || ssoProfile.email;
    if (!username) {
      return res.status(400).json({ error: 'SSO profile did not contain username or email' });
    }

    // 3. Find or auto-provision user in Pepinet database
    const pool = await poolPromise;
    let userResult = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT u.id, u.username, u.full_name, u.role_id,
               r.name as role_name, r.menu_permissions, r.is_admin
        FROM Users u
        JOIN Roles r ON u.role_id = r.id
        WHERE u.username = @username
      `);

    let user = userResult.recordset[0];

    if (!user) {
      console.log(`[SSO_LOGIN] User ${username} not found. Provisioning...`);
      const newUserId = 'user_sso_' + Date.now();
      const ssoRoles = ssoProfile.roles || [];
      const isAdmin = ssoRoles.some(r => r.toLowerCase() === 'superadmin' || r.toLowerCase() === 'administrator' || r.toLowerCase() === 'admin');
      const roleId = isAdmin ? 'role-admin' : 'role-user';
      const fullName = (ssoProfile.given_name || ssoProfile.family_name)
        ? `${ssoProfile.given_name || ''} ${ssoProfile.family_name || ''}`.trim()
        : username;

      await pool.request()
        .input('id', sql.NVarChar, newUserId)
        .input('username', sql.NVarChar, username)
        .input('password_hash', sql.NVarChar, 'SSO_AUTHENTICATED')
        .input('full_name', sql.NVarChar, fullName)
        .input('role_id', sql.NVarChar, roleId)
        .query(`
          INSERT INTO Users (id, username, password_hash, full_name, role_id)
          VALUES (@id, @username, @password_hash, @full_name, @role_id)
        `);

      // Fetch newly created user profile
      userResult = await pool.request()
        .input('username', sql.NVarChar, username)
        .query(`
          SELECT u.id, u.username, u.full_name, u.role_id,
                 r.name as role_name, r.menu_permissions, r.is_admin
          FROM Users u
          JOIN Roles r ON u.role_id = r.id
          WHERE u.username = @username
        `);
      user = userResult.recordset[0];
    }

    // Save OIDC session
    // We append a random UUID to the SSO sid to ensure every login is a unique PepiNet session.
    // This allows enforcing the "1 user 1 device" rule locally, while still allowing backchannel logout
    // to find the session using a LIKE clause.
    const ssoSid = tokenData.sid || crypto.randomUUID();
    const sessionId = ssoSid + '_' + crypto.randomUUID();

    // Invalidate all previous local sessions for this user to enforce 1-user-1-device rule
    await pool.request()
      .input('user_id', sql.VarChar, user.id)
      .query('UPDATE UserSessions SET is_active = 0, invalidated_at = GETDATE() WHERE user_id = @user_id AND is_active = 1');

    await pool.request()
      .input('sid', sql.VarChar, sessionId)
      .input('user_id', sql.VarChar, user.id)
      .query(`
        INSERT INTO UserSessions (id, user_id, is_active) VALUES (@sid, @user_id, 1)
      `);

    user.sessionId = sessionId;
    console.log('[SSO_LOGIN] Login success for user:', username, 'Session ID:', sessionId);
    res.json({ success: true, user });

  } catch (err) {
    console.error('[SSO_LOGIN] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/auth/sso-logout', async (req, res) => {
  const { sid } = req.body;
  if (!sid) {
    return res.status(400).json({ error: 'Session ID (sid) is required' });
  }

  try {
    const pool = await poolPromise;
    // Match any composite session that starts with the SSO sid using LIKE
    await pool.request()
      .input('sid_pattern', sql.VarChar, sid + '%')
      .query('UPDATE UserSessions SET is_active = 0, invalidated_at = GETDATE() WHERE id LIKE @sid_pattern');
    
    console.log(`[SLO] Session(s) starting with ${sid} invalidated successfully via Backchannel Logout.`);
    res.json({ success: true, message: 'Session invalidated' });
  } catch (err) {
    console.error('[SLO] Error invalidating session:', err);
    res.status(500).json({ error: err.message });
  }
});

// User-initiated logout from Pepinet app - invalidates local session AND notifies SSO server
router.post('/api/auth/logout', async (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.body?.session_id;
  const userId = req.headers['x-user-id'];

  try {
    const pool = await poolPromise;

    // 1. Invalidate local UserSession in Pepinet DB
    if (sessionId) {
      await pool.request()
        .input('sid', sql.VarChar, sessionId)
        .query('UPDATE UserSessions SET is_active = 0, invalidated_at = GETDATE() WHERE id = @sid');
      console.log(`[LOGOUT] Local session ${sessionId} invalidated.`);
    }

    // 2. Notify SSO Server to revoke active_session so portal shows it as inactive
    if (sessionId) {
      try {
        const ssoApiBase = process.env.SSO_TOKEN_URL?.replace('/auth/token', '') || 'http://localhost:3003/api';
        
        // Extract the original SSO sid from the composite sessionId
        const originalSsoSid = sessionId.split('_')[0];
        
        const notifyRes = await fetch(`${ssoApiBase}/sessions/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: originalSsoSid, user_id: userId })
        });
        if (notifyRes.ok) {
          console.log(`[LOGOUT] SSO server notified to revoke session ${sessionId}`);
        } else {
          const errText = await notifyRes.text();
          console.warn(`[LOGOUT] SSO notify non-critical failure: ${errText}`);
        }
      } catch (ssoErr) {
        console.warn('[LOGOUT] Could not reach SSO server (non-critical):', ssoErr.message);
      }
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('[LOGOUT] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/auth/change-password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.headers['x-user-id'];

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await poolPromise;
    const userResult = await pool.request()
      .input('id', sql.NVarChar, userId)
      .query('SELECT password_hash FROM Users WHERE id = @id');

    const user = userResult.recordset[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.password_hash !== oldPassword) {
      return res.status(400).json({ error: 'Incorrect old password' });
    }

    await pool.request()
      .input('id', sql.NVarChar, userId)
      .input('newPassword', sql.NVarChar, newPassword)
      .query('UPDATE Users SET password_hash = @newPassword WHERE id = @id');

    // Log the action
    await pool.request()
      .input('user', sql.NVarChar, userId)
      .input('action', sql.NVarChar, 'Changed password')
      .query("INSERT INTO ActivityLog (time, [user], action) VALUES (GETDATE(), @user, @action)");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ USER MANAGEMENT \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
async function getRequestUser(req, pool) {
  const headerUserId = req.headers['x-user-id'];
  const userId = (typeof headerUserId === 'string' && headerUserId) || req.body?.userId || req.query?.userId;
  if (!userId) return null;

  const result = await pool.request()
    .input('uid', sql.NVarChar, userId)
    .query(`
      SELECT u.id, u.username, u.full_name, u.role_id, r.name as role_name, r.menu_permissions, r.is_admin
      FROM Users u
      JOIN Roles r ON u.role_id = r.id
      WHERE u.id = @uid OR u.username = @uid
    `);

  return result.recordset[0] || null;
}

async function requireAdminUser(req, res, pool) {
  const user = await getRequestUser(req, pool);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: user not found.' });
    return null;
  }
  if (!user.is_admin) {
    res.status(403).json({ error: 'Access denied: admin only.' });
    return null;
  }
  return user;
}

function normalizeDateFilter(value) {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function escapeCsvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchActivityLogs(pool, requestUser, options = {}) {
  const dateFilter = normalizeDateFilter(options.date);
  const request = pool.request();
  const filters = [];

  if (!requestUser.is_admin) {
    request.input('username', sql.NVarChar, requestUser.username);
    filters.push('[user] = @username');
  }

  if (dateFilter) {
    request.input('dateFilter', sql.Date, dateFilter);
    // Note: created_at column does not exist, date filter disabled
    filters.push('1=1');
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await request.query(`
    SELECT
      id,
      time,
      [user],
      action,
      GETDATE() as created_at, -- Placeholder since column doesn't exist
      CASE
        WHEN LOWER(action) LIKE '%error%' OR LOWER(action) LIKE '%failed%' OR LOWER(action) LIKE '%denied%' THEN 'error'
        WHEN LOWER(action) LIKE '%warning%' OR LOWER(action) LIKE '%offline%' THEN 'warning'
        WHEN LOWER(action) LIKE '%success%' OR LOWER(action) LIKE '%completed%' OR LOWER(action) LIKE '%synced%' THEN 'success'
        ELSE 'info'
      END AS level
    FROM ActivityLog
    ${whereClause}
    ORDER BY id DESC
  `);

  return result.recordset;
}

router.get('/api/users', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT u.id, u.username, u.full_name, u.role_id, u.created_at, r.name as role_name, u.division, u.location 
      FROM Users u
      JOIN Roles r ON u.role_id = r.id
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



router.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, full_name, role_id, division, location } = req.body;
  try {
    const pool = await poolPromise;

    // Fetch old user details for comparison logging
    const oldUserRes = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT username, division, location FROM Users WHERE id = @id');
    const oldUser = oldUserRes.recordset[0];

    let query = `
      UPDATE Users 
      SET username = @username, full_name = @full_name, role_id = @role_id, division = @division, location = @location
    `;
    query += ` WHERE id = @id`;

    const request = pool.request()
      .input('id', sql.NVarChar, id)
      .input('username', sql.NVarChar, username)
      .input('full_name', sql.NVarChar, full_name)
      .input('role_id', sql.NVarChar, role_id)
      .input('division', sql.NVarChar, division || 'IT')
      .input('location', sql.NVarChar, location || null);

    await request.query(query);

    // Log the update to ActivityLog
    if (oldUser) {
      const reqUser = await getRequestUser(req, pool);
      const actor = reqUser ? reqUser.username : 'admin';
      const actionDesc = `Updated user ${oldUser.username}: division = ${oldUser.division || 'IT'} -> ${division || 'IT'}, location = ${oldUser.location || 'Head Office (HO)'} -> ${location || 'Head Office (HO)'}`;
      await pool.request()
        .input('actor', sql.NVarChar, actor)
        .input('action', sql.NVarChar, actionDesc)
        .query("INSERT INTO ActivityLog (time, [user], action) VALUES (GETDATE(), @actor, @action)");
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    
    // Get username before delete to log it
    const userRes = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT username FROM Users WHERE id = @id');
    const username = userRes.recordset[0]?.username;

    await pool.request().input('id', sql.NVarChar, id).query('DELETE FROM Users WHERE id = @id');
    
    if (username) {
      const reqUser = await getRequestUser(req, pool);
      const actor = reqUser ? reqUser.username : 'admin';
      await pool.request()
        .input('actor', sql.NVarChar, actor)
        .input('action', sql.NVarChar, `Deleted user ${username}`)
        .query("INSERT INTO ActivityLog (time, [user], action) VALUES (GETDATE(), @actor, @action)");
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/users/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    const userRes = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT username FROM Users WHERE id = @id');
    const user = userRes.recordset[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const result = await pool.request()
      .input('username', sql.NVarChar, `%${user.username}%`)
      .query(`
        SELECT id, time, [user] as actor, action
        FROM ActivityLog
        WHERE action LIKE @username
        ORDER BY id DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ ROLE MANAGEMENT \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/roles', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Roles');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/roles', async (req, res) => {
  const { name, menu_permissions, is_admin } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, `role-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('permissions', sql.NVarChar, menu_permissions)
      .input('is_admin', sql.Bit, is_admin ? 1 : 0)
      .query(`
        INSERT INTO Roles (id, name, menu_permissions, is_admin)
        VALUES (@id, @name, @permissions, @is_admin)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/roles/:id', async (req, res) => {
  const { id } = req.params;
  const { name, menu_permissions, is_admin } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('permissions', sql.NVarChar, menu_permissions)
      .input('is_admin', sql.Bit, is_admin ? 1 : 0)
      .query(`
        UPDATE Roles 
        SET name = @name, menu_permissions = @permissions, is_admin = @is_admin
        WHERE id = @id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/roles/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    // Check if role is used by any user
    const check = await pool.request().input('role_id', sql.NVarChar, id).query('SELECT COUNT(*) as count FROM Users WHERE role_id = @role_id');
    if (check.recordset[0].count > 0) {
      return res.status(400).json({ error: 'Cannot delete role that is assigned to users' });
    }
    await pool.request().input('id', sql.NVarChar, id).query('DELETE FROM Roles WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ NOTIFICATION SETTINGS \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/assistant-keywords', async (req, res) => {
  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;

    const result = await pool.request().query(`
      SELECT * FROM AssistantKeywords
      ORDER BY keyword ASC, created_at DESC
    `);

    res.json(result.recordset.map((row) => ({
      ...row,
      target_host: sanitizeKeywordTargetHost(row.target_host),
      parameter_keys: parseKeywordParameterKeys(row.parameter_keys)
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/assistant-keywords', async (req, res) => {
  const {
    keyword, description, action_type, target_host, script_text,
    parameter_keys, requires_admin, requires_confirmation, is_enabled
  } = req.body;

  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;
    if (!keyword?.trim() || !script_text?.trim() || !['query', 'procedure', 'workflow'].includes(action_type)) {
      return res.status(400).json({ error: 'Keyword, action type, and script are required.' });
    }

    await pool.request()
      .input('id', sql.NVarChar, `keyword-${Date.now()}`)
      .input('keyword', sql.NVarChar, keyword?.trim())
      .input('description', sql.NVarChar, description?.trim() || '')
      .input('action_type', sql.NVarChar, action_type)
      .input('target_host', sql.NVarChar, sanitizeKeywordTargetHost(target_host))
      .input('script_text', sql.NVarChar(sql.MAX), script_text || '')
      .input('parameter_keys', sql.NVarChar(sql.MAX), JSON.stringify(parseKeywordParameterKeys(parameter_keys)))
      .input('requires_admin', sql.Bit, requires_admin ? 1 : 0)
      .input('requires_confirmation', sql.Bit, requires_confirmation ? 1 : 0)
      .input('is_enabled', sql.Bit, is_enabled === false ? 0 : 1)
      .query(`
        INSERT INTO AssistantKeywords (
          id, keyword, description, action_type, target_host, script_text,
          parameter_keys, requires_admin, requires_confirmation, is_enabled
        )
        VALUES (
          @id, @keyword, @description, @action_type, @target_host, @script_text,
          @parameter_keys, @requires_admin, @requires_confirmation, @is_enabled
        )
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/assistant-keywords/:id', async (req, res) => {
  const {
    keyword, description, action_type, target_host, script_text,
    parameter_keys, requires_admin, requires_confirmation, is_enabled
  } = req.body;

  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;
    if (!keyword?.trim() || !script_text?.trim() || !['query', 'procedure', 'workflow'].includes(action_type)) {
      return res.status(400).json({ error: 'Keyword, action type, and script are required.' });
    }

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('keyword', sql.NVarChar, keyword?.trim())
      .input('description', sql.NVarChar, description?.trim() || '')
      .input('action_type', sql.NVarChar, action_type)
      .input('target_host', sql.NVarChar, sanitizeKeywordTargetHost(target_host))
      .input('script_text', sql.NVarChar(sql.MAX), script_text || '')
      .input('parameter_keys', sql.NVarChar(sql.MAX), JSON.stringify(parseKeywordParameterKeys(parameter_keys)))
      .input('requires_admin', sql.Bit, requires_admin ? 1 : 0)
      .input('requires_confirmation', sql.Bit, requires_confirmation ? 1 : 0)
      .input('is_enabled', sql.Bit, is_enabled === false ? 0 : 1)
      .query(`
        UPDATE AssistantKeywords
        SET keyword = @keyword,
            description = @description,
            action_type = @action_type,
            target_host = @target_host,
            script_text = @script_text,
            parameter_keys = @parameter_keys,
            requires_admin = @requires_admin,
            requires_confirmation = @requires_confirmation,
            is_enabled = @is_enabled,
            updated_at = GETDATE()
        WHERE id = @id
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/assistant-keywords/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query(`DELETE FROM AssistantKeywords WHERE id = @id`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/assistant-keywords/test', async (req, res) => {
  const { keyword, test_input } = req.body;

  try {
    const pool = await poolPromise;
    const adminUser = await requireAdminUser(req, res, pool);
    if (!adminUser) return;

    if (!keyword?.keyword || !keyword?.action_type || !keyword?.script_text) {
      return res.status(400).json({ error: 'Keyword, action type, and script are required for testing.' });
    }

    const runtimeKeyword = {
      ...keyword,
      target_host: sanitizeKeywordTargetHost(keyword.target_host),
      parameter_keys: parseKeywordParameterKeys(keyword.parameter_keys)
    };
    const args = parseAssistantKeywordArgs(test_input || '');

    const result = runtimeKeyword.action_type === 'workflow'
      ? await executeWorkflowKeyword(pool, runtimeKeyword, args)
      : await executeKeywordSql(pool, runtimeKeyword, args);

    res.json({
      success: true,
      text: result.text,
      sources: result.sources || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/assistant-keywords/run', async (req, res) => {
  const { keywordId, parameters, targetHost, confirm } = req.body;

  try {
    const pool = await poolPromise;
    const user = await getRequestUser(req, pool);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: user not found.' });
    }

    const perms = user.menu_permissions || '[]';
    const hasAssistantAccess = user.is_admin || perms === '*' || perms.includes('assistant');
    if (!hasAssistantAccess) {
      return res.status(403).json({ error: 'Access denied: assistant permissions required.' });
    }

    // Fetch the keyword
    const kwRes = await pool.request()
      .input('id', sql.NVarChar, keywordId)
      .query('SELECT * FROM AssistantKeywords WHERE id = @id');
    
    const keyword = kwRes.recordset[0];
    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found.' });
    }

    if (!keyword.is_enabled) {
      return res.status(400).json({ error: 'Keyword is currently disabled.' });
    }

    if (keyword.requires_admin && !user.is_admin) {
      return res.status(403).json({ error: `Access denied: Keyword '${keyword.keyword}' is restricted to administrators only.` });
    }

    if (keyword.requires_confirmation && !confirm) {
      return res.status(400).json({ error: `Keyword '${keyword.keyword}' requires confirmation before running.` });
    }

    const runtimeKeyword = {
      ...keyword,
      target_host: sanitizeKeywordTargetHost(targetHost || keyword.target_host),
      parameter_keys: parseKeywordParameterKeys(keyword.parameter_keys)
    };

    // Construct the args object from parameters
    const args = { ...parameters };
    if (runtimeKeyword.target_host) {
      args.host = runtimeKeyword.target_host;
    }
    if (confirm) {
      args.confirm = 'yes';
    }

    // Log action to ActivityLog
    await pool.request()
      .input('time', sql.NVarChar, new Date().toLocaleString())
      .input('u', sql.NVarChar, user.username || user.id)
      .input('act', sql.NVarChar, `Run Keyword Action: ${keyword.keyword}`)
      .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @u, @act)");

    // Execute
    const result = runtimeKeyword.action_type === 'workflow'
      ? await executeWorkflowKeyword(pool, runtimeKeyword, args)
      : await executeKeywordSql(pool, runtimeKeyword, args);

    res.json({
      success: true,
      text: result.text,
      sources: result.sources || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/notification-settings', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    res.json(result.recordset[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notification-settings', async (req, res) => {
  const {
    webhook_url, whatsapp_token, whatsapp_target, whatsapp_group,
    alert_offline, alert_deployment_success, alert_deployment_failed,
    offline_timeout_mins, sql_safe_mode
  } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('url', sql.NVarChar, webhook_url || '')
      .input('token', sql.NVarChar, whatsapp_token || '')
      .input('target', sql.NVarChar, whatsapp_target || '')
      .input('group', sql.NVarChar, whatsapp_group || '')
      .input('alert_offline', sql.Bit, alert_offline ? 1 : 0)
      .input('alert_dep_success', sql.Bit, alert_deployment_success ? 1 : 0)
      .input('alert_dep_failed', sql.Bit, alert_deployment_failed ? 1 : 0)
      .input('timeout_mins', sql.Int, offline_timeout_mins || 5)
      .input('sql_safe_mode', sql.Bit, sql_safe_mode ? 1 : 0)
      .query(`
        IF EXISTS (SELECT 1 FROM NotificationSettings WHERE id = 'global')
          UPDATE NotificationSettings SET
            webhook_url = @url, whatsapp_token = @token, whatsapp_target = @target,
            whatsapp_group = @group, alert_offline = @alert_offline,
            alert_deployment_success = @alert_dep_success,
            alert_deployment_failed = @alert_dep_failed,
            offline_timeout_mins = @timeout_mins,
            sql_safe_mode = @sql_safe_mode
          WHERE id = 'global'
        ELSE
          INSERT INTO NotificationSettings (id, webhook_url, whatsapp_token, whatsapp_target, whatsapp_group, alert_offline, alert_deployment_success, alert_deployment_failed, offline_timeout_mins, sql_safe_mode)
          VALUES ('global', @url, @token, @target, @group, @alert_offline, @alert_dep_success, @alert_dep_failed, @timeout_mins, @sql_safe_mode)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// \u2500€\u2500€ NOTIFICATION SCHEDULES CRUD \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/notification-schedules', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM NotificationSchedules ORDER BY schedule_time ASC");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/notification-types', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM NotificationTypes ORDER BY label ASC");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notification-schedules', async (req, res) => {
  const { name, notif_type, schedule_time, whatsapp_target, whatsapp_group, is_enabled } = req.body;
  console.log('[API] Creating new schedule:', { name, notif_type, schedule_time });
  try {
    const pool = await poolPromise;
    const id = 'sch_' + Date.now();
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('notif_type', sql.NVarChar, notif_type)
      .input('schedule_time', sql.NVarChar, schedule_time)
      .input('schedule_day', sql.NVarChar, req.body.schedule_day || 'Daily')
      .input('wa_target', sql.NVarChar, whatsapp_target || '')
      .input('wa_group', sql.NVarChar, whatsapp_group || '')
      .input('enabled', sql.Bit, (is_enabled === true || is_enabled === 1 || is_enabled === undefined) ? 1 : 0)
      .query(`
        INSERT INTO NotificationSchedules (id, name, notif_type, schedule_time, schedule_day, whatsapp_target, whatsapp_group, is_enabled)
        VALUES (@id, @name, @notif_type, @schedule_time, @schedule_day, @wa_target, @wa_group, @enabled)
      `);
    console.log(`[API] Schedule created with ID: ${id}`);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[API] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/notification-schedules/:id', async (req, res) => {
  const { id } = req.params;
  const { name, notif_type, schedule_time, whatsapp_target, whatsapp_group, is_enabled } = req.body;
  console.log(`[API] Updating schedule ${id}:`, { name, notif_type, schedule_time, is_enabled });
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('notif_type', sql.NVarChar, notif_type)
      .input('schedule_time', sql.NVarChar, schedule_time)
      .input('schedule_day', sql.NVarChar, req.body.schedule_day || 'Daily')
      .input('wa_target', sql.NVarChar, whatsapp_target || '')
      .input('wa_group', sql.NVarChar, whatsapp_group || '')
      .input('enabled', sql.Bit, (is_enabled === true || is_enabled === 1) ? 1 : 0)
      .query(`
        UPDATE NotificationSchedules SET
          name = @name, notif_type = @notif_type, schedule_time = @schedule_time,
          schedule_day = @schedule_day,
          whatsapp_target = @wa_target, whatsapp_group = @wa_group, is_enabled = @enabled,
          updated_at = GETDATE()
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      console.warn(`[API] No schedule found with ID ${id} for update.`);
      return res.status(404).json({ error: "Schedule not found" });
    }

    console.log(`[API] Schedule ${id} updated successfully.`);
    res.json({ success: true });
  } catch (err) {
    console.error(`[API] Update error for ${id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/notification-schedules/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, id).query("DELETE FROM NotificationSchedules WHERE id = @id");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/notification-schedules/:id/trigger', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .query("SELECT * FROM NotificationSchedules WHERE id = @id");

    const sch = result.recordset[0];
    if (!sch) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    console.log(`[API] Manually triggering schedule ${id} (${sch.name})`);

    const options = {
      customTarget: sch.whatsapp_target,
      customGroup: sch.whatsapp_group
    };

    if (sch.notif_type === 'daily_report') {
      await sendDailyOutstandingTicketsNotification(options);
    } else if (sch.notif_type === 'weekly_report') {
      await generateWeeklyReportPDF(options);
    } else if (sch.notif_type === 'fraud_alert') {
      await sendFraudAlertNotification(options);
    } else if (sch.notif_type === 'job_monitoring_report') {
      await sendJobMonitoringReport(options);
    } else if (sch.notif_type === 'device_status_report') {
      await sendDeviceStatusReport(options);
    } else if (sch.notif_type === 'hardware_health_report') {
      await sendHardwareHealthReport(options);
    } else {
      return res.status(400).json({ error: `Unsupported notification type: ${sch.notif_type}` });
    }

    res.json({ success: true, message: `Schedule triggered for ${sch.notif_type}` });
  } catch (err) {
    console.error(`[API] Trigger error for ${id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ POST /api/test-notification (Discord/Webhook) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
const DEFAULT_THEME_SETTINGS = {
  sidebarBg: "#10331f",
  sidebarText: "#d1fae5",
  sidebarAccent: "#f59e0b",
  mainBg: "#0f172a",
  contentText: "#f1f5f9",
  cardBg: "#1e293b",
  primaryBrand: "#3b82f6",
  appLogo: "",
  logoSize: 32,
  appName: "pepinetupdater"
};

router.get('/api/theme', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT TOP 1 * FROM ThemeSettings WHERE id = 'global'");
    const row = result.recordset[0];

    if (!row) {
      return res.json(DEFAULT_THEME_SETTINGS);
    }

    res.json({
      sidebarBg: row.sidebarBg || DEFAULT_THEME_SETTINGS.sidebarBg,
      sidebarText: row.sidebarText || DEFAULT_THEME_SETTINGS.sidebarText,
      sidebarAccent: row.sidebarAccent || DEFAULT_THEME_SETTINGS.sidebarAccent,
      mainBg: row.mainBg || DEFAULT_THEME_SETTINGS.mainBg,
      contentText: row.contentText || DEFAULT_THEME_SETTINGS.contentText,
      cardBg: row.cardBg || DEFAULT_THEME_SETTINGS.cardBg,
      primaryBrand: row.primaryBrand || DEFAULT_THEME_SETTINGS.primaryBrand,
      appLogo: row.appLogo || "",
      logoSize: row.logoSize || DEFAULT_THEME_SETTINGS.logoSize,
      appName: row.appName || DEFAULT_THEME_SETTINGS.appName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/theme', async (req, res) => {
  const theme = {
    ...DEFAULT_THEME_SETTINGS,
    ...(req.body || {}),
    appLogo: req.body?.appLogo || '',
    logoSize: Number(req.body?.logoSize) || DEFAULT_THEME_SETTINGS.logoSize,
    appName: req.body?.appName || DEFAULT_THEME_SETTINGS.appName
  };

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('sidebarBg', sql.NVarChar(20), theme.sidebarBg)
      .input('sidebarText', sql.NVarChar(20), theme.sidebarText)
      .input('sidebarAccent', sql.NVarChar(20), theme.sidebarAccent)
      .input('mainBg', sql.NVarChar(20), theme.mainBg)
      .input('contentText', sql.NVarChar(20), theme.contentText)
      .input('cardBg', sql.NVarChar(20), theme.cardBg)
      .input('primaryBrand', sql.NVarChar(20), theme.primaryBrand)
      .input('appLogo', sql.NVarChar(sql.MAX), theme.appLogo)
      .input('logoSize', sql.Int, theme.logoSize)
      .input('appName', sql.NVarChar(200), theme.appName)
      .query(`
        IF EXISTS (SELECT 1 FROM ThemeSettings WHERE id = 'global')
          UPDATE ThemeSettings SET
            sidebarBg = @sidebarBg,
            sidebarText = @sidebarText,
            sidebarAccent = @sidebarAccent,
            mainBg = @mainBg,
            contentText = @contentText,
            cardBg = @cardBg,
            primaryBrand = @primaryBrand,
            appLogo = @appLogo,
            logoSize = @logoSize,
            appName = @appName,
            updated_at = GETDATE()
          WHERE id = 'global'
        ELSE
          INSERT INTO ThemeSettings (id, sidebarBg, sidebarText, sidebarAccent, mainBg, contentText, cardBg, primaryBrand, appLogo, logoSize, appName)
          VALUES ('global', @sidebarBg, @sidebarText, @sidebarAccent, @mainBg, @contentText, @cardBg, @primaryBrand, @appLogo, @logoSize, @appName)
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/test-notification', async (req, res) => {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];

    if (!settings || !settings.webhook_url) {
      return res.status(400).json({ success: false, error: 'Webhook URL not configured.' });
    }

    const payload = JSON.stringify({
      embeds: [{
        title: '\uD83D\uDD14 Test Notification',
        description: 'This is a test notification from **Centaur Deploy**. Your webhook is working correctly!',
        color: 0x10b981,
        timestamp: getISOTimestamp(),
        footer: { text: 'Centaur Deploy Monitoring System' }
      }]
    });

    const url = new URL(settings.webhook_url);
    await new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      };
      const request = https.request(options, (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve();
        else reject(new Error(`HTTP ${response.statusCode}`));
      });
      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[TEST-NOTIF] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// \u2500€\u2500€ POST /api/test-whatsapp \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/test-whatsapp', async (req, res) => {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];

    if (!settings || !settings.whatsapp_token) {
      return res.status(400).json({ success: false, error: 'WhatsApp token not configured.' });
    }

    const targets = [settings.whatsapp_target, settings.whatsapp_group].filter(Boolean).join(',');
    if (!targets) {
      return res.status(400).json({ success: false, error: 'No WhatsApp target or group configured.' });
    }

    const message = `\uD83D\uDD14 *Test Notification*\n\nIni adalah pesan test dari *Centaur Deploy*.\nNotifikasi WhatsApp Anda berfungsi dengan benar!\n\n_${new Date().toLocaleString('id-ID')}_`;
    const payload = JSON.stringify({ token: settings.whatsapp_token, target: targets, message, countryCode: '62' });

    await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.fonnte.com',
        path: '/send',
        method: 'POST',
        headers: {
          'Authorization': settings.whatsapp_token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const request = https.request(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.status === true || response.statusCode < 300) resolve();
            else reject(new Error(parsed.reason || `HTTP ${response.statusCode}`));
          } catch { resolve(); }
        });
      });
      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[TEST-WA] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// \u2500€\u2500€ SQL TEMPLATES \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/sql/templates', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM SqlTemplates ORDER BY name ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/sql/templates', async (req, res) => {
  const { id, name, description, script, created_by, template_group } = req.body;
  try {
    const pool = await poolPromise;
    if (id) {
      // Update
      await pool.request()
        .input('id', sql.NVarChar, id)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .input('template_group', sql.NVarChar, template_group || 'General')
        .query(`UPDATE SqlTemplates SET name=@name, description=@description, script=@script, template_group=@template_group WHERE id=@id`);
      res.json({ success: true, message: 'Template updated' });
    } else {
      // Create
      await pool.request()
        .input('id', sql.NVarChar, `tpl-${Date.now()}`)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .input('template_group', sql.NVarChar, template_group || 'General')
        .query(`INSERT INTO SqlTemplates (id, name, description, script, created_by, template_group) VALUES (@id, @name, @description, @script, @created_by, @template_group)`);
      res.json({ success: true, message: 'Template created' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/sql/templates/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, script, template_group } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('script', sql.NVarChar, script)
      .input('template_group', sql.NVarChar, template_group || 'General')
      .query(`UPDATE SqlTemplates SET name=@name, description=@description, script=@script, template_group=@template_group WHERE id=@id`);
    res.json({ success: true, message: 'Template updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/sql/templates/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, req.params.id).query('DELETE FROM SqlTemplates WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alias for older/other parts if needed
router.get('/api/sql-templates', (req, res) => res.redirect('/api/sql/templates'));

// \u2500€\u2500€ REMOTE COMMAND SCRIPTS \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/remote-commands/scripts', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM RemoteCommandScripts ORDER BY name ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/remote-commands/scripts', async (req, res) => {
  const { id, name, description, script, created_by } = req.body;
  try {
    const pool = await poolPromise;
    if (id) {
      await pool.request()
        .input('id', sql.NVarChar, id)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .query(`UPDATE RemoteCommandScripts SET name=@name, description=@description, script=@script WHERE id=@id`);
      res.json({ success: true, message: 'Script updated' });
    } else {
      await pool.request()
        .input('id', sql.NVarChar, `rcs-${Date.now()}`)
        .input('name', sql.NVarChar, name)
        .input('description', sql.NVarChar, description || '')
        .input('script', sql.NVarChar, script)
        .input('created_by', sql.NVarChar, created_by || 'admin')
        .query(`INSERT INTO RemoteCommandScripts (id, name, description, script, created_by) VALUES (@id, @name, @description, @script, @created_by)`);
      res.json({ success: true, message: 'Script created' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/remote-commands/scripts/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request().input('id', sql.NVarChar, req.params.id).query('DELETE FROM RemoteCommandScripts WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper for remote command execution (DB-based polling â€” no WinRM needed)
async function executeRemoteCommand(targets, command, res) {
  if (!targets || !command || targets.length === 0) {
    return res.status(400).json({ error: 'Missing targets or command' });
  }

  const exec_id = `exec-${Date.now()}`;
  // Pre-populate logs with 'pending' so frontend shows devices immediately
  const execData = {
    exec_id,
    is_complete: false,
    logs: targets.map(t => ({ hostname: t.hostname, ip: t.ip, status: 'pending', log: '', updated_at: new Date().toISOString() }))
  };
  commandExecutions.set(exec_id, execData);

  try {
    res.json({ success: true, exec_id });

    // Insert pending commands into DB â€” agent will pick these up on next poll (â‰¤5 min)
    const pool = await poolPromise;
    for (const t of targets) {
      const cmdId = `cmd-${Date.now()}-${t.id}`;
      await pool.request()
        .input('id', sql.NVarChar, cmdId)
        .input('exec_id', sql.NVarChar, exec_id)
        .input('device_id', sql.NVarChar, t.id)
        .input('hostname', sql.NVarChar, t.hostname)
        .input('ip', sql.NVarChar, t.ip)
        .input('command', sql.NVarChar, command)
        .query(`
          INSERT INTO PendingCommands (id, exec_id, device_id, hostname, ip, command, status)
          VALUES (@id, @exec_id, @device_id, @hostname, @ip, @command, 'pending')
        `);
    }

    console.log(`[CMD] Queued ${targets.length} commands for exec_id=${exec_id}. Waiting for agents to poll.`);

    // Auto-cleanup after 30 minutes
    setTimeout(async () => {
      try {
        const p = await poolPromise;
        // Mark any still-pending commands as timed_out
        await p.request()
          .input('exec_id', sql.NVarChar, exec_id)
          .query("UPDATE PendingCommands SET status = 'timed_out' WHERE exec_id = @exec_id AND status = 'pending'");

        // Finalize execData for timed-out entries
        const execD = commandExecutions.get(exec_id);
        if (execD && !execD.is_complete) {
          execD.logs.forEach(l => { if (l.status === 'pending') { l.status = 'failed'; l.log = 'Timed out â€” agent did not respond within 30 minutes.'; } });
          execD.is_complete = true;
        }
      } catch (e) { /* silent */ }
    }, 30 * 60 * 1000);

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}

router.post('/api/remote-commands/run', async (req, res) => {
  const { device_ids, command, admin_user, admin_pass } = req.body;

  try {
    const pool = await poolPromise;
    // 1. Fetch devices to get IPs
    const result = await pool.request().query('SELECT id, hostname, ip FROM Devices');
    const allDevs = result.recordset;

    const targets = device_ids.map(id => {
      const dev = allDevs.find(d => d.id === id);
      return dev ? { id: dev.id, hostname: dev.hostname, ip: dev.ip } : null;
    }).filter(t => t !== null);

    if (targets.length === 0) return res.status(400).json({ error: 'No valid devices selected' });

    // 2. Execute directly
    await executeRemoteCommand(targets, command, res);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ AGENT REMOTE COMMANDS \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
const commandExecutions = new Map();

// \u2500€\u2500€ SQL EXPORT & SCHEDULES \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/sql/export', (req, res) => {
  const { results } = req.body;
  if (!results) return res.status(400).json({ error: 'No results to export' });

  // Simple CSV generation
  let csv = "Device ID,Hostname,IP,Status,Log/Error,Recordset JSON\n";
  for (const [did, data] of Object.entries(results)) {
    const row = [
      did,
      data.hostname || "",
      data.ip || "",
      data.status || "",
      (data.error || "").replace(/,/g, ";"),
      JSON.stringify(data.recordset || []).replace(/,/g, ";")
    ].join(",");
    csv += row + "\n";
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sql_export.csv');
  res.send(csv);
});

router.post('/api/sql/schedules', async (req, res) => {
  const { name, script, target_device_ids, next_run_at } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, `sqls-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('script', sql.NVarChar, script)
      .input('targets', sql.NVarChar, JSON.stringify(target_device_ids))
      .input('next_run', sql.DateTime, new Date(next_run_at))
      .query(`INSERT INTO RemoteSqlSchedules (id, name, script, target_device_ids, next_run_at) VALUES (@id, @name, @script, @targets, @next_run)`);
    res.json({ success: true, message: 'SQL Job scheduled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/remote-commands/schedules', async (req, res) => {
  const { name, script, target_device_ids, next_run_at } = req.body;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, `rcs-${Date.now()}`)
      .input('name', sql.NVarChar, name)
      .input('script', sql.NVarChar, script)
      .input('targets', sql.NVarChar, JSON.stringify(target_device_ids))
      .input('next_run', sql.DateTime, new Date(next_run_at))
      .query(`INSERT INTO RemoteCommandSchedules (id, name, script, target_device_ids, next_run_at) VALUES (@id, @name, @script, @targets, @next_run)`);
    res.json({ success: true, message: 'Command Job scheduled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remote pool manager to reuse connections
const remotePoolManager = {
  _pools: new Map(),
  async getPool(deviceId, config) {
    if (!this._pools.has(deviceId)) {
      const pool = new sql.ConnectionPool(config);
      await pool.connect();
      this._pools.set(deviceId, pool);
    }
    return this._pools.get(deviceId);
  }
};

async function sendWhatsapp(message, options = {}) {
  const { customTarget, customGroup } = options;
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.whatsapp_token) return;

    // Use custom overrides if provided, otherwise fallback to global settings
    const target = customTarget || settings.whatsapp_target;
    const group = customGroup || settings.whatsapp_group;

    const targets = Array.from(new Set(
      [target, group]
        .filter(Boolean)
        .map(t => t.trim())
    )).join(',');

    if (!targets) return;

    const payload = JSON.stringify({ token: settings.whatsapp_token, target: targets, message, countryCode: '62' });
    const requestOptions = {
      hostname: 'api.fonnte.com', path: '/send', method: 'POST',
      headers: { 'Authorization': settings.whatsapp_token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(requestOptions);
    req.on('error', (err) => { console.error('[WHATSAPP] Request Error:', err.message); });
    req.write(payload);
    req.end();
    console.log(`[WHATSAPP] Message sent to: ${targets}`);
  } catch (err) {
    console.error('[WHATSAPP] Error:', err.message);
  }
}

// \u2500€\u2500€ TRIAL: Dynamic Routing Endpoint \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/trial/test-routed-whatsapp', async (req, res) => {
  const { message, target, group } = req.body;
  if (!message) return res.status(400).json({ error: "Message is required" });

  try {
    await sendWhatsapp(message, { customTarget: target, customGroup: group });
    res.json({ success: true, message: `Trial notification sent to ${target || group || 'Default'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/agent/commands/execute', async (req, res) => {
  const { targets, command } = req.body;
  await executeRemoteCommand(targets, command, res);
});

router.get('/api/agent/commands/results', (req, res) => {
  const { exec_id } = req.query;
  const data = commandExecutions.get(exec_id);
  if (!data) return res.status(404).json({ error: 'Exec ID not found' });
  res.json(data);
});

// \u2500€\u2500€ OFFLINE DETECTOR (Background Loop) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€

async function sendWebhook(title, description, color = 0x5865F2) {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.webhook_url) return;

    const payload = JSON.stringify({
      embeds: [{ title, description, color, timestamp: getISOTimestamp() }]
    });
    const url = new URL(settings.webhook_url);
    const options = {
      hostname: url.hostname, path: url.pathname + url.search,
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options);
    req.on('error', () => { });
    req.write(payload);
    req.end();
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
  }
}



async function runOfflineDetector() {
  try {
    const pool = await initDb();
    if (!pool) return;

    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];
    if (!settings || !settings.alert_offline) return;

    const timeoutMins = settings.offline_timeout_mins || 10;

    // Ensure last_offline_alert_at column exists
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Devices' AND COLUMN_NAME='last_offline_alert_at')
        ALTER TABLE Devices ADD last_offline_alert_at DATETIME NULL
    `).catch(() => { });

    // 1. Get all devices AND all groups to verify status and context
    const devicesToCheckRes = await pool.request().query("SELECT id, hostname, ip, last_seen, status, last_offline_alert_at, group_ids FROM Devices");
    const devicesToCheck = devicesToCheckRes.recordset || [];

    const groupsRes = await pool.request().query("SELECT id, name FROM DeviceGroups");
    const groupsMap = (groupsRes.recordset || []).reduce((acc, g) => {
      acc[g.id] = g.name.toLowerCase();
      return acc;
    }, {});

    const now = new Date();
    const currentHour = now.getHours();
    const isLateNight = currentHour >= 23 || currentHour < 7;

    let newlyOffline = [];

    // 2. Perform Ping-Check and Heartbeat-Check
    for (const dev of devicesToCheck) {
      let isHeartbeatStale = false;
      if (dev.last_seen) {
        let lastSeenDate;
        if (dev.last_seen instanceof Date) {
          lastSeenDate = dev.last_seen;
        } else {
          lastSeenDate = new Date(dev.last_seen);
        }

        if (!isNaN(lastSeenDate.getTime())) {
          const diffMins = (now - lastSeenDate) / (1000 * 60);
          if (diffMins > timeoutMins) isHeartbeatStale = true;
        } else {
          isHeartbeatStale = true;
        }
      } else {
        isHeartbeatStale = true;
      }

      // Proactive Ping Check (Only if heartbeat is stale)
      let isPingFailing = false;
      const canPing = dev.ip && dev.ip !== 'Unknown' && dev.ip !== '127.0.0.1' && !dev.ip.startsWith('169.');

      if (isHeartbeatStale && canPing) {
        try {
          const { stdout } = await execPromise(`ping -n 3 -w 1000 ${dev.ip}`);
          if (!stdout.includes("TTL=")) {
            isPingFailing = true;
          } else {
            // Ping Success logic: RECOVERY
            if (dev.status === 'offline') {
              const recRes = await pool.request()
                .input('id', sql.NVarChar, dev.id)
                .query("UPDATE Devices SET status = 'online', last_offline_alert_at = NULL WHERE id = @id AND status = 'offline'");

              if (recRes.rowsAffected[0] > 0) {
                console.log(`[DETECTOR] Device ${dev.hostname} RECOVERED (Ping Success)`);
              }
            }
            // If it responds to ping, it is NOT failing
            isPingFailing = false;
          }
        } catch (e) {
          isPingFailing = true;
        }
      }

      // OFFLINE RULE: Stale AND Ping Fails
      if (isHeartbeatStale && isPingFailing) {
        if (dev.status === 'online') {
          // 1. Calculate Priority (Server/Network/Router groups)
          const gids = (dev.group_ids || "").split(',').map((s) => s.trim());
          const isPriority = gids.some((gid) => {
            if (gid === 'g2') return true; // Default Servers ID
            const gName = groupsMap[gid] || "";
            return gName.includes('server') || gName.includes('network') || gName.includes('router');
          });

          // 2. ALWAYS Update DB status to Offline for Dashboard visibility
          // BUT only set the alert timestamp if it's a priority device.
          // Atomic Check: only proceed if status is still 'online'
          const updateQuery = isPriority
            ? "UPDATE Devices SET status = 'offline', last_offline_alert_at = @now WHERE id = @id AND status = 'online'"
            : "UPDATE Devices SET status = 'offline' WHERE id = @id AND status = 'online'";

          const offUpdateRes = await pool.request()
            .input('id', sql.NVarChar, dev.id)
            .input('now', sql.DateTime, now)
            .query(updateQuery);

          // 3. ONLY add to notification list if Priority AND we were the one who updated it
          if (isPriority && offUpdateRes.rowsAffected[0] > 0) {
            newlyOffline.push({ ...dev, alertNeeded: true, reason: "Heartbeat Stale & Ping Fail" });
          } else if (isPriority) {
            // Already handled by another process
          } else {
            console.log(`[DETECTOR] Silent offline (non-priority device) for: ${dev.hostname}`);
          }
        }
      }

      // Small pause to prevent terminal spamming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 3. LOG newly offline devices to ActivityLog (Only for those in newlyOffline)
    for (const dev of newlyOffline) {
      const ts = getCurrentTimeHHMM();
      await pool.request()
        .input('time', sql.NVarChar, ts).input('user', sql.NVarChar, 'system')
        .input('action', sql.NVarChar, `\u26A0\uFE0F Device offline (${dev.reason}): ${dev.hostname} (${dev.ip})`)
        .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @user, @action)")
        .catch(() => { });
    }

    // 4. Recovery Detection: Find devices that were offline but are now responding
    // Fetch and filter in JS to avoid SQL conversion issues with different locale settings
    const allRecoverable = await pool.request().query(`
      SELECT id, hostname, ip, last_seen, status, last_offline_alert_at, group_ids 
      FROM Devices 
      WHERE (status = 'offline' OR last_offline_alert_at IS NOT NULL)
        AND last_seen IS NOT NULL
    `);

    // const now is already declared at the top of the function
    const recovered = (allRecoverable.recordset || []).filter(dev => {
      let lastSeenDate;
      if (dev.last_seen instanceof Date) {
        lastSeenDate = dev.last_seen;
      } else {
        lastSeenDate = new Date(dev.last_seen);
      }

      if (isNaN(lastSeenDate.getTime())) return false;
      const diffMins = (now - lastSeenDate) / (1000 * 60);
      return diffMins <= timeoutMins;
    });

    if (recovered.length > 0) {
      const actualRecovered = [];

      for (const dev of recovered) {
        // Atomic Update: Only process if the device is still recorded as 'offline' or has a pending alert
        // This prevents multiple processes from sending the same recovery notification.
        const updateRes = await pool.request()
          .input('id', sql.NVarChar, dev.id)
          .query("UPDATE Devices SET status = 'online', last_offline_alert_at = NULL WHERE id = @id AND (status = 'offline' OR last_offline_alert_at IS NOT NULL)");

        if (updateRes.rowsAffected[0] === 0) {
          // Another process already recovered this device
          continue;
        }

        const ts = getCurrentTimeHHMM();
        await pool.request()
          .input('time', sql.NVarChar, ts).input('user', sql.NVarChar, 'system')
          .input('action', sql.NVarChar, `\u2705 Device recovered: ${dev.hostname} (${dev.ip})`)
          .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @user, @action)")
          .catch(() => { });

        // Calculate Priority (Server/Network/Router groups) to decide if we send notification
        const gids = (dev.group_ids || "").split(',').map((s) => s.trim());
        const isPriority = gids.some((gid) => {
          if (gid === 'g2') return true; // Default Servers ID
          const gName = groupsMap[gid] || "";
          return gName.includes('server') || gName.includes('network') || gName.includes('router');
        });

        // Add to list of devices that were actually recovered by THIS process for notification
        if (isPriority) {
          actualRecovered.push(dev);
        }
      }

      if (actualRecovered.length > 0) {
        let recoveryWA = `\u2705 *NET RECOVERY: ${actualRecovered.length} DEVICES ONLINE*\n`;
        for (const dev of actualRecovered) {
          let durationStr = "";
          if (dev.last_offline_alert_at) {
            const diffMs = now - new Date(dev.last_offline_alert_at);
            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            durationStr = ` (Down: ${diffHrs}h ${diffMins}m)`;
          }
          recoveryWA += `- *${dev.hostname}* (${dev.ip})${durationStr}\n`;
        }

        console.log(`[NOTIF] Sending recovery summary for ${actualRecovered.length} devices.`);
        await sendWebhook(`\u2705 Network Recovery Report`, recoveryWA.replace(/\*/g, '**'), 0x22c55e);
        await sendWhatsapp(recoveryWA);
      }
    }

    // 5. Send Notification if we caught NEW offline devices
    if (newlyOffline.length > 0) {


      // Fetch ALL currently offline devices to provide full context (the "7 devices" requested)
      const allOfflineRes = await pool.request().query("SELECT hostname, ip, last_seen FROM Devices WHERE status = 'offline'");
      const allOffline = allOfflineRes.recordset || [];

      let summaryWA = `\uD83D\uDEA8 *NETWORK ALERT: ${newlyOffline.length} NEW OFFLINE*\n`;
      summaryWA += `Total currently offline: *${allOffline.length} devices*\n\n`;

      summaryWA += `*Detected Just Now:*\n`;
      newlyOffline.forEach(d => {
        summaryWA += `- *${d.hostname}* (${d.ip}) | ${d.reason}\n`;
      });

      if (allOffline.length > newlyOffline.length) {
        summaryWA += `\n*Also Currently Offline:*\n`;
        const others = allOffline.filter(a => !newlyOffline.find(n => n.hostname === a.hostname));
        others.forEach(d => {
          summaryWA += `- ${d.hostname} (${d.ip})\n`;
        });
      }

      const summaryDiscord = summaryWA.replace(/\*/g, '**');

      console.log(`[NOTIF] Sending summary alert for ${allOffline.length} total offline devices.`);
      await sendWebhook(`\uD83D\uDEA8 Network Connectivity Report`, summaryDiscord, 0xef4444);
      await sendWhatsapp(summaryWA);
    }
  } catch (err) {
    console.error('\u26A0\uFE0F Offline detector error:', err.message);
  }
}

router.get('/api/devices/offline-summary', async (req, res) => {
  try {
    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT offline_timeout_mins FROM NotificationSettings WHERE id = 'global'");
    const timeoutMins = settingsRes.recordset[0]?.offline_timeout_mins || 30;
    const result = await pool.request()
      .input('timeout', sql.Int, timeoutMins)
      .query(`
        SELECT id, hostname, ip, last_seen, status,
          DATEDIFF(MINUTE, CAST(last_seen AS DATETIME2), GETDATE()) AS minutes_since_seen
        FROM Devices WHERE last_seen IS NOT NULL AND ISDATE(last_seen) = 1
        ORDER BY minutes_since_seen DESC
      `);
    res.json(result.recordset.map(d => ({ ...d, is_offline: d.minutes_since_seen > timeoutMins })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ WEEKLY REPORT PDF GENERATOR \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
async function generateWeeklyReportPDF(options = {}) {
  const { customTarget, customGroup } = options;
  console.log('[REPORT] V2 - Generating Automated Weekly Report PDF...');
  try {
    const pool = await poolPromise;
    if (!pool) return;

    // 1. Gather Stats
    const totalDevices = (await pool.request().query("SELECT COUNT(*) as count FROM Devices")).recordset[0].count;
    const offlineDevices = (await pool.request().query("SELECT COUNT(*) as count FROM Devices WHERE status = 'offline'")).recordset[0].count;
    const uptime = totalDevices > 0 ? (((totalDevices - offlineDevices) / totalDevices) * 100).toFixed(1) : 0;

    // Top problematic devices (from ActivityLog)
    const problematicRes = await pool.request().query(`
      SELECT TOP 5 action, COUNT(*) as fail_count 
      FROM ActivityLog 
      WHERE action LIKE '%offline%'
      GROUP BY action ORDER BY fail_count DESC
    `);

    // 1.5. Gather Ticket Stats (Last 7 Days)
    const ticketStatsRes = await pool.request().query(`
      SELECT status, COUNT(*) as count 
      FROM TroubleTickets 
      WHERE created_at >= DATEADD(day, -7, GETDATE())
      GROUP BY status
    `);
    const ticketSummary = {
      Total: 0,
      Open: 0,
      'In Progress': 0,
      Resolved: 0,
      Closed: 0
    };
    ticketStatsRes.recordset.forEach(row => {
      ticketSummary.Total += row.count;
      if (ticketSummary.hasOwnProperty(row.status)) {
        ticketSummary[row.status] = row.count;
      }
    });

    // 2. Create PDF
    const reportsDir = path.join(__dirname, 'reports', 'weekly');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

    const fileName = `weekly-report-${new Date().toISOString().split('T')[0]}.pdf`;
    const filePath = path.join(reportsDir, fileName);
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('NETWORK WEEKLY SUMMARY', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Stats Section
    doc.fontSize(16).fillColor('#3b82f6').font('Helvetica-Bold').text('System Health Overview');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#000000').font('Helvetica');
    doc.text(`\u2022 Overall Uptime: ${uptime}%`);
    doc.text(`\u2022 Total Monitored Devices: ${totalDevices}`);
    doc.text(`\u2022 Currently Offline: ${offlineDevices}`);
    doc.moveDown();

    // Problematic Stores
    if (problematicRes.recordset.length > 0) {
      doc.fontSize(16).fillColor('#ef4444').font('Helvetica-Bold').text('Top 5 Problematic Assets (Last 7 Days)');
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#000000').font('Helvetica');
      problematicRes.recordset.forEach((row, i) => {
        doc.text(`${i + 1}. ${row.action.split(':')[1]?.trim() || row.action} (${row.fail_count} incidents)`);
      });
      doc.moveDown();
    }

    // Ticket Summary Section
    doc.fontSize(16).fillColor('#8b5cf6').font('Helvetica-Bold').text('Helpdesk Ticket Summary (Last 7 Days)');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#000000').font('Helvetica');
    doc.text(`\u2022 Total Tickets Created: ${ticketSummary.Total}`);
    doc.text(`\u2022 Open: ${ticketSummary.Open}`);
    doc.text(`\u2022 In Progress: ${ticketSummary['In Progress']}`);
    doc.text(`\u2022 Resolved: ${ticketSummary.Resolved}`);
    doc.text(`\u2022 Closed: ${ticketSummary.Closed}`);
    doc.moveDown();

    doc.end();

    stream.on('finish', async () => {
      console.log(`[REPORT] Weekly PDF saved: ${filePath}`);
      const summary = `\uD83D\uDCCA *WEEKLY SYSTEM REPORT IS READY*\n` +
        `Period: Last 7 Days\n` +
        `Avg Uptime: *${uptime}%*\n` +
        `Total Devices: ${totalDevices}\n` +
        `Critical Incidents: ${problematicRes.recordset.length}\n\n` +
        `\uD83C\uDFAB\uFE0F *Helpdesk Tickets (7d):*\n` +
        `- Created: ${ticketSummary.Total}\n` +
        `- Resolved/Closed: ${ticketSummary.Resolved + ticketSummary.Closed}\n` +
        `- Active (Open/IP): ${ticketSummary.Open + ticketSummary['In Progress']}\n\n` +
        `_Weekly PDF has been archived on the server._`;

      await sendWebhook(`\uD83D\uDCCA Weekly Performance Report`, summary.replace(/\*/g, '**'), 0x3b82f6);
      await sendWhatsapp(summary, { customTarget, customGroup });
    });
  } catch (err) {
    console.error('\u26A0\uFE0F Weekly report error:', err.message);
  }
}

// Schedule Cron: Every Sunday at 00:00
// Weekly cron disabled in favor of Dynamic Scheduler

// Manual trigger API (for testing)
router.post('/api/reports/trigger-weekly', async (req, res) => {
  await generateWeeklyReportPDF();
  res.json({ message: "Weekly report generation triggered." });
});

/**
 * Daily Outstanding Ticket + CRM Sync Notification
 * Summarizes tickets that are not Closed/Resolved and shows progress %.
 * Also includes LOYAL_CRM_ITEM_MST sync status from HOSERVER.
 */
async function sendDailyOutstandingTicketsNotification(options = {}) {
  const isManual = options.isManual || false;
  const { customTarget, customGroup } = options;
  console.log('[REPORT] Generating Daily Outstanding Ticket + CRM Sync Notification...');
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    const pool = await poolPromise;
    if (!pool) return;

    if (!isManual) {
      // 1. Database-backed Deduplication: Check if already sent today across ANY process
      const settingsCheck = await pool.request().query("SELECT last_daily_report_date FROM NotificationSettings WHERE id = 'global'");
      const lastSentDate = settingsCheck.recordset[0]?.last_daily_report_date;

      if (lastSentDate === todayStr) {
        console.log('[REPORT] Daily ticket notification already sent today (DB check).');
        return;
      }

      // 2. Atomic Reservation: Mark as sent BEFORE proceeding to prevent race conditions
      // If multiple processes hit this at 08:00:00, only one will successfully update if we use a strict WHERE
      const reserveRes = await pool.request()
        .input('today', sql.NVarChar, todayStr)
        .query("UPDATE NotificationSettings SET last_daily_report_date = @today WHERE id = 'global' AND (last_daily_report_date IS NULL OR last_daily_report_date <> @today)");

      if (reserveRes.rowsAffected[0] === 0) {
        console.log('[REPORT] Daily ticket notification just claimed by another process.');
        return;
      }
    }

    // 1. Fetch Outstanding Tickets
    const ticketsRes = await pool.request().query(`
      SELECT id, title, status, outlet_name, assigned_to, hostname as manual_hostnames
      FROM TroubleTickets
      WHERE status NOT IN ('Closed', 'Resolved')
      ORDER BY 
        CASE 
          WHEN status = 'Open' THEN 1
          WHEN status = 'In Progress' THEN 2
          ELSE 3
        END ASC, created_at DESC
    `);
    const tickets = ticketsRes.recordset;

    // 2. Fetch all components to calculate progress in memory
    const allTargetsRes = await pool.request().query('SELECT ticket_id, hostname, status FROM TicketTargets');
    const allTargets = allTargetsRes.recordset;

    const allLinkedGroupsRes = await pool.request().query('SELECT ticket_id, group_id FROM TicketGroups');
    const allLinkedGroups = allLinkedGroupsRes.recordset;

    const devicesRes = await pool.request().query('SELECT hostname, group_ids FROM Devices');
    const allDevices = devicesRes.recordset;

    let summary = `\uD83C\uDFAB\uFE0F *DAILY OUTSTANDING TICKETS SUMMARY*\n`;
    summary += `_Date: ${new Date().toLocaleDateString('id-ID')}_\n\n`;

    for (const ticket of tickets) {
      // Resolve Manual Targets
      const manualHosts = (ticket.manual_hostnames || '')
        .split(',')
        .map(h => h.trim())
        .filter(h => h.length > 0);

      // Resolve Group Targets
      const linkedGroupIds = allLinkedGroups
        .filter(tg => tg.ticket_id === ticket.id)
        .map(tg => tg.group_id);

      const groupHosts = allDevices.filter(dev => {
        if (!dev.group_ids) return false;
        const gids = dev.group_ids.split(',');
        return linkedGroupIds.some(gid => gids.includes(gid));
      }).map(dev => dev.hostname);

      // Unique set of all targets
      const totalTargets = Array.from(new Set([...manualHosts, ...groupHosts]));

      let progress = 0;
      if (totalTargets.length > 0) {
        const solvedCount = allTargets.filter(t =>
          t.ticket_id === ticket.id &&
          totalTargets.includes(t.hostname) &&
          t.status === 'Solved'
        ).length;
        progress = Math.round((solvedCount / totalTargets.length) * 100);
      } else {
        // If no targets defined, use status-based simple progression if In Progress
        progress = ticket.status === 'In Progress' ? 50 : 0;
      }

      const statusEmoji = ticket.status === 'In Progress' ? 'ðŸš§' : 'ðŸ“‹';
      summary += `${statusEmoji} *[${ticket.id}]* ${ticket.title}\n`;
      summary += `   \u2022 Status: _${ticket.status}_\n`;
      summary += `   \u2022 Progress: *${progress}%*\n`;
      summary += `   \u2022 Assigned To: ${ticket.assigned_to || '*Unassigned*'}\n`;
      if (ticket.outlet_name) summary += `   \u2022 Outlet: ${ticket.outlet_name}\n`;
      summary += `\n`;
    }

    if (tickets.length === 0) {
      summary += `\u2705 Tidak ada ticket yang outstanding saat ini.\n\n`;
    }

    // \u2500€\u2500€ 3. LOYAL CRM SYNC STATUS (HOSERVER) â€” 2 Hari \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
    try {
      const hoDevRes = await pool.request()
        .input('hostname', sql.NVarChar, 'HOSERVER')
        .query('SELECT id, ip FROM Devices WHERE hostname = @hostname');

      if (hoDevRes.recordset.length > 0) {
        const { id: hoDeviceId, ip: hoIp } = hoDevRes.recordset[0];
        const hoConnRes = await pool.request()
          .input('did', sql.NVarChar, hoDeviceId)
          .query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');

        if (hoConnRes.recordset.length > 0) {
          const hoConn = hoConnRes.recordset[0];
          const hoPool = new sql.ConnectionPool({
            user: hoConn.db_user,
            password: hoConn.db_password,
            server: hoIp,
            database: hoConn.db_name,
            options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
            connectionTimeout: 10000,
            requestTimeout: 15000
          });
          await hoPool.connect();

          const crmRes = await hoPool.request().query(`
            SELECT
              CONVERT(date, last_timestamp) as sync_date,
              SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced_count,
              SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending_count,
              MAX(CASE WHEN ISNULL(is_sync, '0') <> '1' AND ISNULL(response_msg, '') <> '' THEN response_msg ELSE NULL END) as sample_error
            FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
            WHERE CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -1, GETDATE()))
            GROUP BY CONVERT(date, last_timestamp)
            ORDER BY sync_date DESC
          `);
          await hoPool.close();

          summary += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
          summary += `\uD83D\uDD04 *LOYAL CRM ITEM SYNC (HOSERVER VS LOYAL CRM)*\n`;

          const todayDate = new Date().toDateString();
          for (const row of crmRes.recordset) {
            const rowDate = new Date(row.sync_date);
            const dayLabel = rowDate.toDateString() === todayDate ? 'today' : 'yesterday';
            const synced = row.synced_count || 0;
            const pending = row.pending_count || 0;
            const total = synced + pending;
            const pct = total > 0 ? Math.round((synced / total) * 100) : 0;
            const emoji = pending === 0 ? '\u2705' : (pending > 5 ? '\uD83D\uDD34' : '\u26A0\uFE0F');

            summary += `\n${emoji} *${dayLabel}* (${rowDate.toLocaleDateString('id-ID')})\n`;
            summary += `   \u2022 Sync Success : *${synced}* / ${total} (${pct}%)\n`;
            summary += `   \u2022 Pending/Failed : *${pending}*\n`;
            if (row.sample_error) {
              summary += `   \u26A0\uFE0F Error: _${String(row.sample_error).substring(0, 100)}_\n`;
            }
          }

          if (crmRes.recordset.length === 0) {
            summary += `\n_No CRM sync data for the last 2 days._\n`;
          }
          summary += `\n`;
        }
      }
    } catch (crmErr) {
      console.error('[REPORT] CRM Sync section error (non-fatal):', crmErr.message);
      summary += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
      summary += `\u26A0\uFE0F *LOYAL CRM SYNC*: Data tidak tersedia.\n\n`;
    }

    // \u2500€\u2500€ 3.5 CRM FRAUD ANALYSIS (YESTERDAY) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
    try {
      const crmPool = await getCrmPool();
      const fraudRes = await crmPool.request().query(`
        WITH DailyCounts AS (
            SELECT 
                q.RLITQ_CARD_NO as card_no,
                MAX(m.RLICM_NAME) as cust_name,
                CAST(h.BILL_DT AS DATE) as trx_date,
                COUNT(q.RLITQ_BILL_NO) as daily_trx_count,
                MAX(q.RLITQ_ORG_CD) as org_cd,
                MAX(d.ORG_NAME) as store_name,
                MAX(h.COUNTER_NO) as counter_no,
                MAX(h.SESSION_NO) as session_no,
                MAX(h.SALESMAN_ID_SEC) as salesman_id
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE q (NOLOCK)
            JOIN POS_SALES_HDR h (NOLOCK) ON q.RLITQ_BILL_NO = h.BILL_NO AND q.RLITQ_ORG_CD = h.ORG_CD
            LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST m (NOLOCK) ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
            LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
            WHERE CAST(h.BILL_DT AS DATE) >= CAST(DATEADD(day, -7, GETDATE()) AS DATE)
            GROUP BY q.RLITQ_CARD_NO, CAST(h.BILL_DT AS DATE)
            HAVING COUNT(q.RLITQ_BILL_NO) >= 3
               AND COUNT(DISTINCT h.COUNTER_NO) = 1
               AND COUNT(DISTINCT h.SESSION_NO) = 1
        ),
        ConsecutiveLag AS (
            SELECT 
                card_no, cust_name, org_cd, store_name,
                trx_date as latest_date,
                LAG(trx_date) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_date,
                daily_trx_count as latest_count, 
                LAG(daily_trx_count) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_count,
                salesman_id as latest_salesman,
                LAG(salesman_id) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_salesman
            FROM DailyCounts
        ),
        ConsecutiveCheck AS (
            SELECT *
            FROM ConsecutiveLag 
            WHERE DATEDIFF(day, prev_date, latest_date) = 1
              AND prev_salesman = latest_salesman
              AND latest_date = CAST(DATEADD(day, -1, GETDATE()) AS DATE)
        )
        SELECT * FROM ConsecutiveCheck
        ORDER BY latest_count DESC
      `);

      if (fraudRes.recordset.length > 0) {
        summary += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
        summary += `\uD83D\uDEA8 *CRM FRAUD ANALYSIS: Suspicious Activity Detected*\n`;
        summary += `_Kriteria: >=3 trx/hari selama 2 hari berturut-turut (Sesi & Salesman sama)_\n\n`;

        for (const row of fraudRes.recordset) {
          summary += `\uD83D\uDC64 *${row.cust_name || 'Unknown Member'}*\n`;
          summary += `ðŸ’³ No Kartu: ${row.card_no}\n`;
          summary += `ðŸª Store: (${row.org_cd}) ${row.store_name}\n`;
          const prevD = new Date(row.prev_date).toLocaleDateString('id-ID');
          const lateD = new Date(row.latest_date).toLocaleDateString('id-ID');
          summary += `\uD83D\uDCC5 Periode: ${prevD} s/d ${lateD}\n`;
          summary += `\uD83D\uDCCA Trx: *${row.prev_count} trx* & *${row.latest_count} trx*\n\n`;
        }
      }
    } catch (fraudErr) {
      console.error('[REPORT] CRM Fraud Analysis error (non-fatal):', fraudErr.message);
    }

    summary += `_Pantau lebih lanjut di https://192.168.85.30:3002_`;

    // 4. Send Notifications
    await sendWebhook(`\uD83C\uDFAB\uFE0F Daily Ticket & CRM Summary`, summary.replace(/\*/g, '**'), 0x8b5cf6);
    await sendWhatsapp(summary, { customTarget, customGroup });

    console.log('[REPORT] Daily ticket + CRM notification sent.');

  } catch (err) {
    console.error('\u26A0\uFE0F Daily ticket report error:', err.message);
  }
}

// Original static daily schedule (08:00) - Disabled in favor of Dynamic Scheduler
/*
cron.schedule('0 8 * * *', () => {
  sendDailyOutstandingTicketsNotification({ isManual: false });
});
*/

// Manual trigger for testing
router.post('/api/reports/trigger-daily-tickets', async (req, res) => {
  await sendDailyOutstandingTicketsNotification({ isManual: true });
  res.json({ message: "Daily ticket notification triggered manually." });
});

// Serve Weekly Reports Folder
router.use('/reports/weekly', express.static(path.join(__dirname, 'reports', 'weekly')));

// \u2500€\u2500€ WORKFLOW KNOWLEDGE BASE \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/workflows', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT id, title, category, file_name, created_by, created_at, updated_at FROM Workflows ORDER BY category, title");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categories for UI filtering
router.get('/api/workflows/categories', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT DISTINCT category FROM Workflows WHERE category IS NOT NULL ORDER BY category");
    res.json(result.recordset.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific workflow details
router.get('/api/workflows/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query("SELECT * FROM Workflows WHERE id = @id");
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.status(404).json({ error: "Workflow not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download Workflow File
router.get('/api/workflows/:id/download', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.NVarChar, req.params.id).query("SELECT file_name, file_path FROM Workflows WHERE id = @id");
    if (!result.recordset[0] || !result.recordset[0].file_path) return res.status(404).send('File not found');

    const filePath = path.resolve(result.recordset[0].file_path);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found on disk');

    res.download(filePath, result.recordset[0].file_name);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// View Workflow File (Inline)
router.get('/api/workflows/:id/view', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.NVarChar, req.params.id).query("SELECT file_name, file_path FROM Workflows WHERE id = @id");
    if (!result.recordset[0] || !result.recordset[0].file_path) return res.status(404).send('File not found');

    const filePath = path.resolve(result.recordset[0].file_path);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found on disk');

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/api/workflows/upload', workflowUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    let extractedText = "";
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: req.file.path });
      extractedText = result.value;
    } else if (ext === '.txt') {
      extractedText = fs.readFileSync(req.file.path, 'utf8');
    } else if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfResult = await pdfParse(dataBuffer);
      extractedText = pdfResult.text;
    } else {
      extractedText = `File ${req.file.originalname} uploaded, but auto-text extraction is not supported for this format.`;
    }

    res.json({
      text: extractedText,
      fileName: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, '/')
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to parse file: " + err.message });
  }
});

router.post('/api/workflows', async (req, res) => {
  const { id, title, content, category, created_by, fileName, filePath, userId: bodyUid } = req.body;
  const uid = req.headers['x-user-id'] || bodyUid;

  try {
    const pool = await poolPromise;
    // Admin Check
    const userRes = await pool.request().input('uid', sql.NVarChar, uid).query("SELECT r.is_admin FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid");
    if (!userRes.recordset[0]?.is_admin) return res.status(403).json({ error: "Only admins can create instructions" });

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content)
      .input('category', sql.NVarChar, category)
      .input('fname', sql.NVarChar, fileName || null)
      .input('fpath', sql.NVarChar, filePath || null)
      .input('created_by', sql.NVarChar, created_by)
      .query(`
        INSERT INTO Workflows (id, title, content, category, file_name, file_path, created_by, created_at, updated_at)
        VALUES (@id, @title, @content, @category, @fname, @fpath, @created_by, GETDATE(), GETDATE())
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/workflows/:id', async (req, res) => {
  const { title, content, category, fileName, filePath, userId: bodyUid } = req.body;
  const uid = req.headers['x-user-id'] || bodyUid;

  try {
    const pool = await poolPromise;
    // Admin Check
    const userRes = await pool.request().input('uid', sql.NVarChar, uid).query("SELECT r.is_admin FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid");
    if (!userRes.recordset[0]?.is_admin) return res.status(403).json({ error: "Only admins can edit instructions" });

    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content)
      .input('category', sql.NVarChar, category)
      .input('fname', sql.NVarChar, fileName || null)
      .input('fpath', sql.NVarChar, filePath || null)
      .query(`
        UPDATE Workflows 
        SET title = @title, content = @content, category = @category, 
            file_name = COALESCE(@fname, file_name), 
            file_path = COALESCE(@fpath, file_path),
            updated_at = GETDATE()
        WHERE id = @id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/workflows/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, req.params.id)
      .query("DELETE FROM Workflows WHERE id = @id");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ AI SMART ASSISTANT (Groq Llama) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
function normalizeAssistantKeywordText(value = '') {
  return value.toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

const ASSISTANT_RESERVED_ARGS = ['host', 'hostname', 'target_host', 'confirm'];
const ASSISTANT_TARGET_HOST_PLACEHOLDER = 'isi host tetap, atau kosongkan lalu pakai host=HOST01 saat runtime';

function parseAssistantKeywordArgs(input = '') {
  const args = {};
  let remaining = input;
  const regex = /(\w+)=("([^"]*)"|'([^']*)'|[^\s]+)/g;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const key = match[1];
    const value = match[3] ?? match[4] ?? match[2] ?? '';
    args[key] = value.replace(/^['"]|['"]$/g, '');
    remaining = remaining.replace(match[0], ' ');
  }

  const freeText = remaining.trim().replace(/\s+/g, ' ');
  if (freeText && !args.query) {
    args.query = freeText;
  }

  return args;
}

function parseKeywordParameterKeys(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => item?.toString().trim()).filter((item) => item && !ASSISTANT_RESERVED_ARGS.includes(item.toLowerCase())))];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.map((item) => item?.toString().trim()).filter((item) => item && !ASSISTANT_RESERVED_ARGS.includes(item.toLowerCase())))]
      : [];
  } catch {
    return [];
  }
}

function sanitizeKeywordTargetHost(value) {
  const normalized = (value || '').toString().trim();
  if (!normalized) return '';
  if (normalized.toLowerCase() === ASSISTANT_TARGET_HOST_PLACEHOLDER.toLowerCase()) return '';
  return normalized;
}

function buildMissingParameterPrompt(keyword, missingParameters, args = {}) {
  const examples = missingParameters.map((key) => `${key}=...`).join(' ');
  const hostHint = !sanitizeKeywordTargetHost(keyword.target_host) && !args.host && !args.hostname && !args.target_host
    ? '\nJika keyword ini memakai database host tertentu, tambahkan juga `host=HOSTNAME` atau `hostname=HOSTNAME`.'
    : '';

  return `Keyword \`${keyword.keyword}\` membutuhkan parameter berikut: ${missingParameters.join(', ')}.\n\nSilakan kirim ulang dengan format seperti:\n\`${keyword.keyword} ${examples}\`${hostHint}`;
}

function applyKeywordParameters(request, args, parameterKeys) {
  parameterKeys.forEach((key) => {
    const rawValue = args[key];
    if (rawValue === undefined) return;

    if (/^(true|false)$/i.test(rawValue)) {
      request.input(key, sql.Bit, /^true$/i.test(rawValue) ? 1 : 0);
      return;
    }

    if (/^-?\d+$/.test(rawValue)) {
      request.input(key, sql.Int, parseInt(rawValue, 10));
      return;
    }

    if (/^-?\d+\.\d+$/.test(rawValue)) {
      request.input(key, sql.Float, parseFloat(rawValue));
      return;
    }

    request.input(key, sql.NVarChar, rawValue);
  });
}

function formatKeywordRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "Tidak ada data ditemukan untuk keyword ini.";
  }

  const sampleRows = rows.slice(0, 10);
  const columns = Object.keys(sampleRows[0] || {}).slice(0, 6);
  if (columns.length === 0) {
    return `Keyword berhasil dijalankan. Total ${rows.length} baris ditemukan.`;
  }

  const header = `| ${columns.join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = sampleRows.map((row) => `| ${columns.map((column) => String(row[column] ?? '-').replace(/\|/g, '\\|')).join(' | ')} |`);
  const note = rows.length > sampleRows.length ? `\n\nMenampilkan ${sampleRows.length} dari ${rows.length} baris.` : `\n\nTotal ${rows.length} baris.`;
  return [header, separator, ...body].join('\n') + note;
}

async function executeKeywordSql(pool, keyword, args) {
  const parameterKeys = parseKeywordParameterKeys(keyword.parameter_keys);
  
  // Case-insensitive parameter matching
  const caseInsensitiveMissingParameters = parameterKeys.filter((key) => {
    // Check exact match first
    if (args[key] !== undefined) return false;
    
    // Check case-insensitive match
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(args).find(argKey => argKey.toLowerCase() === lowerKey);
    if (foundKey !== undefined) {
      // Copy the value to the expected key name for backward compatibility
      args[key] = args[foundKey];
      return false;
    }
    
    return true; // Parameter is truly missing
  });
  
  if (caseInsensitiveMissingParameters.length > 0) {
    return {
      handled: true,
      text: buildMissingParameterPrompt(keyword, caseInsensitiveMissingParameters, args),
      sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Missing required parameters' }],
      form: {
        keywordId: keyword.id,
        keyword: keyword.keyword,
        description: keyword.description || '',
        parameter_keys: caseInsensitiveMissingParameters,
        requires_confirmation: keyword.requires_confirmation === true || keyword.requires_confirmation === 1,
        target_host: keyword.target_host || ''
      }
    };
  }

  const isReadOnly = keyword.action_type === 'query'
    ? /^\s*select\b/i.test(keyword.script_text) && !/\b(delete|update|drop|truncate|alter|insert|merge|exec)\b/i.test(keyword.script_text)
    : true;

  if (keyword.action_type === 'query' && !isReadOnly) {
    return {
      handled: true,
      text: `Keyword \`${keyword.keyword}\` ditolak karena script query tidak terbaca sebagai SELECT read-only.`,
      sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Rejected non read-only query' }]
    };
  }

  const buildRequest = (request) => {
    applyKeywordParameters(request, args, parameterKeys);
    return request;
  };

  const runtimeHost = (args.target_host || args.hostname || args.host || '').toString().trim();
  const resolvedTargetHost = sanitizeKeywordTargetHost(keyword.target_host || runtimeHost || '');

  if (!resolvedTargetHost) {
    return {
      handled: true,
      text: `Keyword \`${keyword.keyword}\` membutuhkan Target Host sebelum dieksekusi. Silakan pilih target host di bawah atau jalankan kembali dengan parameter \`host=HOSTNAME\`.`,
      sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Target host required' }],
      form: {
        keywordId: keyword.id,
        keyword: keyword.keyword,
        description: keyword.description || '',
        parameter_keys: parameterKeys,
        requires_confirmation: keyword.requires_confirmation === true || keyword.requires_confirmation === 1,
        target_host: ''
      }
    };
  }

  if (resolvedTargetHost) {
    const hostRes = await pool.request()
      .input('name', sql.NVarChar, resolvedTargetHost)
      .query("SELECT id, ip FROM Devices WHERE hostname = @name");
    const target = hostRes.recordset[0];
    if (!target) {
      return {
        handled: true,
        text: `Target host \`${resolvedTargetHost}\` untuk keyword \`${keyword.keyword}\` tidak ditemukan.`,
        sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Target host not found' }]
      };
    }

    const connRes = await pool.request()
      .input('did', sql.NVarChar, target.id)
      .query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
    const conn = connRes.recordset[0];
    if (!conn) {
      return {
        handled: true,
        text: `Kredensial database untuk host \`${resolvedTargetHost}\` belum dikonfigurasi.`,
        sources: [{ type: 'keyword', label: keyword.keyword, detail: 'Missing remote DB credentials' }]
      };
    }

    const config = {
      user: conn.db_user,
      password: conn.db_password,
      server: target.ip,
      database: conn.db_name,
      options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
      pool: { max: 1, min: 0 }
    };
    const remotePool = await remotePoolManager.getPool(target.id, config);
    const result = await buildRequest(remotePool.request()).query(keyword.script_text);

    return {
      handled: true,
      text: keyword.action_type === 'procedure'
        ? `Procedure keyword \`${keyword.keyword}\` berhasil dijalankan pada host \`${resolvedTargetHost}\`.\n\n${formatKeywordRows(result.recordset || [])}`
        : formatKeywordRows(result.recordset || []),
      sources: [{ type: keyword.action_type, label: resolvedTargetHost, detail: `${keyword.action_type} keyword` }]
    };
  }

  const result = await buildRequest(pool.request()).query(keyword.script_text);
  return {
    handled: true,
    text: keyword.action_type === 'procedure'
      ? `Procedure keyword \`${keyword.keyword}\` berhasil dijalankan.\n\n${formatKeywordRows(result.recordset || [])}`
      : formatKeywordRows(result.recordset || []),
    sources: [{ type: keyword.action_type, label: keyword.keyword, detail: 'Local database keyword' }]
  };
}

async function executeWorkflowKeyword(pool, keyword, args) {
  const searchTerm = args.query || keyword.script_text;
  if (!searchTerm) {
    return {
      handled: true,
      text: `Keyword workflow \`${keyword.keyword}\` belum punya target pencarian.`,
      sources: [{ type: 'workflow', label: keyword.keyword, detail: 'Missing workflow target' }]
    };
  }

  if (searchTerm.startsWith('id:')) {
    const workflowId = searchTerm.slice(3).trim();
    const result = await pool.request()
      .input('id', sql.NVarChar, workflowId)
      .query("SELECT title, content FROM Workflows WHERE id = @id");
    if (!result.recordset[0]) {
      return {
        handled: true,
        text: `Workflow dengan id \`${workflowId}\` tidak ditemukan.`,
        sources: [{ type: 'workflow', label: keyword.keyword, detail: 'Workflow not found' }]
      };
    }

    return {
      handled: true,
      text: `### ${result.recordset[0].title}\n\n${result.recordset[0].content}`,
      sources: [{ type: 'workflow', label: result.recordset[0].title, detail: 'Knowledge base article' }]
    };
  }

  const result = await pool.request()
    .input('q', sql.NVarChar, `%${searchTerm}%`)
    .query("SELECT TOP 10 id, title, category FROM Workflows WHERE title LIKE @q OR category LIKE @q OR content LIKE @q");

  if (!result.recordset.length) {
    return {
      handled: true,
      text: `Tidak ada workflow yang cocok untuk keyword \`${keyword.keyword}\` dengan pencarian \`${searchTerm}\`.`,
      sources: [{ type: 'workflow', label: keyword.keyword, detail: 'No workflow match' }]
    };
  }

  return {
    handled: true,
    text: `Saya menemukan ${result.recordset.length} workflow untuk keyword \`${keyword.keyword}\`:\n\n${formatKeywordRows(result.recordset)}`,
    sources: [{ type: 'workflow', label: keyword.keyword, detail: `${result.recordset.length} workflow match(es)` }]
  };
}

function formatKeywordHelpList(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return "Belum ada keyword assistant yang aktif.";
  }

  const lines = keywords.map((keyword) => {
    return `- \`${keyword.keyword}\` : ${keyword.description || 'Tanpa deskripsi.'}`;
  });

  return `Berikut keyword yang tersedia:\n\n${lines.join('\n')}`;
}

function formatKeywordHelpDetail(keyword) {
  return `Keyword: \`${keyword.keyword}\`\nDeskripsi: ${keyword.description || 'Tanpa deskripsi.'}`;
}

async function resolveAssistantKeyword(pool, currUser, prompt) {
  const normalizedPrompt = normalizeAssistantKeywordText(prompt);
  const result = await pool.request().query("SELECT * FROM AssistantKeywords WHERE is_enabled = 1");
  const enabledKeywords = result.recordset || [];

  if (normalizedPrompt === 'help' || normalizedPrompt === 'help keyword' || normalizedPrompt === 'help keywords') {
    return {
      handled: true,
      text: formatKeywordHelpList(enabledKeywords),
      sources: [{ type: 'keyword-help', label: 'Assistant Keywords', detail: `${enabledKeywords.length} keyword aktif` }]
    };
  }

  if (normalizedPrompt.startsWith('help ')) {
    const requestedKeyword = normalizedPrompt.slice(5).trim();
    const helpKeyword = enabledKeywords.find((row) => normalizeAssistantKeywordText(row.keyword) === requestedKeyword);
    if (helpKeyword) {
      return {
        handled: true,
        text: formatKeywordHelpDetail(helpKeyword),
        sources: [{ type: 'keyword-help', label: helpKeyword.keyword, detail: 'Keyword detail' }]
      };
    }
  }

  const matchedKeyword = enabledKeywords
    .sort((a, b) => normalizeAssistantKeywordText(b.keyword).length - normalizeAssistantKeywordText(a.keyword).length)
    .find((row) => {
      const normalizedKeyword = normalizeAssistantKeywordText(row.keyword);
      return normalizedPrompt === normalizedKeyword || normalizedPrompt.startsWith(`${normalizedKeyword} `);
    });

  if (!matchedKeyword) {
    return null;
  }

  if (matchedKeyword.requires_admin && !currUser.is_admin) {
    return {
      handled: true,
      text: `Keyword \`${matchedKeyword.keyword}\` hanya boleh dijalankan oleh administrator.`,
      sources: [{ type: 'keyword', label: matchedKeyword.keyword, detail: 'Admin only keyword' }]
    };
  }

  const keywordText = matchedKeyword.keyword.trim();
  const remainder = prompt.trim().slice(keywordText.length).trim();
  const args = parseAssistantKeywordArgs(remainder);

  if (matchedKeyword.requires_confirmation && args.confirm !== 'yes') {
    return {
      handled: true,
      text: `Keyword \`${matchedKeyword.keyword}\` membutuhkan konfirmasi sebelum dieksekusi. Kirim ulang dengan format:\n\n\`${prompt.trim()} confirm=yes\``,
      sources: [{ type: 'keyword', label: matchedKeyword.keyword, detail: 'Confirmation required' }],
      form: {
        keywordId: matchedKeyword.id,
        keyword: matchedKeyword.keyword,
        description: matchedKeyword.description || '',
        parameter_keys: parseKeywordParameterKeys(matchedKeyword.parameter_keys),
        requires_confirmation: true,
        target_host: matchedKeyword.target_host || ''
      }
    };
  }

  if (matchedKeyword.action_type === 'workflow') {
    return executeWorkflowKeyword(pool, matchedKeyword, args);
  }

  return executeKeywordSql(pool, matchedKeyword, args);
}

const ASSISTANT_COOLDOWN_MS = 3000;
const assistantRequestTimes = new Map();

router.post('/api/chat', async (req, res) => {
  let { userId, prompt, history, user: bodyUser } = req.body;
  const headerUserId = req.headers['x-user-id'];

  if (!userId && bodyUser && bodyUser.id) userId = bodyUser.id;
  if (!userId && typeof headerUserId === 'string') userId = headerUserId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: Missing user identity." });
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  prompt = prompt.trim();
  history = Array.isArray(history) ? history : [];

  try {
    const pool = await poolPromise;
    const userRes = await pool.request()
      .input('uid', sql.NVarChar, userId)
      .query(`
        SELECT u.id, u.username, r.is_admin, r.menu_permissions 
        FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid

      `);

    const currUser = userRes.recordset[0];
    if (!currUser) return res.status(401).json({ error: "Unauthorized: User not found." });

    const perms = currUser.menu_permissions || "[]";
    const hasAssistantAccess = currUser.is_admin || perms === "*" || perms.includes("assistant");
    if (!hasAssistantAccess) {
      return res.status(403).json({ error: "Access Denied: You do not have permission to use the AI Assistant." });
    }

    const keywordResult = await resolveAssistantKeyword(pool, currUser, prompt);
    if (keywordResult?.handled) {
      await pool.request()
        .input('time', sql.NVarChar, new Date().toLocaleString())
        .input('u', sql.NVarChar, currUser.username || userId)
        .input('act', sql.NVarChar, `AI Keyword: ${prompt.substring(0, 180)}`)
        .query("INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @u, @act)");

      return res.json({
        text: keywordResult.text,
        sources: keywordResult.sources || [],
        form: keywordResult.form || null,
        meta: {
          toolsUsed: ['assistant-keyword']
        }
      });
    }

    // Apply cooldown per user so one busy operator does not block everyone else.
    const now = Date.now();
    const elapsed = now - (assistantRequestTimes.get(userId) || 0);
    if (elapsed < ASSISTANT_COOLDOWN_MS) {
      await new Promise(resolve => setTimeout(resolve, ASSISTANT_COOLDOWN_MS - elapsed));
    }
    assistantRequestTimes.set(userId, Date.now());

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "OPENROUTER_API_KEY is missing in .env file." });
    }

    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
      defaultHeaders: {
        "HTTP-Referer": "http://pepinet.monitoring",
        "X-Title": "Centaur Deploy Assistant",
      }
    });

    const tools = [
      {
        type: "function",
        function: {
          name: "getOfflineDevices",
          description: "Returns a list of all devices that are currently offline or unresponsive."
        }
      },
      {
        type: "function",
        function: {
          name: "getDeviceGroups",
          description: "Returns summary statistics of device groups and their device counts."
        }
      },
      {
        type: "function",
        function: {
          name: "executeRemoteHostQuery",
          description: "Executes a READ-ONLY SQL query on a specific remote host database. AVOID COMPLEX JOINS for performance.",
          parameters: {
            type: "object",
            properties: {
              hostname: { type: "string", description: "The exact hostname of the target PC/Server." },
              sql_query: { type: "string", description: "The SIMPLE T-SQL SELECT query to execute." }
            },
            required: ["hostname", "sql_query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "executeRemoteProcedure",
          description: "Executes a stored procedure or complex T-SQL function/command on a specific remote host database. ADMINISTRATOR PRIVILEGES REQUIRED.",
          parameters: {
            type: "object",
            properties: {
              hostname: { type: "string", description: "The exact hostname of the target PC/Server." },
              sql_command: { type: "string", description: "The T-SQL command to execute." }
            },
            required: ["hostname", "sql_command"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "searchWorkflows",
          description: "Searches the internal knowledge base for titles of Work Instructions (WI) or tutorials related to a topic. ALWAYS check this first for 'how-to' questions.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search term or topic (e.g., 'restart agent', 'database backup')." }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "getWorkflowDetail",
          description: "Retrieves the full Markdown content of a specific Work Instruction (WI) or tutorial from the knowledge base.",
          parameters: {
            type: "object",
            properties: {
              id: { type: "string", description: "The unique ID of the workflow document." }
            },
            required: ["id"]
          }
        }
      }
    ];

    const currentDateTime = new Date().toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const sysInstruct = `You are the Pepito Monitoring Expert, a friendly and proactive AI teammate for the Centaur Deploy ecosystem. 
Your goal is to help administrators manage the network with ease and absolute accuracy.

CURRENT CONTEXT: 
- Today's Date: ${currentDateTime} (Waktu Indonesia Barat/Local Time)

BEHAVIORAL GUIDELINES:
1. **BE FRIENDLY & DYNAMIC**: Always start with a warm greeting like "Hi!", "Hello!", or "Good morning!". Sound like a helpful colleague, not a formal system.
2. **STRICT ACCURACY (NO HALLUCINATION)**:
   - **NEVER INVENT DATA**: If a tool returns no data, null, or empty results, YOU MUST tell the user clearly that no data was found or that the result is zero.
   - **DATE PRECISION**: Ensure your queries and responses strictly respect years and dates. Use ${currentDateTime} as your reference.
3. **PROACTIVE HEALTH CHECKS**:
   - If the user asks a general health question ("How's everything?", "Status?"), use the "getOfflineDevices" tool.
   - Report with a conversational tone.
4. **CLEAN RESPONSES (NO RAW TOOLS)**:
   - Never show raw tool call syntax or JSON in your final response. 
   - Perform the tool call behind the scenes and ONLY present the summarized human-readable result.
5. **PERFORMANCE SAFETY**: Stick to simple, efficient SELECT queries for SQL tools.
6. **KNOWLEDGE ACCESS**: Explain "how-to" steps from workflows in your own words.

Style: Warm, technical yet friendly, proactive, and very accurate.`;

    let messages = [
      { role: "system", content: sysInstruct },
      ...(history || []).slice(-10).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: typeof msg.text === 'string' ? msg.text.substring(0, 2000) : msg.text
      }))
    ];

    messages.push({ role: 'user', content: prompt });

    const completion = await openai.chat.completions.create({
      model: "nousresearch/hermes-3-llama-3.1-405b:free",
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: 4096
    });

    let responseMessage = completion.choices[0].message;
    let finalResponseText = responseMessage.content || "";
    const sources = [];
    const usedTools = [];

    // Chain tool calls if necessary
    if (responseMessage.tool_calls) {
      messages.push(responseMessage);

      // Fetch Global Security Settings for tools
      const safetyRes = await pool.request().query("SELECT sql_safe_mode FROM NotificationSettings WHERE id = 'global'");
      const rawSafeMode = safetyRes.recordset[0]?.sql_safe_mode;
      const globalSqlSafe = (rawSafeMode === null || rawSafeMode === undefined) ? true : !!rawSafeMode;

      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        let toolResultText = "No data found.";
        usedTools.push(functionName);

        try {
          if (functionName === 'getOfflineDevices') {
            const resDb = await pool.request().query("SELECT TOP 50 hostname, ip, status, last_seen, location FROM Devices WHERE status = 'offline'");
            toolResultText = JSON.stringify(resDb.recordset);
            sources.push({ type: 'devices', label: 'Offline Devices', detail: `${resDb.recordset.length} device(s)` });
          } else if (functionName === 'getDeviceGroups') {
            const resDb = await pool.request().query(`
              SELECT g.name, (SELECT COUNT(*) FROM Devices d WHERE d.group_ids LIKE '%' + g.id + '%') as device_count
              FROM DeviceGroups g
            `);
            toolResultText = JSON.stringify(resDb.recordset);
            sources.push({ type: 'device-groups', label: 'Device Groups', detail: `${resDb.recordset.length} group row(s)` });
          } else if (functionName === 'executeRemoteHostQuery') {
            const { hostname, sql_query } = args;

            // SECURITY ENFORCEMENT
            if (globalSqlSafe && !isValidSafeSQL(sql_query)) {
              toolResultText = "Error: Access Denied. SQL Safe Mode is active. Only 'SELECT' queries are permitted.";
            } else {
              const hostRes = await pool.request().input('name', sql.NVarChar, hostname).query("SELECT id, ip FROM Devices WHERE hostname = @name");
              const target = hostRes.recordset[0];
              if (!target) {
                toolResultText = `Error: Hostname '${hostname}' not found.`;
              } else {
                const connRes = await pool.request().input('did', sql.NVarChar, target.id).query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
                const conn = connRes.recordset[0];
                if (!conn) {
                  toolResultText = `Error: DB credentials for '${hostname}' missing.`;
                } else {
                  // Audit Log for Read Queries
                  await pool.request()
                    .input('u', sql.NVarChar, currUser.username || userId)
                    .input('act', sql.NVarChar, `AI Assistant SELECT: [${hostname}] ${sql_query.substring(0, 200)}`)
                    .query("INSERT INTO ActivityLog ([user], action) VALUES (@u, @act)")
                    .catch(() => { });

                  const config = {
                    user: conn.db_user, password: conn.db_password, server: target.ip, database: conn.db_name,
                    options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
                    pool: { max: 1, min: 0 }
                  };
                  const remotePool = await remotePoolManager.getPool(target.id, config);
                  const result = await remotePool.request().query(sql_query);
                  toolResultText = JSON.stringify(result.recordset);
                  sources.push({ type: 'remote-sql', label: hostname, detail: `SQL returned ${result.recordset.length} rows` });
                }
              }
            }
          } else if (functionName === 'executeRemoteProcedure') {
            const { hostname, sql_command } = args;
            if (globalSqlSafe) {
              toolResultText = "Error: Access Denied. SQL Safe Mode is active. Stored procedures / Commands are disabled.";
            } else if (!currUser.is_admin) {
              toolResultText = "Error: Access Denied. Admin required for Procedures.";
            } else {
              const hostRes = await pool.request().input('name', sql.NVarChar, hostname).query("SELECT id, ip FROM Devices WHERE hostname = @name");
              const target = hostRes.recordset[0];
              if (target) {
                const connRes = await pool.request().input('did', sql.NVarChar, target.id).query("SELECT * FROM DeviceDbConnections WHERE device_id = @did");
                const conn = connRes.recordset[0];
                if (conn) {
                  const config = {
                    user: conn.db_user, password: conn.db_password, server: target.ip, database: conn.db_name,
                    options: { encrypt: false, trustServerCertificate: true, connectTimeout: 10000 },
                    pool: { max: 1, min: 0 }
                  };
                  const remotePool = await remotePoolManager.getPool(target.id, config);
                  const result = await remotePool.request().query(sql_command);
                  toolResultText = JSON.stringify(result.recordset);
                  sources.push({ type: 'remote-procedure', label: hostname, detail: 'Procedure execution successful' });

                  // Audit Log
                  await pool.request()
                    .input('u', sql.NVarChar, currUser.username || userId)
                    .input('act', sql.NVarChar, `AI Assistant EXEC: [${hostname}] ${sql_command}`)
                    .query("INSERT INTO ActivityLog (id, user_id, action, target, timestamp, login_ip) VALUES (REPLACE(NEWID(),'-',''), @uid, @act, 'AI', GETDATE(), '127.0.0.1')");
                }
              }
            }
          } else if (functionName === 'searchWorkflows') {
            const { query } = args;
            const words = query.split(/\s+/).filter(w => w.length > 2);
            let result;
            if (words.length > 0) {
              let sqlQuery = "SELECT id, title, category FROM Workflows WHERE ";
              let conditions = words.map((w, i) => `(title LIKE @w${i} OR category LIKE @w${i} OR content LIKE @w${i})`).join(" OR ");
              sqlQuery += conditions;
              const request = pool.request();
              words.forEach((w, i) => request.input(`w${i}`, sql.NVarChar, `%${w}%`));
              result = await request.query(sqlQuery);
            } else {
              result = await pool.request().input('q', sql.NVarChar, `%${query}%`).query("SELECT id, title, category FROM Workflows WHERE title LIKE @q OR category LIKE @q");
            }
            toolResultText = JSON.stringify(result.recordset);
            sources.push({ type: 'search', label: 'Workflows', detail: `Found ${result.recordset.length} match(es)` });
          } else if (functionName === 'getWorkflowDetail') {
            const { id } = args;
            const resDb = await pool.request().input('id', sql.NVarChar, id).query("SELECT title, content FROM Workflows WHERE id = @id");
            if (resDb.recordset[0]) {
              toolResultText = `Title: ${resDb.recordset[0].title}\n\nContent:\n${resDb.recordset[0].content}`;
              sources.push({ type: 'workflow', label: resDb.recordset[0].title, detail: 'Workflow content loaded' });
            }
          }
        } catch (e) {
          toolResultText = "Tool execution failed: " + e.message;
        }

        messages.push({ tool_call_id: toolCall.id, role: "tool", name: functionName, content: toolResultText });
      }

      const secondCompletion = await openai.chat.completions.create({
        model: "nousresearch/hermes-3-llama-3.1-405b:free",
        messages,
        temperature: 0.3,
        max_tokens: 4096
      });

      finalResponseText = secondCompletion.choices[0].message.content || "";
    }

    await pool.request()
      .input('uid', sql.NVarChar, userId)
      .input('prompt', sql.NVarChar(sql.MAX), prompt)
      .input('resp', sql.NVarChar(sql.MAX), finalResponseText)
      .input('act', sql.NVarChar, `AI Assistant (OpenRouter): ${prompt.substring(0, 180)}${usedTools.length ? ` | tools=${usedTools.join(',')}` : ''}`)
      .query("INSERT INTO ActivityLog (id, user_id, action, target, timestamp, login_ip) VALUES (REPLACE(NEWID(),'-',''), @uid, @act, 'AI', GETDATE(), '127.0.0.1')");

    res.json({
      text: finalResponseText,
      userId,
      sources,
      timestamp: new Date().toISOString(),
      meta: { toolsUsed: usedTools, cooldownMs: ASSISTANT_COOLDOWN_MS }
    });
  } catch (err) {
    console.error('[AI Chat Error]', err);
    
    // Custom error message untuk user yang lebih informatif
    let userFriendlyMessage = "Maaf, AI Assistant mengalami kendala teknis. ";
    
    if (err.message && err.message.includes('404 No endpoints found')) {
      userFriendlyMessage = "\u2139\uFE0F AI Assistant ini bersifat local-based yang berfungsi sebagai tools bantu khusus untuk sistem Pepinet saja. " +
                           "Fitur ini dirancang untuk membantu operasional internal dan tidak terhubung dengan layanan AI eksternal.";
    } else if (err.message && (err.message.includes('openrouter') || err.message.includes('API'))) {
      userFriendlyMessage = "\u2139\uFE0F AI Assistant ini adalah sistem internal Pepinet yang berfungsi sebagai tools bantu operasional. " +
                           "Sistem ini dirancang khusus untuk kebutuhan internal dan tidak memerlukan koneksi ke layanan AI eksternal.";
    } else {
      userFriendlyMessage += "Silakan coba lagi dalam beberapa saat atau hubungi tim IT jika masalah berlanjut.";
    }
    
    res.status(500).json({ error: userFriendlyMessage });
  }
});

// \u2500€\u2500€ GET /api/reports/deployments \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/reports/deployments', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT status, COUNT(*) as count 
      FROM DeploymentTargets 
      GROUP BY status
    `);

    res.json({ targets: result.recordset });
  } catch (err) {
    console.error('Reports Deployments Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/reports/health \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/reports/health', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT d.id, d.hostname, d.ram, d.disk, 
             (SELECT g.name + ',' FROM DeviceGroups g WHERE d.group_ids LIKE '%' + g.id + '%' FOR XML PATH('')) as group_names
      FROM Devices d
    `);

    const healthData = result.recordset.map(row => {
      const rawRam = row.ram || "";
      const rawDisk = row.disk || "";
      const groupNames = row.group_names || "";
      const isServer = groupNames.toLowerCase().includes('server');
      const ramThreshold = isServer ? 31 : 7;

      let isLowRam = false;
      let isLowDisk = false;

      let totalRamGB = 0;
      if (rawRam.includes('/')) {
        const parts = rawRam.split('/');
        const totalMatch = parts[1].match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
        if (totalMatch) {
          totalRamGB = parseFloat(totalMatch[1]);
          if (totalMatch[2].toUpperCase() === 'MB') totalRamGB /= 1024;
          if (totalMatch[2].toUpperCase() === 'TB') totalRamGB *= 1024;
        }
      } else {
        const ramMatch = rawRam.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
        if (ramMatch) {
          totalRamGB = parseFloat(ramMatch[1]);
          if (ramMatch[2].toUpperCase() === 'MB') totalRamGB /= 1024;
          if (ramMatch[2].toUpperCase() === 'TB') totalRamGB *= 1024;
        }
      }
      if (totalRamGB > 0 && totalRamGB < ramThreshold) isLowRam = true;

      const diskBlocks = rawDisk.split(' | ');
      let worstFreeVal = Infinity;
      let freeDiskSummary = [];
      let lowDiskDrives = [];
      let freeDisk = "Unknown";

      diskBlocks.forEach(block => {
        if (block.includes('/')) {
          const parts = block.split('/');
          const usedMatch = parts[0].match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
          const totalMatch = parts[1].match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
          const driveLetterMatch = block.match(/([a-zA-Z]:)/);
          const driveLabel = driveLetterMatch ? driveLetterMatch[1] : "";

          if (usedMatch && totalMatch) {
            let usedVal = parseFloat(usedMatch[1]);
            if (usedMatch[2].toUpperCase() === 'TB') usedVal *= 1024;
            if (usedMatch[2].toUpperCase() === 'MB') usedVal /= 1024;

            let totalVal = parseFloat(totalMatch[1]);
            if (totalMatch[2].toUpperCase() === 'TB') totalVal *= 1024;
            if (totalMatch[2].toUpperCase() === 'MB') totalVal /= 1024;

            // Ignore disks smaller than 10GB (likely recovery partitions or virtual drives)
            if (totalVal < 10) return;

            const freeVal = totalVal - usedVal;
            if (freeVal < worstFreeVal) worstFreeVal = freeVal;
            if (freeVal < 50) lowDiskDrives.push(driveLabel || "Unknown");
            freeDiskSummary.push(driveLabel ? `${driveLabel} ${freeVal.toFixed(2)} GB` : `${freeVal.toFixed(2)} GB`);
          }
        } else {
          const diskMatch = block.match(/(?:Free:\s*)?(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
          if (diskMatch) {
            let val = parseFloat(diskMatch[1]);
            if (diskMatch[2].toUpperCase() === 'TB') val *= 1024;
            if (diskMatch[2].toUpperCase() === 'MB') val /= 1024;
            if (val < worstFreeVal) worstFreeVal = val;
            if (val < 50) lowDiskDrives.push("Unknown");
            freeDiskSummary.push(`${val.toFixed(2)} GB`);
          }
        }
      });

      if (worstFreeVal !== Infinity) {
        isLowDisk = worstFreeVal < 50;
        freeDisk = freeDiskSummary.join(' | ');
      }

      return {
        id: row.id,
        hostname: row.hostname,
        ram: row.ram,
        totalRam: totalRamGB > 0 ? `${totalRamGB.toFixed(2)} GB` : row.ram,
        ramThreshold: ramThreshold,
        groupNames: groupNames.replace(/,$/, ''),
        disk: row.disk,
        freeDisk: freeDisk,
        lowDiskDrives: lowDiskDrives,
        isLowRam,
        isLowDisk,
        needsUpgrade: isLowRam || isLowDisk
      };
    });

    res.json(healthData);
  } catch (err) {
    console.error('Reports Health Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/reports/inventory \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/reports/inventory', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 10 name, COUNT(*) as count 
      FROM DeviceSoftware 
      GROUP BY name 
      ORDER BY count DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Reports Inventory Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/reports/tickets \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/reports/tickets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT status, COUNT(*) as count 
      FROM TroubleTickets 
      GROUP BY status
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Reports Tickets Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/reports/crm-sync \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
// Returns LOYAL_CRM_ITEM_MST sync stats grouped by day (today + yesterday)
router.get('/api/reports/crm-sync', async (req, res) => {
  try {
    const pool = await poolPromise;

    // Fetch HOSERVER connection
    const hoDevRes = await pool.request()
      .input('hostname', sql.NVarChar, 'HOSERVER')
      .query('SELECT id, ip FROM Devices WHERE hostname = @hostname');

    if (hoDevRes.recordset.length === 0) {
      return res.status(404).json({ error: 'HOSERVER device not found.' });
    }

    const { id: hoDeviceId, ip: hoIp } = hoDevRes.recordset[0];
    const hoConnRes = await pool.request()
      .input('did', sql.NVarChar, hoDeviceId)
      .query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');

    if (hoConnRes.recordset.length === 0) {
      return res.status(404).json({ error: 'HOSERVER DB credentials not configured.' });
    }

    const hoConn = hoConnRes.recordset[0];
    const hoPool = new sql.ConnectionPool({
      user: hoConn.db_user,
      password: hoConn.db_password,
      server: hoIp,
      database: hoConn.db_name,
      options: { encrypt: false, enableArithAbort: true, trustServerCertificate: true },
      connectionTimeout: 10000,
      requestTimeout: 15000
    });
    await hoPool.connect();

    const crmRes = await hoPool.request().query(`
      SELECT
        CONVERT(date, last_timestamp) as sync_date,
        CASE WHEN CONVERT(date, last_timestamp) = CONVERT(date, GETDATE()) THEN 1 ELSE 0 END as is_today,
        SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced_count,
        SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending_count
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -1, GETDATE()))
      GROUP BY CONVERT(date, last_timestamp)
      ORDER BY sync_date DESC
    `);
    await hoPool.close();

    // Label is determined by SQL Server (is_today flag) â€” no JS timezone issues
    const rows = crmRes.recordset.map(r => ({
      label: r.is_today === 1 ? 'Today' : 'Yesterday',
      synced_count: r.synced_count || 0,
      pending_count: r.pending_count || 0,
      total: (r.synced_count || 0) + (r.pending_count || 0),
      date: r.sync_date
    }));

    res.json(rows);
  } catch (err) {
    console.error('Reports CRM Sync Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/reports/dbwh-jobs \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
// Returns SQL Server Agent job history from DBWH server
router.get('/api/reports/dbwh-jobs', async (req, res) => {
  try {
    const crmPool = await getCrmPool();
    const result = await crmPool.request().query(`
      SELECT distinct
        j.name AS JobName
       ,h.step_name AS StepName
       ,msdb.dbo.agent_datetime(h.run_date, h.run_time) AS StartDateTime
       ,h.run_duration AS Duration_HHMMSS
       ,CASE h.run_status
          WHEN 0 THEN 'Failed'
          WHEN 1 THEN 'Succeeded'
          WHEN 2 THEN 'Retry'
          WHEN 3 THEN 'Canceled'
          WHEN 4 THEN 'In Progress'
        END AS StatusJob
       ,h.message AS LogMessage
      FROM msdb.dbo.sysjobs j
      INNER JOIN msdb.dbo.sysjobhistory h
        ON j.job_id = h.job_id
      WHERE h.run_date = CONVERT(VARCHAR(8), GETDATE(), 112)
      ORDER BY StartDateTime DESC;
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('Reports DBWH Jobs Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/crm/customer/:phone \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/crm/customer/:phone', async (req, res) => {
  const { phone } = req.params;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  try {
    const token = await getH2hToken();

    const apiUrl = `${h2hConfig.baseUrl}/api/v1/tenant/customer/${phone}?client_code=${h2hConfig.clientCode}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.message || `H2H API Error: ${response.status}`,
        details: errorData
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('CRM Lookup Error:', err.message);
    res.status(500).json({ error: 'Failed to connect to H2H CRM.', message: err.message });
  }
});

// \u2500€\u2500€ DEV CRM Loyalty & Achievements Endpoints \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/dev/loyalty/stats', async (req, res) => {
  const { fromDate, toDate, store = '' } = req.query;
  try {
    const pool = await poolPromise;
    const request = pool.request();
    
    let whereClause = "WHERE 1=1";
    if (fromDate && toDate) {
      whereClause += " AND summary_date BETWEEN @fromDate AND @toDate";
      request.input('fromDate', sql.Date, fromDate);
      request.input('toDate', sql.Date, toDate);
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND org_cd = @store";
      request.input('store', sql.NVarChar, store);
    }

    const statsRes = await request.query(`
      SELECT 
        ISNULL(COUNT(DISTINCT member_id), 0) AS totalProfiles,
        ISNULL(SUM(total_sales), 0) AS totalSpend,
        ISNULL(SUM(total_txn), 0) AS totalTransactions
      FROM LOYAL_MEMBER_DAILY_SUMMARY
      ${whereClause}
    `);
    const stats = statsRes.recordset[0];

    const achCountRes = await pool.request().query("SELECT COUNT(1) AS totalAchievements FROM LOYAL_MEMBER_ACHIEVEMENT");
    const totalAchievements = achCountRes.recordset[0].totalAchievements || 0;

    res.json({
      totalProfiles: stats.totalProfiles,
      totalSpend: stats.totalSpend,
      totalTransactions: stats.totalTransactions,
      totalAchievements: totalAchievements
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/dev/loyalty/summary', async (req, res) => {
  const { page = 1, perPage = 50, search = '', sortBy = 'summary_date', sortDir = 'desc', fromDate, toDate, store = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(perPage);
  const limit = parseInt(perPage);
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowedSortCols = ['summary_date', 'total_sales', 'total_margin', 'total_txn', 'member_id', 'org_cd'];
  const safeSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'summary_date';

  try {
    const pool = await poolPromise;
    let whereClause = "WHERE 1=1";
    const request = pool.request();

    if (search) {
      whereClause += " AND s.member_id LIKE @search";
      request.input('search', sql.NVarChar, `%${search}%`);
    }
    if (fromDate && toDate) {
      whereClause += " AND s.summary_date BETWEEN @fromDate AND @toDate";
      request.input('fromDate', sql.Date, fromDate);
      request.input('toDate', sql.Date, toDate);
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND s.org_cd = @store";
      request.input('store', sql.NVarChar, store);
    }

    const countRes = await request.query(`
      SELECT COUNT(1) AS total FROM LOYAL_MEMBER_DAILY_SUMMARY s ${whereClause}
    `);
    const total = countRes.recordset[0].total;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const result = await request.query(`
      SELECT s.*, p.name, p.mobile_no 
      FROM LOYAL_MEMBER_DAILY_SUMMARY s
      LEFT JOIN LOYAL_MEMBER_PROFILE p ON s.member_id = p.member_id
      ${whereClause}
      ORDER BY s.${safeSortCol} ${safeSortDir}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    
    res.json({ summaries: result.recordset, total, page: parseInt(page), perPage: limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/dev/loyalty/profiles', async (req, res) => {
  const { page = 1, perPage = 50, search = '', sortBy = 'total_spent', sortDir = 'desc', fromDate, toDate, store = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(perPage);
  const limit = parseInt(perPage);
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowedSortCols = ['total_spent', 'total_transactions', 'member_id', 'name', 'last_active_date'];
  const safeSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'total_spent';

  try {
    const pool = await poolPromise;
    let whereClause = "WHERE 1=1";
    const request = pool.request();
    
    if (search) {
      whereClause += " AND (member_id LIKE @search OR name LIKE @search OR mobile_no LIKE @search OR city LIKE @search)";
      request.input('search', sql.NVarChar, `%${search}%`);
    }
    if (fromDate && toDate) {
      whereClause += " AND member_id IN (SELECT DISTINCT member_id FROM LOYAL_MEMBER_DAILY_SUMMARY WHERE summary_date BETWEEN @fromDate AND @toDate)";
      request.input('fromDate', sql.Date, fromDate);
      request.input('toDate', sql.Date, toDate);
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND member_id IN (SELECT DISTINCT member_id FROM LOYAL_MEMBER_DAILY_SUMMARY WHERE org_cd = @store)";
      request.input('store', sql.NVarChar, store);
    }

    const countRes = await request.query(`
      SELECT COUNT(1) AS total FROM LOYAL_MEMBER_PROFILE ${whereClause}
    `);
    const total = countRes.recordset[0].total;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const profilesRes = await request.query(`
      SELECT * FROM LOYAL_MEMBER_PROFILE 
      ${whereClause}
      ORDER BY ${safeSortCol} ${safeSortDir}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);
    const profiles = profilesRes.recordset;

    if (profiles.length === 0) {
      return res.json({ profiles: [], total, page: parseInt(page), perPage: limit });
    }

    const memberIds = profiles.map(p => p.member_id);
    
    const chunkArray = (arr, size) => {
      const res = [];
      for(let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
      return res;
    };
    const idChunks = chunkArray(memberIds, 500);
    
    const allSummaries = [];
    const allPromos = [];

    for (const chunk of idChunks) {
      if (chunk.length === 0) continue;
      
      const idPlaceholders = chunk.map((id, idx) => `@id_${idx}`).join(', ');
      
      let summaryQuery = `
        SELECT * FROM LOYAL_MEMBER_DAILY_SUMMARY 
        WHERE member_id IN (${idPlaceholders})
      `;
      const sumRequest = pool.request();
      chunk.forEach((id, idx) => sumRequest.input(`id_${idx}`, sql.NVarChar, id));

      if (fromDate && toDate) {
        summaryQuery += " AND summary_date BETWEEN @fromDate AND @toDate";
        sumRequest.input('fromDate', sql.Date, fromDate);
        sumRequest.input('toDate', sql.Date, toDate);
      }
      if (store && store !== 'All Stores') {
        summaryQuery += " AND org_cd = @store";
        sumRequest.input('store', sql.NVarChar, store);
      }

      const sumRes = await sumRequest.query(summaryQuery);
      allSummaries.push(...sumRes.recordset);

      let promoQuery = `
        SELECT card_no, itm_cd, item_name, promo_detail, SUM(disc_amt) AS total_disc, SUM(qty) AS total_qty
        FROM ITEM_SALES_MEMBER 
        WHERE card_no IN (${idPlaceholders}) AND disc_amt > 0
      `;
      const promoRequest = pool.request();
      chunk.forEach((id, idx) => promoRequest.input(`id_${idx}`, sql.NVarChar, id));

      if (fromDate && toDate) {
        promoQuery += " AND bill_dt >= @fromDate AND bill_dt <= @toDate";
        promoRequest.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        promoRequest.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (store && store !== 'All Stores') {
        promoQuery += " AND org_cd = @store";
        promoRequest.input('store', sql.NVarChar, store);
      }

      promoQuery += `
        GROUP BY card_no, itm_cd, item_name, promo_detail
        ORDER BY total_disc DESC
      `;
      const promoRes = await promoRequest.query(promoQuery);
      allPromos.push(...promoRes.recordset);
    }

    // Group promos by card_no (member_id)
    const promosByMember = {};
    allPromos.forEach(pr => {
      if (!promosByMember[pr.card_no]) promosByMember[pr.card_no] = [];
      promosByMember[pr.card_no].push(pr);
    });

    // Group summaries by member_id
    const summariesByMember = {};
    allSummaries.forEach(s => {
      if (!summariesByMember[s.member_id]) summariesByMember[s.member_id] = [];
      summariesByMember[s.member_id].push(s);
    });

    // Evaluate achievements and compute stats dynamically
    const { evaluateAchievements } = require('../scripts/loyalty_achievements.cjs');

    const result = profiles.map(p => {
      const memberSummaries = summariesByMember[p.member_id] || [];
      
      // Calculate dynamic spent and txn based on filtered summaries
      let dynamicSpent = 0;
      let dynamicTxn = 0;
      memberSummaries.forEach(s => {
        dynamicSpent += s.total_sales;
        dynamicTxn += s.total_txn;
      });

      const mockProfile = {
        ...p,
        total_spent: dynamicSpent,
        total_transactions: dynamicTxn
      };

      const dynamicAchievements = evaluateAchievements(p.member_id, mockProfile, memberSummaries);

      return {
        ...p,
        total_spent: dynamicSpent,
        total_transactions: dynamicTxn,
        achievements: dynamicAchievements.map(ach => {
          let criteria = ach.criteria;
          if (ach.name === 'Promo Hunter') {
            const memberPromos = promosByMember[p.member_id] || [];
            if (memberPromos.length > 0) {
              const promoDetails = memberPromos.map(pr => `- ${pr.item_name} (${pr.promo_detail || 'Promo'}): Saved Rp ${Math.round(pr.total_disc).toLocaleString('id-ID')}`).join('\n');
              criteria += `\n\nPromo items bought:\n${promoDetails}`;
            }
          }
          return {
            name: ach.name,
            unlocked_at: new Date(),
            criteria_met: criteria
          };
        })
      };
    });

    res.json({ profiles: result, total, page: parseInt(page), perPage: limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/dev/loyalty/item-sales', async (req, res) => {
  const { page = 1, perPage = 50, search = '', sortBy = 'bill_dt', sortDir = 'desc', fromDate, toDate, store = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(perPage);
  const limit = parseInt(perPage);
  const safeSortDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const allowedSortCols = ['bill_dt', 'org_cd', 'card_no', 'item_name', 'qty', 'gross_value'];
  const safeSortCol = allowedSortCols.includes(sortBy) ? sortBy : 'bill_dt';

  try {
    const pool = await poolPromise;
    let whereClause = "WHERE 1=1";
    const request = pool.request();

    if (search) {
      whereClause += ` AND (
        m.itm_cd LIKE @search OR 
        m.item_name LIKE @search OR 
        m.card_no LIKE @search OR 
        A4.anm_desc LIKE @search OR
        A7.anm_desc LIKE @search OR
        COALESCE(p1.name, p2.name) LIKE @search OR
        COALESCE(p1.mobile_no, p2.mobile_no) LIKE @search
      )`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }
    if (fromDate && toDate) {
      whereClause += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
      request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
      request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
    }
    if (store && store !== 'All Stores') {
      whereClause += " AND m.org_cd = @store";
      request.input('store', sql.NVarChar, store);
    }

    const countRes = await request.query(`
      SELECT COUNT(1) AS total 
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN LOYAL_MEMBER_PROFILE p1 ON m.card_no = p1.member_id
      LEFT JOIN LOYAL_MEMBER_PROFILE p2 ON m.card_no = p2.mobile_no
      LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
      LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
      ${whereClause}
    `);
    const total = countRes.recordset[0].total;

    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    const salesRes = await request.query(`
      SELECT 
          m.id, m.org_cd, m.itm_cd, m.item_name, m.qty, m.uom, m.promo_item_flag, m.promo_detail, m.disc_amt, m.bill_dt, m.card_no,
          COALESCE(p1.name, p2.name) as member_name,
          A2.anm_desc AS division,
          A3.anm_desc AS groups,
          A4.anm_desc AS department,
          A5.anm_desc AS class,
          A6.anm_desc AS sub_class,
          A7.anm_desc AS brand,
          A8.anm_desc AS principle,
          A9.anm_desc AS sources,
          A10.anm_desc AS size_measure,
          A11.anm_desc AS plano_name,
          A13.anm_desc AS returnable,
          A18.anm_desc AS item_type
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN LOYAL_MEMBER_PROFILE p1 ON m.card_no = p1.member_id
      LEFT JOIN LOYAL_MEMBER_PROFILE p2 ON m.card_no = p2.mobile_no
      LEFT JOIN attribute_nesting_mst A2 ON m.division = A2.anm_attr_cd AND A2.anm_attr = 'ATTR2'
      LEFT JOIN attribute_nesting_mst A3 ON m.groups = A3.anm_attr_cd AND A3.anm_attr = 'ATTR3'
      LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
      LEFT JOIN attribute_nesting_mst A5 ON m.class = A5.anm_attr_cd AND A5.anm_attr = 'ATTR5'
      LEFT JOIN attribute_nesting_mst A6 ON m.sub_class = A6.anm_attr_cd AND A6.anm_attr = 'ATTR6'
      LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
      LEFT JOIN attribute_nesting_mst A8 ON m.principle = A8.anm_attr_cd AND A8.anm_attr = 'ATTR8'
      LEFT JOIN attribute_nesting_mst A9 ON m.sources = A9.anm_attr_cd AND A9.anm_attr = 'ATTR9'
      LEFT JOIN attribute_nesting_mst A10 ON m.size_measure = A10.anm_attr_cd AND A10.anm_attr = 'ATTR10'
      LEFT JOIN attribute_nesting_mst A11 ON m.plano_name = A11.anm_attr_cd AND A11.anm_attr = 'ATTR11'
      LEFT JOIN attribute_nesting_mst A13 ON m.returnable = A13.anm_attr_cd AND A13.anm_attr = 'ATTR13'
      LEFT JOIN attribute_nesting_mst A18 ON m.item_type = A18.anm_attr_cd AND A18.anm_attr = 'ATTR18'
      ${whereClause}
      ORDER BY m.${safeSortCol} ${safeSortDir}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    // Fetch names from DBWH_8555
    const uniqueCards = [...new Set(salesRes.recordset.map(r => r.card_no))].filter(Boolean);
    if (uniqueCards.length > 0) {
      try {
        const crmPool = await getCrmPool();
        const nameMap = new Map();
        const batchSize = 1000;
        
        for (let i = 0; i < uniqueCards.length; i += batchSize) {
          const batch = uniqueCards.slice(i, i + batchSize);
          const nameReq = crmPool.request();
          const cardParams = batch.map((c, idx) => {
            nameReq.input('c' + idx, sql.NVarChar, c);
            return '@c' + idx;
          }).join(',');
          
          const namesRes = await nameReq.query(`SELECT MEMBER_ID, PHONE_NUMBER, CUST_NAME FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK) WHERE MEMBER_ID IN (${cardParams}) OR PHONE_NUMBER IN (${cardParams})`);
          namesRes.recordset.forEach(n => {
            if (n.MEMBER_ID) nameMap.set(n.MEMBER_ID, n.CUST_NAME);
            if (n.PHONE_NUMBER) nameMap.set(n.PHONE_NUMBER, n.CUST_NAME);
          });
        }
        
        salesRes.recordset.forEach(r => {
          r.member_name = nameMap.get(r.card_no) || r.member_name;
        });
      } catch (err) {
        console.error("Failed to fetch names from DBWH_8555:", err.message);
      }
    }

    // Top Departments Aggregation
    const deptRequest = pool.request();
    let deptWhere = "WHERE 1=1";
    if (fromDate && toDate) {
      deptWhere += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
      deptRequest.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
      deptRequest.input('toDate', sql.VarChar, toDate + ' 23:59:59');
    }
    if (store && store !== 'All Stores') {
      deptWhere += " AND m.org_cd = @store";
      deptRequest.input('store', sql.NVarChar, store);
    }
    const deptRes = await deptRequest.query(`
      SELECT TOP 5 ISNULL(A4.anm_desc, 'UNKNOWN') as department, SUM(m.qty) as total_qty, COUNT(1) as tx_count
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
      ${deptWhere}
      GROUP BY A4.anm_desc
      ORDER BY total_qty DESC
    `);

    // Top Brands Aggregation
    const brandRequest = pool.request();
    let brandWhere = "WHERE 1=1";
    if (fromDate && toDate) {
      brandWhere += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
      brandRequest.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
      brandRequest.input('toDate', sql.VarChar, toDate + ' 23:59:59');
    }
    if (store && store !== 'All Stores') {
      brandWhere += " AND m.org_cd = @store";
      brandRequest.input('store', sql.NVarChar, store);
    }
    const brandRes = await brandRequest.query(`
      SELECT TOP 5 ISNULL(A7.anm_desc, 'UNKNOWN') as brand, SUM(m.qty) as total_qty, COUNT(1) as tx_count
      FROM ITEM_SALES_MEMBER m
      LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
      ${brandWhere}
      GROUP BY A7.anm_desc
      ORDER BY total_qty DESC
    `);

    res.json({
      sales: salesRes.recordset,
      total,
      deptStats: deptRes.recordset,
      brandStats: brandRes.recordset,
      page: parseInt(page),
      perPage: limit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/dev/loyalty/export/:tab/:format', async (req, res) => {
  const { tab, format } = req.params;
  if (format !== 'excel') return res.status(400).json({ error: 'Only excel supported for now' });

  const { store, fromDate, toDate, search } = req.query;
  
  try {
    const pool = await poolPromise;
    const request = pool.request();
    let query = "";
    let columns = [];
    let title = "";

    if (tab === 'profiles') {
      title = "Member Profiles";
      columns = [
        { header: 'Member ID', key: 'member_id', width: 20 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Phone', key: 'mobile_no', width: 15 },
        { header: 'Join Date', key: 'join_date', width: 15 },
        { header: 'City', key: 'city', width: 15 },
        { header: 'Total Spent', key: 'total_spent', width: 15 },
        { header: 'Total Txn', key: 'total_transactions', width: 10 },
        { header: 'Last Active', key: 'last_active_date', width: 15 },
        { header: 'Fav Store', key: 'favorite_store', width: 15 }
      ];

      let where = "WHERE 1=1";
      if (store && store !== 'All Stores') {
        where += " AND favorite_store = @store";
        request.input('store', sql.NVarChar, store);
      }
      if (fromDate && toDate) {
        where += " AND join_date >= @fromDate AND join_date <= @toDate";
        request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (search) {
        where += " AND (member_id LIKE @search OR name LIKE @search OR mobile_no LIKE @search)";
        request.input('search', sql.NVarChar, `%${search}%`);
      }

      query = `
        SELECT member_id, name, mobile_no, join_date, city,
               ISNULL(total_spent, 0) as total_spent, ISNULL(total_transactions, 0) as total_transactions, last_active_date, favorite_store
        FROM LOYAL_MEMBER_PROFILE WITH (NOLOCK)
        ${where}
        ORDER BY total_spent DESC
      `;
    } else if (tab === 'summaries') {
      title = "Daily Summaries";
      columns = [
        { header: 'Member ID', key: 'member_id', width: 20 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Phone', key: 'mobile_no', width: 15 },
        { header: 'Date', key: 'summary_date', width: 15 },
        { header: 'Store', key: 'org_cd', width: 10 },
        { header: 'Total Sales', key: 'total_sales', width: 15 },
        { header: 'Total Cost', key: 'total_cost', width: 15 },
        { header: 'Total Qty', key: 'total_qty', width: 10 },
        { header: 'Total Txn', key: 'total_txn', width: 10 }
      ];

      let where = "WHERE 1=1";
      if (store && store !== 'All Stores') {
        where += " AND s.org_cd = @store";
        request.input('store', sql.NVarChar, store);
      }
      if (fromDate && toDate) {
        where += " AND s.summary_date >= @fromDate AND s.summary_date <= @toDate";
        request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (search) {
        where += " AND (s.member_id LIKE @search OR p.name LIKE @search)";
        request.input('search', sql.NVarChar, `%${search}%`);
      }

      query = `
        SELECT s.*, p.name as name, p.mobile_no as mobile_no
        FROM LOYAL_MEMBER_DAILY_SUMMARY s WITH (NOLOCK)
        LEFT JOIN LOYAL_MEMBER_PROFILE p WITH (NOLOCK) ON s.member_id = p.member_id
        ${where}
        ORDER BY s.summary_date DESC
      `;
    } else if (tab === 'item-sales') {
      title = "Item Sales";
      columns = [
        { header: 'Member ID', key: 'card_no', width: 20 },
        { header: 'Customer Name', key: 'member_name', width: 25 },
        { header: 'Store', key: 'org_cd', width: 10 },
        { header: 'Date', key: 'bill_dt', width: 15 },
        { header: 'Item Code', key: 'itm_cd', width: 15 },
        { header: 'Item Name', key: 'item_name', width: 25 },
        { header: 'Qty', key: 'qty', width: 10 },
        { header: 'Gross Value', key: 'gross_value', width: 15 },
        { header: 'Net Value', key: 'net_value', width: 15 },
        { header: 'Department', key: 'department_name', width: 20 },
        { header: 'Brand', key: 'brand_name', width: 20 }
      ];

      let where = "WHERE 1=1";
      if (store && store !== 'All Stores') {
        where += " AND m.org_cd = @store";
        request.input('store', sql.NVarChar, store);
      }
      if (fromDate && toDate) {
        where += " AND m.bill_dt >= @fromDate AND m.bill_dt <= @toDate";
        request.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
        request.input('toDate', sql.VarChar, toDate + ' 23:59:59');
      }
      if (search) {
        where += ` AND (
          m.itm_cd LIKE @search OR 
          m.item_name LIKE @search OR 
          m.card_no LIKE @search OR 
          p1.name LIKE @search OR 
          p2.name LIKE @search
        )`;
        request.input('search', sql.NVarChar, `%${search}%`);
      }

      query = `
        SELECT m.*, 
               COALESCE(p1.name, p2.name, 'Anonymous member') as member_name,
               ISNULL(A4.anm_desc, 'UNKNOWN') as department_name, 
               ISNULL(A7.anm_desc, 'UNKNOWN') as brand_name
        FROM ITEM_SALES_MEMBER m
        LEFT JOIN LOYAL_MEMBER_PROFILE p1 ON m.card_no = p1.member_id
        LEFT JOIN LOYAL_MEMBER_PROFILE p2 ON m.card_no = p2.mobile_no
        LEFT JOIN attribute_nesting_mst A4 ON m.department = A4.anm_attr_cd AND A4.anm_attr = 'ATTR4'
        LEFT JOIN attribute_nesting_mst A7 ON m.brand = A7.anm_attr_cd AND A7.anm_attr = 'ATTR7'
        ${where}
        ORDER BY m.bill_dt DESC
      `;
    } else {
      return res.status(400).json({ error: 'Invalid tab' });
    }

    const result = await request.query(query);
    const rows = result.recordset;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(title);

    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    worksheet.addRows(rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${tab}-report.xlsx`);
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("API_ERR:", err); res.status(500).json({ error: err.message });
  }
});

router.get('/api/dev/loyalty/etl-status', (req, res) => {
  res.json({ running: devEtlRunning, logs: devEtlLogs });
});

router.post('/api/dev/loyalty/trigger-etl', async (req, res) => {
  const { fromDate, toDate } = req.body;
  if (!fromDate || !toDate) {
    return res.status(400).json({ error: 'Please specify fromDate and toDate' });
  }

  if (devEtlRunning) {
    return res.status(400).json({ error: 'ETL is already running' });
  }

  const { runDevEtl } = require('../scripts/sync_dev_loyalty_etl.cjs');
  
  devEtlRunning = true;
  devEtlLogs = [];
  
  const logFn = (msg) => {
    const timeStr = new Date().toLocaleTimeString();
    devEtlLogs.push(`[${timeStr}] ${msg}`);
    console.log(`[DEV-ETL] ${msg}`);
  };

  logFn(`Starting manual ETL trigger for range: ${fromDate} to ${toDate}`);
  
  (async () => {
    try {
      logFn(`Step 1/3: Syncing HOSERVER DIM_ITEM...`);
      await runHoServerDimItemSync();
      
      logFn(`Step 2/3: Syncing ITEM_SALES_MEMBER...`);
      await runItemSalesSync(fromDate, toDate, logFn);

      logFn(`Step 3/3: Running DEV_LOYALTY ETL...`);
      await runDevEtl(fromDate, toDate, logFn);

      logFn(`ETL completed successfully!`);
      devEtlRunning = false;
    } catch (err) {
      logFn(`ETL failed: ${err.message}`);
      devEtlRunning = false;
    }
  })();

  res.json({ message: 'ETL process started in background' });
});

// \u2500€\u2500€ GET /api/crm/reports/stores \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/crm/reports/stores', async (req, res) => {
  try {
    const crmPool = await getCrmPool();
    const result = await crmPool.request().query(`
      SELECT DISTINCT ORG_CD AS org_cd, ORG_NAME AS org_name 
      FROM DimStore 
      WHERE ORG_STATUS = 'O' AND ORG_LEVEL_NUMBER = 3
      ORDER BY ORG_CD ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/crm/reports/:type \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/crm/reports/:type', async (req, res) => {
  const { type } = req.params;
  const { fromDate, toDate, store, search, page = 1, perPage = 100, sortBy, sortDir = 'desc' } = req.query;

  try {
    const crmPool = await getCrmPool();
    const offset = (parseInt(page) - 1) * parseInt(perPage);
    const limit = parseInt(perPage);

    let query = "";
    let countQuery = "";
    let params = { fromDate, toDate };

    if (type === 'txn-analysis') {
      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.bill_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      const orderCol = sortBy || 'h.bill_DT';
      const orderDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      query = `
        SELECT
            q.RLITQ_ORG_CD AS org_cd,
            d.ORG_NAME AS store_name,
            q.RLITQ_BILL_NO AS bill_no,
            CONVERT(DATE, h.bill_dt) AS txn_date,
            h.bill_time AS txn_time,
            q.RLITQ_CARD_NO AS card_no,
            m.RLICM_NAME AS cust_name,
            m.RLICM_MOBILE_NO AS phone_no,
            q.RLITQ_OPENING_POINTS AS prev_points,
            FLOOR(ISNULL(h.NET_VALUE, 0) / 50000) AS point_earned,
            h.NET_VALUE AS bill_value,
            (ISNULL(q.RLITQ_OPENING_POINTS, 0) + FLOOR(ISNULL(h.NET_VALUE, 0) / 50000)) AS total_points,
            CASE WHEN FLOOR(ISNULL(h.NET_VALUE, 0) / 50000) > 0 THEN 'Earned' ELSE 'No Points' END AS point_status,
            CASE WHEN h.NET_VALUE >= 500000 THEN 'Premium' WHEN h.NET_VALUE >= 200000 THEN 'High' WHEN h.NET_VALUE >= 50000 THEN 'Medium' ELSE 'Low' END AS bill_category
        FROM POS_SALES_HDR (NOLOCK) h
        INNER JOIN RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q ON h.BILL_NO = q.RLITQ_BILL_NO AND h.ORG_CD = q.RLITQ_ORG_CD
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        ${where}
        ORDER BY ${orderCol} ${orderDir}
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;

      countQuery = `
        SELECT 
            COUNT(*) as total,
            SUM(ISNULL(h.NET_VALUE, 0)) AS total_bill_value,
            SUM(FLOOR(ISNULL(h.NET_VALUE, 0) / 50000)) AS total_points_earned
        FROM POS_SALES_HDR (NOLOCK) h
        INNER JOIN RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q ON h.BILL_NO = q.RLITQ_BILL_NO AND h.ORG_CD = q.RLITQ_ORG_CD
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        ${where}
      `;
    }
    else if (type === 'frequent-shopper') {
      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.bill_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT x.*,
               CASE WHEN x.frequently > 3 THEN 'LOYAL' WHEN x.frequently >= 1 THEN 'REGULAR' ELSE 'PASSIVE' END AS cust_category
        FROM (
            SELECT
                q.RLITQ_ORG_CD AS org_cd,
                d.ORG_NAME AS store_name,
                q.RLITQ_CARD_NO AS card_no,
                m.RLICM_NAME AS cust_name,
                m.RLICM_MOBILE_NO AS phone_no,
                COUNT(q.RLITQ_CARD_NO) AS frequently
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q
            LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
            LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
            LEFT JOIN POS_SALES_HDR (NOLOCK) h ON q.RLITQ_BILL_NO = h.bill_no
            ${where}
            GROUP BY q.RLITQ_ORG_CD, d.ORG_NAME, q.RLITQ_CARD_NO, m.RLICM_NAME, m.RLICM_MOBILE_NO
        ) x
        ORDER BY frequently DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;

      countQuery = `
        SELECT COUNT(DISTINCT q.RLITQ_CARD_NO) as total
        FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        LEFT JOIN POS_SALES_HDR (NOLOCK) h ON q.RLITQ_BILL_NO = h.bill_no
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        ${where}
      `;
    }
    else if (type === 'member-enrollment') {
      // member-enrollment and top-spender typically use data warehouse tables
      // For trial, I'll implement member-enrollment
      let where = "WHERE JOIN_DATE BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND STORE_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (MEMBER_ID LIKE @search OR CUST_NAME LIKE @search OR PHONE_NUMBER LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
         SELECT STORE_NAME, MEMBER_ID, CUST_NAME, PHONE_NUMBER, 
                JOIN_DATE, REGISTRATION_TYPE, STARTING_POINTS,
                CASE WHEN IS_ACTIVE = 1 THEN 'Yes' ELSE 'No' END AS IS_ACTIVE
         FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK)
         ${where}
         ORDER BY JOIN_DATE DESC, CREATED_AT DESC
         OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
       `;
      countQuery = `SELECT COUNT(*) as total FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK) ${where}`;
    }
    else if (type === 'top-spender') {
      const topLimit = parseInt(req.query.top) || 100;
      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.BILL_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT TOP ${topLimit}
            q.RLITQ_CARD_NO AS card_no,
            MAX(m.RLICM_NAME) AS cust_name,
            MAX(m.RLICM_MOBILE_NO) AS phone_no,
            COUNT(DISTINCT q.RLITQ_BILL_NO) AS total_txn,
            SUM(ISNULL(h.NET_VALUE, 0)) AS total_net_sales
        FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        LEFT JOIN POS_SALES_HDR (NOLOCK) h ON q.RLITQ_BILL_NO = h.BILL_NO AND q.RLITQ_ORG_CD = h.ORG_CD
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        ${where}
        GROUP BY q.RLITQ_CARD_NO
        ORDER BY total_net_sales DESC
      `;
      countQuery = `SELECT ${topLimit} AS total`;
    }
    else if (type === 'fraud-analysis') {
      let where = "WHERE h.BILL_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      const cte = `
        WITH DailyCounts AS (
            SELECT 
                q.RLITQ_CARD_NO as card_no,
                MAX(m.RLICM_NAME) as cust_name,
                CAST(h.BILL_DT AS DATE) as trx_date,
                COUNT(q.RLITQ_BILL_NO) as daily_trx_count,
                MAX(q.RLITQ_ORG_CD) as org_cd,
                MAX(d.ORG_NAME) as store_name,
                MAX(h.COUNTER_NO) as counter_no,
                MAX(h.SESSION_NO) as session_no,
                MAX(h.SALESMAN_ID_SEC) as salesman_id
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE q (NOLOCK)
            JOIN POS_SALES_HDR h (NOLOCK) ON q.RLITQ_BILL_NO = h.BILL_NO AND q.RLITQ_ORG_CD = h.ORG_CD
            LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST m (NOLOCK) ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
            LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
            ${where}
            GROUP BY q.RLITQ_CARD_NO, CAST(h.BILL_DT AS DATE)
            HAVING COUNT(q.RLITQ_BILL_NO) >= 3
               AND COUNT(DISTINCT h.COUNTER_NO) = 1
               AND COUNT(DISTINCT h.SESSION_NO) = 1
        ),
        ConsecutiveLag AS (
            SELECT 
                card_no, 
                cust_name, 
                org_cd,
                store_name,
                trx_date as latest_date,
                LAG(trx_date) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_date,
                daily_trx_count as latest_count, 
                LAG(daily_trx_count) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_count,
                salesman_id as latest_salesman,
                LAG(salesman_id) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_salesman,
                'Suspicious Activity' as fraud_warning
            FROM DailyCounts
        ),
        ConsecutiveCheck AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY card_no ORDER BY latest_date DESC) as rn
            FROM ConsecutiveLag 
            WHERE DATEDIFF(day, prev_date, latest_date) = 1
              AND latest_salesman = prev_salesman
        )
      `;

      query = `
        ${cte}
        SELECT * FROM ConsecutiveCheck WHERE rn = 1
        ORDER BY latest_date DESC, latest_count DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;

      countQuery = `
        ${cte}
        SELECT COUNT(*) as total FROM ConsecutiveCheck WHERE rn = 1
      `;
    }
    else if (type === 'wakeup-call') {
      const pageNum    = parseInt(page)    || 1;
      const perPageNum = parseInt(perPage) || 50;
      const offset = (pageNum - 1) * perPageNum;

      try {
        let where = 'WHERE 1=1';
        const pool = await poolPromise;
        const reqDb = pool.request(); // Use default pool (DBWH_8529)

        if (store && store !== 'All Store') {
          const scRes = await crmPool.request().input('sn', sql.NVarChar, store).query('SELECT TOP 1 ORG_CD FROM DimStore WHERE ORG_NAME=@sn');
          if (scRes.recordset.length > 0) {
            where += ` AND last_store = @storeCd`;
            reqDb.input('storeCd', sql.VarChar, scRes.recordset[0].ORG_CD);
          } else {
            where += ` AND last_store = @storeName`;
            reqDb.input('storeName', sql.VarChar, store);
          }
        }

        if (fromDate && toDate) {
           where += ` AND last_purchase_date >= @fromDate AND last_purchase_date <= @toDate`;
           reqDb.input('fromDate', sql.VarChar, fromDate + ' 00:00:00');
           reqDb.input('toDate', sql.VarChar, toDate + ' 23:59:59');
        }

        if (search) {
           where += ` AND (member_name LIKE @s OR card_no LIKE @s)`;
           reqDb.input('s', sql.NVarChar, `%${search}%`);
        }

        const countRes = await reqDb.query(`SELECT COUNT(*) as total FROM WakeupCallCache ${where}`);
        const total = countRes.recordset[0].total;

        reqDb.input('offset', sql.Int, offset);
        reqDb.input('limit', sql.Int, perPageNum);

        let orderCol = 'total_amount';
        if (sortBy === 'name') orderCol = 'member_name';
        else if (sortBy === 'phone_no') orderCol = 'mobile_no';
        else if (sortBy === 'current_point') orderCol = 'total_transactions'; // Fallback since points are removed
        else if (sortBy === 'total_txn') orderCol = 'total_transactions';
        else if (sortBy === 'last_txn_date') orderCol = 'last_purchase_date';
        else if (sortBy === 'last_store') orderCol = 'last_store';
        else if (sortBy === 'total_amount') orderCol = 'total_amount';
        else if (sortBy === 'card_no') orderCol = 'card_no';
        if (!sortDir) sortDir = 'desc';

        const dataRes = await reqDb.query(`
          SELECT *
          FROM WakeupCallCache 
          ${where} 
          ORDER BY ${orderCol} ${sortDir} 
          OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

        const allStoresRes = await crmPool.request().query('SELECT ORG_CD, ORG_NAME FROM DimStore');
        const storeMap = {};
        allStoresRes.recordset.forEach(r => { storeMap[r.ORG_CD] = r.ORG_NAME; });

        const rows = dataRes.recordset.map(r => ({
          name: r.member_name,
          card_no: r.card_no,
          phone_no: r.mobile_no,
          tier: 'Regular',
          activation_status: 'Activated',
          current_point: 0,
          total_txn: r.total_transactions,
          total_amount: r.total_amount,
          last_txn_date: r.last_purchase_date,
          last_store: storeMap[r.last_store] || r.last_store
        }));

        return res.json({
          rows,
          total,
          summary: { total: total, status: 'COMPLETED' },
          page: pageNum,
          perPage: perPageNum,
          totalPages: Math.ceil(total / perPageNum)
        });
      } catch (e) {
        return res.status(500).json({ error: `WAKEUP-CALL: ${e.message}` });
      }
    }
    else {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const request = crmPool.request();
    Object.keys(params).forEach(key => {
      request.input(key, sql.NVarChar, params[key]);
    });

    const [dataRes, countRes] = await Promise.all([
      request.query(query),
      request.query(countQuery)
    ]);

    let total = countRes.recordset[0]?.total || 0;
    let summary = countRes.recordset[0] || {};

    if (type === 'top-spender') {
      total = dataRes.recordset.length;
      summary = { total };
    }

    res.json({
      rows: dataRes.recordset,
      total,
      summary,
      page: parseInt(page),
      perPage: parseInt(perPage),
      totalPages: type === 'top-spender' ? 1 : Math.ceil(total / parseInt(perPage))
    });

  } catch (err) {
    console.error(`CRM Report Error (${type}):`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ GET /api/crm/reports/:type/export/:format \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/crm/reports/:type/export/:format', async (req, res) => {
  const { type, format } = req.params;
  const { fromDate, toDate, store, search, sortBy, sortDir = 'desc' } = req.query;

  try {
    const crmPool = await getCrmPool();
    let query = "";
    let params = { fromDate, toDate };
    let columns = [];
    let title = "";

    // Reuse the same logic as the main endpoint, but WITHOUT pagination
    if (type === 'txn-analysis') {
      title = "Wise Customer Transaction Analysis";
      columns = [
        { header: 'Store Code', key: 'org_cd', width: 15 },
        { header: 'Store Name', key: 'store_name', width: 25 },
        { header: 'Bill No', key: 'bill_no', width: 20 },
        { header: 'Date', key: 'txn_date', width: 15 },
        { header: 'Time', key: 'txn_time', width: 10 },
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Customer', key: 'cust_name', width: 25 },
        { header: 'Phone', key: 'phone_no', width: 15 },
        { header: 'Prev Pts', key: 'prev_points', width: 10 },
        { header: 'Earned', key: 'point_earned', width: 10 },
        { header: 'Value', key: 'bill_value', width: 15, style: { numFmt: '#,##0' } },
        { header: 'Total Pts', key: 'total_points', width: 10 },
        { header: 'Status', key: 'point_status', width: 10 },
        { header: 'Category', key: 'bill_category', width: 10 },
      ];

      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.bill_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }
      const orderCol = sortBy || 'h.bill_DT';
      const orderDir = sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      query = `
        SELECT
            q.RLITQ_ORG_CD AS org_cd, d.ORG_NAME AS store_name, q.RLITQ_BILL_NO AS bill_no,
            CONVERT(DATE, h.bill_dt) AS txn_date, h.bill_time AS txn_time,
            q.RLITQ_CARD_NO AS card_no, m.RLICM_NAME AS cust_name, m.RLICM_MOBILE_NO AS phone_no,
            q.RLITQ_OPENING_POINTS AS prev_points, FLOOR(ISNULL(h.NET_VALUE, 0) / 50000) AS point_earned,
            h.NET_VALUE AS bill_value, (ISNULL(q.RLITQ_OPENING_POINTS, 0) + FLOOR(ISNULL(h.NET_VALUE, 0) / 50000)) AS total_points,
            CASE WHEN FLOOR(ISNULL(h.NET_VALUE, 0) / 50000) > 0 THEN 'Earned' ELSE 'No Points' END AS point_status,
            CASE WHEN h.NET_VALUE >= 500000 THEN 'Premium' WHEN h.NET_VALUE >= 200000 THEN 'High' WHEN h.NET_VALUE >= 50000 THEN 'Medium' ELSE 'Low' END AS bill_category
        FROM POS_SALES_HDR (NOLOCK) h
        INNER JOIN RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q ON h.BILL_NO = q.RLITQ_BILL_NO AND h.ORG_CD = q.RLITQ_ORG_CD
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        ${where}
        ORDER BY ${orderCol} ${orderDir}
      `;
    }
    else if (type === 'frequent-shopper') {
      title = "Customer Frequently Shopper";
      columns = [
        { header: 'Org Code', key: 'org_cd', width: 10 },
        { header: 'Store Name', key: 'store_name', width: 25 },
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Customer', key: 'cust_name', width: 25 },
        { header: 'Phone No', key: 'phone_no', width: 15 },
        { header: 'Frequency', key: 'frequently', width: 10 },
        { header: 'Category', key: 'cust_category', width: 15 },
      ];

      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.bill_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT x.*, CASE WHEN x.frequently > 3 THEN 'LOYAL' WHEN x.frequently >= 1 THEN 'REGULAR' ELSE 'PASSIVE' END AS cust_category
        FROM (
            SELECT q.RLITQ_ORG_CD AS org_cd, d.ORG_NAME AS store_name, q.RLITQ_CARD_NO AS card_no,
                   m.RLICM_NAME AS cust_name, m.RLICM_MOBILE_NO AS phone_no, COUNT(q.RLITQ_CARD_NO) AS frequently
            FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q
            LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
            LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
            LEFT JOIN POS_SALES_HDR (NOLOCK) h ON q.RLITQ_BILL_NO = h.bill_no
            ${where}
            GROUP BY q.RLITQ_ORG_CD, d.ORG_NAME, q.RLITQ_CARD_NO, m.RLICM_NAME, m.RLICM_MOBILE_NO
        ) x
        ORDER BY frequently DESC
      `;
    }
    else if (type === 'member-enrollment') {
      title = "Member Enrollment Analysis";
      columns = [
        { header: 'Store Name', key: 'STORE_NAME', width: 25 },
        { header: 'Member ID', key: 'MEMBER_ID', width: 20 },
        { header: 'Customer Name', key: 'CUST_NAME', width: 25 },
        { header: 'Phone No', key: 'PHONE_NUMBER', width: 15 },
        { header: 'Join Date', key: 'JOIN_DATE', width: 15 },
        { header: 'Channel', key: 'REGISTRATION_TYPE', width: 20 },
        { header: 'Starting Points', key: 'STARTING_POINTS', width: 15 },
        { header: 'Active', key: 'IS_ACTIVE', width: 10 },
      ];

      let where = "WHERE JOIN_DATE BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND STORE_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (MEMBER_ID LIKE @search OR CUST_NAME LIKE @search OR PHONE_NUMBER LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT STORE_NAME, MEMBER_ID, CUST_NAME, PHONE_NUMBER, 
               JOIN_DATE, REGISTRATION_TYPE, STARTING_POINTS,
               CASE WHEN IS_ACTIVE = 1 THEN 'Yes' ELSE 'No' END AS IS_ACTIVE
        FROM RXL_LOYALID_ENROLLMENT WITH (NOLOCK)
        ${where}
        ORDER BY JOIN_DATE DESC, CREATED_AT DESC
      `;
    }
    else if (type === 'top-spender') {
      const topLimit = parseInt(req.query.top) || 100;
      title = "Top Spender Analysis";
      columns = [
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Customer', key: 'cust_name', width: 25 },
        { header: 'Phone No', key: 'phone_no', width: 15 },
        { header: 'Net Sales', key: 'total_net_sales', width: 20, style: { numFmt: '#,##0' } },
        { header: 'Total Txn', key: 'total_txn', width: 10 },
        { header: 'Tier', key: 'spender_tier', width: 15 },
      ];

      let where = "WHERE q.RLITQ_INTEG_CODE = '110' AND h.BILL_DT BETWEEN @fromDate AND @toDate";
      if (store && store !== 'All Store') {
        where += " AND d.ORG_NAME = @store";
        params.store = store;
      }
      if (search) {
        where += " AND (q.RLITQ_CARD_NO LIKE @search OR m.RLICM_NAME LIKE @search)";
        params.search = `%${search}%`;
      }

      query = `
        SELECT TOP ${topLimit}
            q.RLITQ_CARD_NO AS card_no,
            MAX(m.RLICM_NAME) AS cust_name,
            MAX(m.RLICM_MOBILE_NO) AS phone_no,
            COUNT(DISTINCT q.RLITQ_BILL_NO) AS total_txn,
            SUM(ISNULL(h.NET_VALUE, 0)) AS total_net_sales,
            CASE 
                WHEN SUM(ISNULL(h.NET_VALUE, 0)) >= 5000000 THEN 'Platinum'
                WHEN SUM(ISNULL(h.NET_VALUE, 0)) >= 1000000 THEN 'Gold'
                ELSE 'Silver' 
            END AS spender_tier
        FROM RXL_LOYALTY_INTEG_TRANS_QUEUE (NOLOCK) q
        LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST (NOLOCK) m ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
        LEFT JOIN POS_SALES_HDR (NOLOCK) h ON q.RLITQ_BILL_NO = h.BILL_NO AND q.RLITQ_ORG_CD = h.ORG_CD
        LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
        ${where}
        GROUP BY q.RLITQ_CARD_NO
        ORDER BY total_net_sales DESC
      `;
    }
    else if (type === 'wakeup-call') {
      title = "Wakeup Call Customer";
      columns = [
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Card No', key: 'card_no', width: 20 },
        { header: 'Phone No', key: 'phone_no', width: 15 },
        { header: 'Tier', key: 'tier', width: 10 },
        { header: 'Activation Status', key: 'activation_status', width: 15 },
        { header: 'Current Point', key: 'current_point', width: 15 },
        { header: 'Total Transaction', key: 'total_txn', width: 15 },
        { header: 'Total Amount', key: 'total_amount', width: 20, style: { numFmt: '#,##0' } },
        { header: 'Last Txn Date', key: 'last_txn_date', width: 15 },
        { header: 'Last Txn Store', key: 'last_store', width: 25 },
      ];

      let where = "WHERE 1=1";
      if (store && store !== 'All Store') {
        const scRes = await crmPool.request().input('sn', sql.NVarChar, store).query('SELECT TOP 1 ORG_CD FROM DimStore WHERE ORG_NAME=@sn');
        if (scRes.recordset.length > 0) {
           where += " AND last_store = @storeCd";
           params.storeCd = scRes.recordset[0].ORG_CD;
        } else {
           where += " AND last_store = @storeName";
           params.storeName = store;
        }
      }

      if (search) {
        where += " AND (member_name LIKE @search OR card_no LIKE @search)";
        params.search = `%${search}%`;
      }

      if (fromDate && toDate) {
         where += ` AND last_purchase_date >= @fromDate AND last_purchase_date <= @toDate`;
         params.fromDate = fromDate + ' 00:00:00';
         params.toDate = toDate + ' 23:59:59';
      }

      let orderCol = 'total_amount';
      if (sortBy === 'name') orderCol = 'member_name';
      else if (sortBy === 'phone_no') orderCol = 'mobile_no';
      else if (sortBy === 'current_point') orderCol = 'total_transactions'; // Fallback
      else if (sortBy === 'total_txn') orderCol = 'total_transactions';
      else if (sortBy === 'last_txn_date') orderCol = 'last_purchase_date';
      else if (sortBy === 'last_store') orderCol = 'last_store';
      else if (sortBy === 'total_amount') orderCol = 'total_amount';
      else if (sortBy === 'card_no') orderCol = 'card_no';
      if (!sortDir) sortDir = 'desc';

      query = `
        SELECT 
            member_name as name,
            card_no,
            mobile_no as phone_no,
            'Regular' as tier,
            'Activated' as activation_status,
            0 as current_point,
            total_transactions as total_txn,
            total_amount,
            CONVERT(DATE, last_purchase_date) as last_txn_date,
            last_store
        FROM WakeupCallCache
        ${where}
        ORDER BY ${orderCol} ${sortDir}
      `;
    }

    let request;
    if (type === 'wakeup-call') {
      const pool = await poolPromise;
      request = pool.request();
    } else {
      request = crmPool.request();
    }
    Object.keys(params).forEach(key => {
      request.input(key, sql.NVarChar, params[key]);
    });

    const result = await request.query(query);
    const rows = result.recordset;

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');

      // Style headers
      worksheet.columns = columns;
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

      worksheet.addRows(rows);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-report.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    }
    else if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, layout: 'landscape' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${type}-report.pdf`);
      doc.pipe(res);

      doc.fontSize(18).text(title, { align: 'center' });
      doc.fontSize(10).text(`Period: ${fromDate} to ${toDate}`, { align: 'center' });
      doc.moveDown();

      // Simple table drawing logic
      const tableTop = 100;
      let y = tableTop;

      // Draw Headers
      doc.fontSize(8).font('Helvetica-Bold');
      let x = 30;
      columns.forEach(col => {
        doc.text(col.header, x, y, { width: col.width * 7, truncate: true });
        x += col.width * 7;
      });

      y += 15;
      doc.moveTo(30, y).lineTo(x, y).stroke();
      y += 5;

      // Draw Rows
      doc.font('Helvetica');
      rows.slice(0, 500).forEach(row => { // Limit PDF to 500 rows for performance
        if (y > 550) {
          doc.addPage({ layout: 'landscape' });
          y = 30;

          // Redraw headers on new page
          doc.fontSize(8).font('Helvetica-Bold');
          x = 30;
          columns.forEach(col => {
            doc.text(col.header, x, y, { width: col.width * 7, truncate: true });
            x += col.width * 7;
          });
          y += 15;
          doc.moveTo(30, y).lineTo(x, y).stroke();
          y += 5;
          doc.font('Helvetica');
        }
        x = 30;
        columns.forEach(col => {
          let val = row[col.key];
          if (val instanceof Date) val = val.toISOString().split('T')[0];
          doc.text(String(val || '-'), x, y, { width: col.width * 7, truncate: true });
          x += col.width * 7;
        });
        y += 12;
      });

      if (rows.length > 500) {
        doc.moveDown().text(`... and ${rows.length - 500} more records (Export to Excel for full data)`, { italic: true });
      }

      doc.end();
    } else {
      res.status(400).send('Invalid format');
    }
  } catch (err) {
    console.error('Export Error:', err);
    res.status(500).send(err.message);
  }
});

// \u2500€\u2500€ HELPDESK TICKETS API \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/tickets/updates', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { username, can_manage, since } = req.query;
    if (!since) return res.json([]);

    let query = `SELECT * FROM TroubleTickets WHERE updated_at > @since ORDER BY created_at DESC`;
    if (can_manage !== 'true' && username) {
      query = `SELECT * FROM TroubleTickets WHERE updated_at > @since AND created_by = @username ORDER BY created_at DESC`;
    }

    const result = await pool.request()
      .input('since', sql.DateTime, new Date(since))
      .input('username', sql.NVarChar, username)
      .query(query);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/tickets', async (req, res) => {
  try {
    const pool = await poolPromise;
    const { username, can_manage } = req.query;
    let query = `
      SELECT * FROM TroubleTickets 
      ORDER BY 
        CASE 
          WHEN status = 'Open' THEN 1
          WHEN status = 'In Progress' THEN 2
          ELSE 3
        END ASC, created_at DESC`;

    if (can_manage !== 'true' && username) {
      query = `
        SELECT * FROM TroubleTickets 
        WHERE created_by = '${username}' 
        ORDER BY 
          CASE 
            WHEN status = 'Open' THEN 1
            WHEN status = 'In Progress' THEN 2
            ELSE 3
          END ASC, created_at DESC`;
    }

    const result = await pool.request().query(query);
    const tickets = result.recordset;

    if (tickets.length > 0) {
      const ticketIds = tickets.map(t => `'${t.id}'`).join(',');

      // Fetch individual targets
      const targetsResult = await pool.request().query(`SELECT * FROM TicketTargets WHERE ticket_id IN (${ticketIds})`);
      const allTargets = targetsResult.recordset;

      // Fetch linked groups
      const groupsResult = await pool.request().query(`SELECT * FROM TicketGroups WHERE ticket_id IN (${ticketIds})`);
      const allLinkedGroups = groupsResult.recordset;

      // Fetch all devices to resolve groups
      const devicesResult = await pool.request().query('SELECT hostname, group_ids FROM Devices');
      const allDevices = devicesResult.recordset;

      tickets.forEach(ticket => {
        // Individual/Manual targets
        const ticketTargets = allTargets.filter(target => target.ticket_id === ticket.id);

        // Group targets
        const ticketGroups = allLinkedGroups.filter(tg => tg.ticket_id === ticket.id).map(tg => tg.group_id);
        const groupMembers = allDevices.filter(dev => {
          if (!dev.group_ids) return false;
          const gids = dev.group_ids.split(',');
          return ticketGroups.some(tgid => gids.includes(tgid));
        }).map(dev => ({
          hostname: dev.hostname,
          isFromGroup: true
        }));

        // Merge hosts ensuring uniqueness by hostname
        const mergedHosts = [...ticketTargets];
        groupMembers.forEach(gm => {
          if (!mergedHosts.find(mh => mh.hostname === gm.hostname)) {
            mergedHosts.push({
              hostname: gm.hostname,
              status: 'Pending',
              remark: null,
              isFromGroup: true
            });
          }
        });

        ticket.targets = mergedHosts;
        ticket.linked_group_ids = ticketGroups;
      });
    }

    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/tickets', async (req, res) => {
  try {
    const { id, title, description, category, priority, outlet_name, hostname, created_by, assigned_to, selected_group_ids } = req.body;
    const pool = await poolPromise;
    const nowStr = getISOTimestamp();

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description)
      .input('category', sql.NVarChar, category)
      .input('priority', sql.NVarChar, priority)
      .input('status', sql.NVarChar, 'Open')
      .input('outlet_name', sql.NVarChar, outlet_name)
      .input('hostname', sql.NVarChar, hostname)
      .input('created_by', sql.NVarChar, created_by)
      .input('assigned_to', sql.NVarChar, assigned_to || null)
      .input('now', sql.NVarChar, nowStr)
      .query(`
        INSERT INTO TroubleTickets 
        (id, title, description, category, priority, status, outlet_name, hostname, created_by, assigned_to, created_at, updated_at)
        VALUES (@id, @title, @description, @category, @priority, @status, @outlet_name, @hostname, @created_by, @assigned_to, @now, @now)
      `);

    // Handle Manual/Individual hostnames
    if (hostname && hostname.trim()) {
      const hosts = hostname.split(',').map(h => h.trim()).filter(h => h.length > 0);
      for (const host of hosts) {
        await pool.request()
          .input('ticket_id', sql.NVarChar, id)
          .input('hostname', sql.NVarChar, host)
          .input('now', sql.DateTime, new Date())
          .query(`INSERT INTO TicketTargets (ticket_id, hostname, status, updated_at) VALUES (@ticket_id, @hostname, 'Pending', @now)`);
      }
    }

    // Handle Linked Groups
    if (selected_group_ids && Array.isArray(selected_group_ids)) {
      for (const gid of selected_group_ids) {
        await pool.request()
          .input('ticket_id', sql.NVarChar, id)
          .input('group_id', sql.NVarChar, gid)
          .query(`INSERT INTO TicketGroups (ticket_id, group_id) VALUES (@ticket_id, @group_id)`);
      }
    }

    let logMsg = 'Ticket created';
    if (assigned_to) logMsg += ` and assigned to ${assigned_to}`;

    await pool.request()
      .input('ticket_id', sql.NVarChar, id)
      .input('action', sql.NVarChar, logMsg)
      .input('performed_by', sql.NVarChar, created_by)
      .input('now', sql.NVarChar, nowStr)
      .query(`INSERT INTO TicketLogs (ticket_id, action, performed_by, created_at) VALUES (@ticket_id, @action, @performed_by, @now)`);

    res.status(201).json({ message: 'Ticket created successfully' });
  } catch (err) {
    console.error("POST /api/tickets Error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/tickets/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolved_by, resolution_note, closed_by } = req.body;
    const pool = await poolPromise;

    // Validation: Block Resolve if multi-target and not all solved
    if (status === 'Resolved') {
      const targetsRes = await pool.request()
        .input('ticket_id', sql.NVarChar, id)
        .query(`SELECT hostname, status FROM TicketTargets WHERE ticket_id = @ticket_id`);
      const staticTargets = targetsRes.recordset;

      const groupsRes = await pool.request()
        .input('ticket_id', sql.NVarChar, id)
        .query(`SELECT group_id FROM TicketGroups WHERE ticket_id = @ticket_id`);
      const linkedGroups = groupsRes.recordset.map(g => g.group_id);

      if (linkedGroups.length > 0) {
        // Resolve dynamic group members
        const devicesRes = await pool.request().query('SELECT hostname, group_ids FROM Devices');
        const allDevices = devicesRes.recordset;

        const groupMembersHostnames = allDevices.filter(dev => {
          if (!dev.group_ids) return false;
          const gids = dev.group_ids.split(',');
          return linkedGroups.some(tgid => gids.includes(tgid));
        }).map(dev => dev.hostname);

        // Check if every group member is solved (must have a TicketTargets entry with status 'Solved')
        for (const hostname of groupMembersHostnames) {
          const isSolved = staticTargets.find(t => t.hostname === hostname && t.status === 'Solved');
          if (!isSolved) {
            return res.status(400).json({ error: `Cannot resolve: Device ${hostname} (from group) is still pending.` });
          }
        }
      }

      // Check static targets
      const unsolvedStatic = staticTargets.filter(t => t.status !== 'Solved');
      if (unsolvedStatic.length > 0) {
        return res.status(400).json({ error: `Cannot resolve: ${unsolvedStatic[0].hostname} is still pending.` });
      }
    }

    const nowStr = getISOTimestamp();
    const request = pool.request()
      .input('id', sql.NVarChar, id)
      .input('status', sql.NVarChar, status)
      .input('resolution_note', sql.NVarChar, resolution_note || null)
      .input('resolved_by', sql.NVarChar, resolved_by || null)
      .input('closed_by', sql.NVarChar, closed_by || null)
      .input('now', sql.NVarChar, nowStr);

    let updateQuery = `UPDATE TroubleTickets SET status = @status, updated_at = @now`;

    if (status === 'Resolved') {
      updateQuery += `, resolved_at = @now, resolved_by = @resolved_by, resolution_note = @resolution_note`;
    } else if (status === 'Closed') {
      updateQuery += `, closed_at = @now, closed_by = @closed_by`;
    }
    updateQuery += ` WHERE id = @id`;

    await request.query(updateQuery);

    const actor = resolved_by || closed_by || 'System';
    const actionDesc = status === 'Resolved' ? 'Ticket marked as Resolved' : (status === 'Closed' ? 'Ticket Closed & Confirmed' : `Status changed to ${status}`);
    await pool.request()
      .input('ticket_id', sql.NVarChar, id)
      .input('action', sql.NVarChar, actionDesc)
      .input('performed_by', sql.NVarChar, actor)
      .input('now', sql.NVarChar, nowStr)
      .query(`INSERT INTO TicketLogs (ticket_id, action, performed_by, created_at) VALUES (@ticket_id, @action, @performed_by, @now)`);

    res.json({ message: 'Status updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ NEW: Bulk update targets and groups \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.put('/api/tickets/:id/targets', async (req, res) => {
  try {
    const { id } = req.params;
    const { hostname, selected_group_ids, performed_by } = req.body;
    const pool = await poolPromise;
    const nowStr = getISOTimestamp();

    // Start Transaction
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // Update the main hostname string
      await transaction.request()
        .input('id', sql.NVarChar, id)
        .input('hostname', sql.NVarChar, hostname)
        .input('now', sql.NVarChar, nowStr)
        .query('UPDATE TroubleTickets SET hostname = @hostname, updated_at = @now WHERE id = @id');

      // Sync TicketTargets (Manual/Individual)
      // Keep existing ones that are still in the list, delete removed ones, add new ones
      const currentTargetsRes = await transaction.request()
        .input('ticket_id', sql.NVarChar, id)
        .query('SELECT hostname FROM TicketTargets WHERE ticket_id = @ticket_id');
      const currentHostnames = currentTargetsRes.recordset.map(r => r.hostname);

      const newHostnames = (hostname || '').split(',').map(h => h.trim()).filter(h => h.length > 0);

      // Delete removed
      const toDelete = currentHostnames.filter(h => !newHostnames.includes(h));
      for (const host of toDelete) {
        await transaction.request()
          .input('ticket_id', sql.NVarChar, id)
          .input('host', sql.NVarChar, host)
          .query('DELETE FROM TicketTargets WHERE ticket_id = @ticket_id AND hostname = @host');
      }

      // Add new
      const toAdd = newHostnames.filter(h => !currentHostnames.includes(h));
      for (const host of toAdd) {
        await transaction.request()
          .input('ticket_id', sql.NVarChar, id)
          .input('host', sql.NVarChar, host)
          .query("INSERT INTO TicketTargets (ticket_id, hostname, status) VALUES (@ticket_id, @host, 'Pending')");
      }

      // Sync TicketGroups
      await transaction.request()
        .input('ticket_id', sql.NVarChar, id)
        .query('DELETE FROM TicketGroups WHERE ticket_id = @ticket_id');

      if (selected_group_ids && Array.isArray(selected_group_ids)) {
        for (const gid of selected_group_ids) {
          await transaction.request()
            .input('ticket_id', sql.NVarChar, id)
            .input('group_id', sql.NVarChar, gid)
            .query('INSERT INTO TicketGroups (ticket_id, group_id) VALUES (@ticket_id, @group_id)');
        }
      }

      await transaction.commit();

      // Log the update
      await pool.request()
        .input('ticket_id', sql.NVarChar, id)
        .input('action', sql.NVarChar, 'Ticket targets updated')
        .input('performed_by', sql.NVarChar, performed_by || 'System')
        .input('now', sql.NVarChar, nowStr)
        .query(`INSERT INTO TicketLogs (ticket_id, action, performed_by, created_at) VALUES (@ticket_id, @action, @performed_by, @now)`);

      res.json({ message: 'Targets updated successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("PUT /api/tickets/:id/targets Error:", err);
    res.status(500).json({ error: err.message });
  }
});
// \u2500€\u2500€ Individual Ticket Target Update \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.put('/api/tickets/:id/targets/:targetId', async (req, res) => {
  try {
    const { id, targetId } = req.params;
    const { status, remark, performed_by, hostname: bodyHostname } = req.body;
    const pool = await poolPromise;
    const nowStr = getISOTimestamp();

    let targetRecord = null;
    let effectiveTargetId = parseInt(targetId);

    // 1. Resolve target (by ID or Hostname)
    if (effectiveTargetId > 0) {
      const targetRes = await pool.request()
        .input('tid', sql.Int, effectiveTargetId)
        .query('SELECT id, hostname FROM TicketTargets WHERE id = @tid');
      if (targetRes.recordset.length > 0) {
        targetRecord = targetRes.recordset[0];
      }
    }

    if (!targetRecord && bodyHostname) {
      const hostRes = await pool.request()
        .input('ticket_id', sql.NVarChar, id)
        .input('hostname', sql.NVarChar, bodyHostname)
        .query('SELECT id, hostname FROM TicketTargets WHERE ticket_id = @ticket_id AND hostname = @hostname');
      if (hostRes.recordset.length > 0) {
        targetRecord = hostRes.recordset[0];
        effectiveTargetId = targetRecord.id;
      }
    }

    const finalHostname = targetRecord ? targetRecord.hostname : bodyHostname;
    if (!finalHostname) {
      return res.status(400).json({ error: 'Hostname or valid Target ID required' });
    }

    const nowObj = new Date();
    // 2. Upsert (Update if exists, Insert if doesn't)
    if (targetRecord) {
      await pool.request()
        .input('tid', sql.Int, effectiveTargetId)
        .input('status', sql.NVarChar, status)
        .input('remark', sql.NVarChar, remark || null)
        .input('now', sql.DateTime, nowObj)
        .input('solved_by', sql.NVarChar, performed_by || 'System')
        .query(`UPDATE TicketTargets SET status = @status, remark = @remark, updated_at = @now, solved_by = @solved_by WHERE id = @tid`);
    } else {
      await pool.request()
        .input('ticket_id', sql.NVarChar, id)
        .input('hostname', sql.NVarChar, finalHostname)
        .input('status', sql.NVarChar, status)
        .input('remark', sql.NVarChar, remark || null)
        .input('now', sql.DateTime, nowObj)
        .input('solved_by', sql.NVarChar, performed_by || 'System')
        .query(`INSERT INTO TicketTargets (ticket_id, hostname, status, remark, updated_at, solved_by) VALUES (@ticket_id, @hostname, @status, @remark, @now, @solved_by)`);
    }

    // 3. Log the action
    await pool.request()
      .input('ticket_id', sql.NVarChar, id)
      .input('action', sql.NVarChar, `Target ${finalHostname} status updated to ${status}`)
      .input('performed_by', sql.NVarChar, performed_by || 'System')
      .input('now', sql.NVarChar, nowStr)
      .query(`INSERT INTO TicketLogs (ticket_id, action, performed_by, created_at) VALUES (@ticket_id, @action, @performed_by, @now)`);

    res.json({ message: 'Target status updated' });
  } catch (err) {
    console.error("PUT /api/tickets/:id/targets/:targetId Error:", err);
    res.status(500).json({ error: err.message });
  }
});


router.put('/api/tickets/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to, performed_by } = req.body;
    const pool = await poolPromise;
    const nowStr = getISOTimestamp();

    // 1. Verify permissions: Only ticket creator or Administrator can assign
    const ticketCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT created_by FROM TroubleTickets WHERE id = @id');

    if (ticketCheck.recordset.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const creator = ticketCheck.recordset[0].created_by;

    let isAllowed = false;
    if (performed_by && performed_by === creator) {
      isAllowed = true;
    } else if (performed_by) {
      const userCheck = await pool.request()
        .input('username', sql.NVarChar, performed_by)
        .query(`
          SELECT u.username, ISNULL(r.is_admin, 0) as is_admin 
          FROM Users u
          LEFT JOIN Roles r ON u.role_id = r.id
          WHERE u.username = @username
        `);

      if (userCheck.recordset.length > 0) {
        const isUserAdmin = userCheck.recordset[0].is_admin === true || userCheck.recordset[0].is_admin === 1 || userCheck.recordset[0].username === 'admin';
        if (isUserAdmin) {
          isAllowed = true;
        }
      }
    }

    if (!isAllowed) {
      return res.status(403).json({ error: 'Hanya pembuat ticket atau Administrator yang diperbolehkan mengubah assign to' });
    }

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('user', sql.NVarChar, assigned_to || null)
      .input('now', sql.NVarChar, nowStr)
      .query(`UPDATE TroubleTickets SET assigned_to = @user, updated_at = @now WHERE id = @id`);

    const logMsg = assigned_to ? `Ticket assigned to ${assigned_to}` : 'Ticket unassigned';
    await pool.request()
      .input('ticket_id', sql.NVarChar, id)
      .input('action', sql.NVarChar, logMsg)
      .input('performed_by', sql.NVarChar, performed_by || 'System')
      .input('now', sql.NVarChar, nowStr)
      .query(`INSERT INTO TicketLogs (ticket_id, action, performed_by, created_at) VALUES (@ticket_id, @action, @performed_by, @now)`);

    res.json({ message: 'Assignment updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/users', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT id, username, full_name, role_id FROM Users ORDER BY username ASC");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/tickets/:id/logs', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('ticket_id', sql.NVarChar, req.params.id)
      .query('SELECT * FROM TicketLogs WHERE ticket_id = @ticket_id ORDER BY created_at ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ STATIC FILES & SPA FALLBACK \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.use('/uploads', express.static(path.join(__dirname, 'uploads')));
router.use(express.static(path.join(__dirname, 'public')));
router.use(express.static(path.join(__dirname, 'dist')));
// Catch-all removed

// \u2500€\u2500€ START SERVER \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€


// \u2500€\u2500€ GET /api/crm/sync-status \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/crm/sync-status', async (req, res) => {
  let hoPool = null;
  try {
    hoPool = await getHoServerPool();

    const totals = await hoPool.request().query(`
      SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced,
        SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -7, GETDATE()))
    `);

    const configRes = await hoPool.request().query(
      'SELECT TOP 1 PROCESS_EXEC_DATE FROM dbo.LOYAL_CRM_PROCESS_CONFIG'
    );

    const daily = await hoPool.request().query(`
      SELECT
        CONVERT(date, last_timestamp) as sync_date,
        SUM(CASE WHEN is_sync = '1' THEN 1 ELSE 0 END) as synced_count,
        SUM(CASE WHEN ISNULL(is_sync, '0') <> '1' THEN 1 ELSE 0 END) as pending_count,
        COUNT(*) as total
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -7, GETDATE()))
      GROUP BY CONVERT(date, last_timestamp)
      ORDER BY sync_date DESC
    `);

    const recentErrors = await hoPool.request().query(`
      SELECT TOP 5 ITEM_CODE, ITEM_NAME, RESPONSE_MSG, LAST_TIMESTAMP
      FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
      WHERE RESPONSE_MSG NOT LIKE 'Success%' 
        AND ISNULL(RESPONSE_MSG, '') <> ''
        AND CONVERT(date, last_timestamp) >= CONVERT(date, DATEADD(day, -7, GETDATE()))
      ORDER BY CAST(LAST_TIMESTAMP AS DATETIME) DESC
    `);

    res.json({
      totals: totals.recordset[0],
      process_exec_date: configRes.recordset[0]?.PROCESS_EXEC_DATE || null,
      daily: daily.recordset,
      recent_errors: recentErrors.recordset
    });
  } catch (err) {
    console.error('Error fetching CRM sync status:', err);
    res.status(500).json({ error: 'Failed to fetch sync status', details: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
});

// \u2500€\u2500€ GET /api/crm/test-connection \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/crm/test-connection', async (req, res) => {
  let hoPool = null;
  try {
    hoPool = await getHoServerPool();
    const result = await hoPool.request().query('SELECT @@VERSION as version');
    res.json({ success: true, message: 'Connected to HOSERVER successfully.', version: result.recordset[0].version });
  } catch (err) {
    console.error('CRM Connection test failed:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
});

// \u2500€\u2500€ Helper: Get HOSERVER pool (where LOYAL_CRM_ITEM_MST lives) \u2500€\u2500€
async function getHoServerPool() {
  const pool = await poolPromise;

  // Dynamic lookup for HOSERVER
  const hoDevRes = await pool.request()
    .input('hostname', sql.NVarChar, 'HOSERVER')
    .query('SELECT id, ip FROM Devices WHERE hostname = @hostname');

  if (hoDevRes.recordset.length === 0) throw new Error('HOSERVER device not found in Devices table');

  const { id: hoDeviceId, ip: dbIp } = hoDevRes.recordset[0];
  // Per user request, ensure we use 192.168.85.18 if the record says otherwise or just confirm it
  const hoIp = (dbIp === '192.168.85.18' || dbIp.includes('85.18')) ? dbIp : '192.168.85.18';

  const hoConnRes = await pool.request()
    .input('did', sql.NVarChar, hoDeviceId)
    .query('SELECT * FROM DeviceDbConnections WHERE device_id = @did');

  if (hoConnRes.recordset.length === 0) throw new Error('HOSERVER DB connection not configured in DeviceDbConnections');

  const hoConn = hoConnRes.recordset[0];
  console.log(`[CRM] Connecting to HO Database at ${hoIp} (DB: ${hoConn.db_name}, User: ${hoConn.db_user})`);

  const hoPool = new sql.ConnectionPool({
    user: hoConn.db_user,
    password: hoConn.db_password,
    server: hoIp,
    database: hoConn.db_name,
    options: {
      encrypt: false,
      enableArithAbort: true,
      trustServerCertificate: true,
      connectTimeout: 15000
    },
    pool: { max: 1, min: 0, idleTimeoutMillis: 30000 }
  });

  try {
    await hoPool.connect();
    const checkDb = await hoPool.request().query('SELECT DB_NAME() as current_db');
    console.log(`[CRM] Connected. Current DB: ${checkDb.recordset[0].current_db}`);
    return hoPool;
  } catch (err) {
    console.error(`[CRM] Failed to connect to HO Server (${hoIp}):`, err.message);
    throw err;
  }
}

// \u2500€\u2500€ GET /api/crm/sync-logs \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/crm/sync-logs', async (req, res) => {
  let hoPool = null;
  try {
    hoPool = await getHoServerPool();

    // Ensure table exists (fail-safe)
    await hoPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_item_crm_job_log')
      BEGIN
          CREATE TABLE dbo.sync_item_crm_job_log (
              log_id INT IDENTITY(1,1) PRIMARY KEY,
              log_date DATETIME DEFAULT GETDATE(),
              issue_date DATETIME,
              item_code VARCHAR(50),
              item_name VARCHAR(150),
              item_stk_uom VARCHAR(10),
              item_vendor_cd VARCHAR(50),
              status VARCHAR(50),
              message VARCHAR(MAX)
          );
      END
    `);

    const result = await hoPool.request().query(`
      SELECT TOP 5 * FROM sync_item_crm_job_log ORDER BY log_date DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error fetching sync logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs', details: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
});

// \u2500€\u2500€ POST /api/crm/sync-retry \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/crm/sync-retry', async (req, res) => {
  let hoPool = null;
  try {
    const days = Math.max(1, Math.min(30, parseInt(req.body.days) || 2));
    hoPool = await getHoServerPool();

    // Ensure table exists
    await hoPool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_item_crm_job_log')
      BEGIN
          CREATE TABLE dbo.sync_item_crm_job_log (
              log_id INT IDENTITY(1,1) PRIMARY KEY,
              log_date DATETIME DEFAULT GETDATE(),
              issue_date DATETIME,
              item_code VARCHAR(50),
              item_name VARCHAR(150),
              item_stk_uom VARCHAR(10),
              item_vendor_cd VARCHAR(50),
              status VARCHAR(50),
              message VARCHAR(MAX)
          );
      END
    `);

    // Check failed count in the configured days range
    const checkFailed = await hoPool.request()
      .input('days', sql.Int, days)
      .query(`
        SELECT COUNT(*) as failedCount 
        FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
        WHERE IS_SYNC = '-1'
          AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE())
      `);

    const countFailed = checkFailed.recordset[0].failedCount;

    if (countFailed > 0) {
      // Find the oldest target date
      const targetDateRes = await hoPool.request()
        .input('days', sql.Int, days)
        .query(`
          SELECT TOP 1 CAST(CAST(LAST_TIMESTAMP AS DATETIME) AS DATE) as targetDate
          FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
          WHERE IS_SYNC = '-1'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE())
          ORDER BY CAST(LAST_TIMESTAMP AS DATETIME) ASC
        `);

      const targetDate = targetDateRes.recordset[0].targetDate;

      const transaction = new sql.Transaction(hoPool);
      await transaction.begin();

      try {
        const reqQuery = new sql.Request(transaction);
        reqQuery.input('targetDate', sql.Date, targetDate);
        reqQuery.input('days', sql.Int, days);

        await reqQuery.query(`
          INSERT INTO dbo.sync_item_crm_job_log (
              log_date, issue_date, item_code, item_name, item_stk_uom, item_vendor_cd, status, message
          )
          SELECT 
              GETDATE(), CAST(LAST_TIMESTAMP AS DATETIME), ITEM_CODE, ITEM_NAME, ITEM_STK_UOM, ITEM_VENDOR_CD, 'FAILED', RESPONSE_MSG
          FROM dbo.LOYAL_CRM_ITEM_MST WITH (NOLOCK)
          WHERE IS_SYNC = '-1'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE());
        `);

        await reqQuery.query(`
          UPDATE dbo.LOYAL_CRM_ITEM_MST 
          SET IS_SYNC='0', 
              RESPONSE_MSG='',
              RETRY_COUNT ='0',
              LAST_TIMESTAMP = FORMAT(GETDATE(), 'yyyy-MM-dd HH:mm:ss')
          WHERE IS_SYNC = '-1'
            AND RETRY_COUNT != '0'
            AND CAST(LAST_TIMESTAMP AS DATETIME) >= DATEADD(day, -@days, GETDATE());
        `);

        await transaction.commit();
        res.json({ success: true, message: `Successfully pushed ${countFailed} failed items for retry (${days}-day range).` });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } else {
      await hoPool.request().query(`
        INSERT INTO dbo.sync_item_crm_job_log (
            log_date, issue_date, status, message
        )
        VALUES (
            GETDATE(),
            CAST(CAST(DATEADD(day, -1, GETDATE()) AS DATE) AS DATETIME), 
            'SUCCESS',
            'No failed records found. Process date remains unchanged.'
        );
      `);

      res.json({ success: true, message: `No failed records found in the last ${days} day(s). Process date remains unchanged.` });
    }
  } catch (err) {
    console.error('Error during CRM sync retry:', err);
    res.status(500).json({ error: 'Failed to process sync retry', details: err.message });
  } finally {
    if (hoPool) try { await hoPool.close(); } catch (_) { }
  }
});

// \u2500€\u2500€ FRAUD ALERT NOTIFICATION \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
async function sendFraudAlertNotification(options = {}) {
  try {
    const crmPool = await getCrmPool();
    if (!crmPool) {
      console.error('[FRAUD_ALERT] Could not connect to CRM database.');
      return;
    }

    const { customTarget, customGroup } = options;

    // Look back 7 days for consecutive days with > 3 transactions
    const query = `
      WITH DailyCounts AS (
          SELECT 
              q.RLITQ_CARD_NO as card_no,
              MAX(m.RLICM_NAME) as cust_name,
              CAST(h.BILL_DT AS DATE) as trx_date,
              COUNT(q.RLITQ_BILL_NO) as daily_trx_count,
              MAX(q.RLITQ_ORG_CD) as org_cd,
              MAX(d.ORG_NAME) as store_name,
              MAX(h.COUNTER_NO) as counter_no,
              MAX(h.SESSION_NO) as session_no,
              MAX(h.SALESMAN_ID_SEC) as salesman_id
          FROM RXL_LOYALTY_INTEG_TRANS_QUEUE q (NOLOCK)
          JOIN POS_SALES_HDR h (NOLOCK) ON q.RLITQ_BILL_NO = h.BILL_NO AND q.RLITQ_ORG_CD = h.ORG_CD
          LEFT JOIN RXL_LOYALTY_INTEG_CARD_MST m (NOLOCK) ON q.RLITQ_CARD_NO = m.RLICM_CARD_NO
          LEFT JOIN DimStore d ON q.RLITQ_ORG_CD = d.ORG_CD
          WHERE CAST(h.BILL_DT AS DATE) >= CAST(DATEADD(day, -7, GETDATE()) AS DATE)
          GROUP BY q.RLITQ_CARD_NO, CAST(h.BILL_DT AS DATE)
          HAVING COUNT(q.RLITQ_BILL_NO) > 3
             AND COUNT(DISTINCT h.COUNTER_NO) = 1
             AND COUNT(DISTINCT h.SESSION_NO) = 1
      ),
      ConsecutiveLag AS (
          SELECT 
              card_no, 
              cust_name, 
              org_cd,
              store_name,
              trx_date as latest_date,
              LAG(trx_date) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_date,
              daily_trx_count as latest_count, 
              LAG(daily_trx_count) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_count,
              salesman_id as latest_salesman,
              LAG(salesman_id) OVER (PARTITION BY card_no ORDER BY trx_date) as prev_salesman
          FROM DailyCounts
      ),
      ConsecutiveCheck AS (
          SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY card_no ORDER BY latest_date DESC) as rn
          FROM ConsecutiveLag 
          WHERE DATEDIFF(day, prev_date, latest_date) = 1
            AND prev_salesman = latest_salesman
      )
      SELECT * FROM ConsecutiveCheck WHERE rn = 1
      ORDER BY latest_date DESC, latest_count DESC
    `;

    const result = await crmPool.request().query(query);
    const frauds = result.recordset;

    if (frauds.length === 0) {
      console.log('[FRAUD_ALERT] No fraud detected in the last 7 days.');
      return;
    }

    const pool = await poolPromise;
    const settingsRes = await pool.request().query("SELECT * FROM NotificationSettings WHERE id = 'global'");
    const settings = settingsRes.recordset[0];

    if (!settings || !settings.whatsapp_token) {
      console.warn('[FRAUD_ALERT] WhatsApp token not configured, cannot send alert.');
      return;
    }

    const targets = [customTarget || settings.whatsapp_target, customGroup || settings.whatsapp_group].filter(Boolean).join(',');
    if (!targets) {
      console.warn('[FRAUD_ALERT] No WhatsApp target configured.');
      return;
    }

    let message = "\uD83D\uDEA8 *CRM FRAUD ALERT DETECTED* \uD83D\uDEA8\n\n";
    message += "Terdeteksi " + frauds.length + " aktivitas mencurigakan dengan kriteria:\n";
    message += "\u2705 Transaksi >= 3x/hari selama 2 hari berturut-turut\n";
    message += "\u2705 Dilakukan di Counter & Sesi yang sama per harinya\n";
    message += "\u2705 Dilayani oleh Salesman yang sama di kedua hari tersebut\n\n";

    const maxItems = Math.min(frauds.length, 10);
    for (let i = 0; i < maxItems; i++) {
      const f = frauds[i];
      message += "\uD83D\uDC64 *" + (f.cust_name || 'Unknown Member') + "*\n";
      message += "ðŸ’³ No Kartu: " + f.card_no + "\n";
      message += "ðŸª Store: (" + f.org_cd + ") " + (f.store_name || 'N/A') + "\n";
      const prevD = new Date(f.prev_date).toLocaleDateString('id-ID');
      const lateD = new Date(f.latest_date).toLocaleDateString('id-ID');
      message += "\uD83D\uDCC5 Periode: " + prevD + " s/d " + lateD + "\n";
      message += "\uD83D\uDCCA Trx: " + f.prev_count + " trx & " + f.latest_count + " trx\n";
      message += "------------------------------\n";
    }

    if (frauds.length > 10) {
      message += "\n_...dan " + (frauds.length - 10) + " data lainnya._\n";
      message += "Cek Dashboard H2H CRM untuk rincian lebih lengkap.\n";
    }

    message += "\n_" + new Date().toLocaleString('id-ID') + "_";

    const payload = JSON.stringify({ token: settings.whatsapp_token, target: targets, message, countryCode: '62' });

    await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.fonnte.com',
        path: '/send',
        method: 'POST',
        headers: {
          'Authorization': settings.whatsapp_token,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      const req = https.request(options, (response) => {
        let body = '';
        response.on('data', chunk => body += chunk);
        response.on('end', () => {
          console.log("[FRAUD_ALERT] WhatsApp response:", body);
          resolve();
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    console.log("[FRAUD_ALERT] Sent notification to " + targets);

  } catch (err) {
    console.error('[FRAUD_ALERT] Failed to check and send fraud alert:', err);
  }
}

// \u2500€\u2500€ DBWH JOB MONITORING REPORT \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
async function sendJobMonitoringReport(options = {}) {
  try {
    const crmPool = await getCrmPool();
    if (!crmPool) return;
    const result = await crmPool.request().query(`
      SELECT distinct
        j.name AS JobName
       ,CASE h.run_status
          WHEN 0 THEN 'Failed'
          WHEN 1 THEN 'Succeeded'
          WHEN 2 THEN 'Retry'
          WHEN 3 THEN 'Canceled'
          WHEN 4 THEN 'In Progress'
        END AS StatusJob
      FROM msdb.dbo.sysjobs j
      INNER JOIN msdb.dbo.sysjobhistory h ON j.job_id = h.job_id
      WHERE h.run_date = CONVERT(VARCHAR(8), GETDATE(), 112)
    `);

    const jobs = result.recordset || [];
    const total = jobs.length;
    const failed = jobs.filter(j => j.StatusJob === 'Failed');

    let msg = `\uD83D\uDCCA *DBWH Job Monitoring Report*\n\n`;
    msg += `Total Jobs Run Today: *${total}*\n`;
    msg += `Success: *${total - failed.length}*\n`;
    msg += `Failed: *${failed.length}*\n\n`;

    if (failed.length > 0) {
      msg += `\uD83D\uDEA8 *Failed Jobs:*\n`;
      failed.forEach(j => {
        msg += `- ${j.JobName}\n`;
      });
    } else {
      msg += `\u2705 All jobs completed successfully.`;
    }

    await sendWhatsapp(msg, options);
  } catch (err) {
    console.error('[JOB_REPORT] Error:', err.message);
  }
}

// \u2500€\u2500€ DEVICE STATUS REPORT \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
async function sendDeviceStatusReport(options = {}) {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT hostname, status FROM Devices");
    const devices = res.recordset || [];
    const total = devices.length;
    const offline = devices.filter(d => d.status === 'offline');

    let msg = `ðŸ“¡ *Network & Device Status Report*\n\n`;
    msg += `Total Devices: *${total}*\n`;
    msg += `Online: *${total - offline.length}*\n`;
    msg += `Offline: *${offline.length}*\n\n`;

    if (offline.length > 0) {
      msg += `\uD83D\uDD34 *Offline Devices:*\n`;
      offline.forEach(d => {
        msg += `- ${d.hostname}\n`;
      });
    } else {
      msg += `\u2705 All devices are online.`;
    }

    await sendWhatsapp(msg, options);
  } catch (err) {
    console.error('[DEVICE_REPORT] Error:', err.message);
  }
}

// \u2500€\u2500€ HARDWARE HEALTH REPORT \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
async function sendHardwareHealthReport(options = {}) {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT hostname, disk_temp, bad_sectors, psu_status FROM Devices");
    const devices = res.recordset || [];
    
    const warnings = [];
    devices.forEach(d => {
      let issues = [];
      if (d.disk_temp > 55) issues.push(`Temp: ${d.disk_temp}Â°C`);
      if (d.bad_sectors > 0) issues.push(`Bad Sectors: ${d.bad_sectors}`);
      if (d.psu_status && d.psu_status.toLowerCase() !== 'healthy' && d.psu_status.toLowerCase() !== 'not supported') issues.push(`PSU: ${d.psu_status}`);
      if (issues.length > 0) {
        warnings.push(`- *${d.hostname}*: ${issues.join(', ')}`);
      }
    });

    let msg = `ðŸ› ï¸ *Hardware Health Report*\n\n`;
    msg += `Devices Monitored: *${devices.length}*\n`;
    msg += `Devices with Warnings: *${warnings.length}*\n\n`;

    if (warnings.length > 0) {
      msg += `\u26A0\uFE0F *Attention Required:*\n`;
      msg += warnings.join('\n');
    } else {
      msg += `\u2705 All hardware is operating normally.`;
    }

    await sendWhatsapp(msg, options);
  } catch (err) {
    console.error('[HARDWARE_REPORT] Error:', err.message);
  }
}
// \u2500€\u2500€ DYNAMIC NOTIFICATION SCHEDULER (Every Minute) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
cron.schedule('* * * * *', async () => {
  const now = new Date();
  const currentHHMM = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayName = daysMap[now.getDay()];

  try {
    const pool = await poolPromise;
    if (!pool) return;

    // Find enabled schedules matching current time AND (Day matches OR is Daily)
    const result = await pool.request()
      .input('nowTime', sql.NVarChar, currentHHMM)
      .input('nowDay', sql.NVarChar, currentDayName)
      .query(`
        SELECT * FROM NotificationSchedules 
        WHERE is_enabled = 1 
        AND schedule_time = @nowTime
        AND (schedule_day = 'Daily' OR schedule_day = @nowDay)
      `);

    const activeSchedules = result.recordset;
    if (activeSchedules.length === 0) return;

    console.log(`[SCHEDULER] Found ${activeSchedules.length} active schedules for ${currentHHMM}`);

    for (const sch of activeSchedules) {
      try {
        if (sch.notif_type === 'daily_report') {
          await sendDailyOutstandingTicketsNotification({
            customTarget: sch.whatsapp_target,
            customGroup: sch.whatsapp_group
          });
        } else if (sch.notif_type === 'weekly_report') {
          await generateWeeklyReportPDF({
            customTarget: sch.whatsapp_target,
            customGroup: sch.whatsapp_group
          });
        } else if (sch.notif_type === 'fraud_alert') {
          await sendFraudAlertNotification({
            customTarget: sch.whatsapp_target,
            customGroup: sch.whatsapp_group
          });
        } else if (sch.notif_type === 'job_monitoring_report') {
          await sendJobMonitoringReport({
            customTarget: sch.whatsapp_target,
            customGroup: sch.whatsapp_group
          });
        } else if (sch.notif_type === 'device_status_report') {
          await sendDeviceStatusReport({
            customTarget: sch.whatsapp_target,
            customGroup: sch.whatsapp_group
          });
        } else if (sch.notif_type === 'hardware_health_report') {
          await sendHardwareHealthReport({
            customTarget: sch.whatsapp_target,
            customGroup: sch.whatsapp_group
          });
        }
      } catch (err) {
        console.error(`[SCHEDULER] Error running schedule ${sch.name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[SCHEDULER] Error checking schedules:', err.message);
  }
});

// \u2500€\u2500€ BACKGROUND LOOPS (Offline Detector & Cleanup) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
export async function startBackgroundTasks() {
  console.log('ðŸ” Starting background monitoring loops...');

  async function detectorLoop() {
    try {
      await runOfflineDetector();
    } catch (err) {
      console.error('Offline Detector Loop Error:', err);
    }
    setTimeout(detectorLoop, 60 * 1000);
  }

  async function logCleanupLoop() {
    try {
      const pool = await initDb();
      if (!pool) {
        console.warn('Log Cleanup skipped: Pool not ready');
        setTimeout(logCleanupLoop, 5000);
        return;
      }
      const result = await pool.request()
        .query(`
          DELETE FROM ActivityLog 
          WHERE id NOT IN (
            SELECT TOP 1000 id FROM ActivityLog ORDER BY id DESC
          )
        `);

      if (result.rowsAffected[0] > 0) {
        console.log(`ðŸ§¹ [Cleanup] Deleted ${result.rowsAffected[0]} old ActivityLog entries (kept latest 1000)`);
      }
    } catch (err) {
      console.error('Log Cleanup Loop Error:', err);
    }
    setTimeout(logCleanupLoop, 24 * 60 * 60 * 1000);
  }

  detectorLoop();
  logCleanupLoop();

  // Start ESL pricing sync loop â€” runs every 10 minutes
  async function eslSyncLoop() {
    try {
      const { syncPrices } = await import('../scripts/sync_esl_engine.cjs');
      await syncPrices();
    } catch (err) {
      console.error('ESL Price Sync Loop Error:', err);
    }
    setTimeout(eslSyncLoop, 10 * 60 * 1000);
  }
  eslSyncLoop();

  // \u2500€\u2500€ ABC Analysis Check & Sync Loop (Every 5 minutes, active 07:00 AM onwards) \u2500€\u2500€
  cron.schedule('*/5 * * * *', async () => {
    try {
      const currentHour = new Date().getHours();
      if (currentHour < 7) {
        // Don't sync yet, wait until at least 07:00 AM local time
        return;
      }

      const pool = await poolPromise;
      if (!pool) return;

      // Target date is yesterday (1 day ago)
      const targetDateObj = new Date(new Date().setDate(new Date().getDate() - 1));
      const targetDate = targetDateObj.toISOString().slice(0, 10);

      // Check if we already have records for yesterday
      const checkRes = await pool.request()
        .input('txnDate', sql.Date, targetDate)
        .query("SELECT COUNT(*) as count FROM ItemPerformanceABC WHERE TRANSACTION_DATE = @txnDate");

      const count = checkRes.recordset[0]?.count || 0;
      if (count === 0) {
        console.log(`[CRON] ABC Analysis data for yesterday (${targetDate}) is empty. Running sync...`);
        const success = await runAbcSync(targetDate);
        if (success) {
          console.log(`[CRON] ABC Analysis sync for ${targetDate} succeeded.`);
        } else {
          console.log(`[CRON] ABC Analysis sync for ${targetDate} returned no data or failed. Will retry in 5 minutes.`);
        }
      }
    } catch (err) {
      console.error('[CRON] Error in ABC Analysis check loop:', err.message);
    }
  });
  console.log('\uD83D\uDCCA ABC Analysis sync check scheduled every 5 minutes (active starting 07:00 AM)');

  // \u2500€\u2500€ Item Sales Member Check & Sync Loop (Every 5 minutes, active 07:00 AM onwards) \u2500€\u2500€
  cron.schedule('*/5 * * * *', async () => {
    try {
      const currentHour = new Date().getHours();
      if (currentHour < 7) {
        return; // Don't sync yet, wait until 07:00 AM
      }

      const pool = await poolPromise;
      if (!pool) return;

      const targetDateObj = new Date(new Date().setDate(new Date().getDate() - 1));
      const targetDate = targetDateObj.toISOString().slice(0, 10);

      // Check if we already have records for yesterday
      const checkRes = await pool.request()
        .input('txnDate', sql.Date, targetDate)
        .query("SELECT COUNT(1) as count FROM ITEM_SALES_MEMBER WHERE CAST(bill_dt AS DATE) = @txnDate");

      const count = checkRes.recordset[0]?.count || 0;
      if (count === 0) {
        console.log(`[CRON] ITEM_SALES_MEMBER data for yesterday (${targetDate}) is empty. Running sync...`);
        await runItemSalesSync(targetDate, targetDate);
        console.log(`[CRON] ITEM_SALES_MEMBER sync for ${targetDate} completed.`);
      }
    } catch (err) {
      console.error('[CRON] Error in ITEM_SALES_MEMBER check loop:', err.message);
    }
  });
  console.log('\uD83D\uDCCA ITEM_SALES_MEMBER sync check scheduled every 5 minutes (active starting 07:00 AM)');
}

// \u2500€\u2500€ Manual trigger for ABC Analysis Sync \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/reports/trigger-abc-sync', async (req, res) => {
  const { date } = req.body;
  runAbcSync(date || undefined);
  res.json({ message: 'ABC Analysis sync triggered manually in the background.' });
});

// \u2500€\u2500€ Manual trigger for Item Sales Member Sync \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.post('/api/reports/trigger-item-sales-sync', async (req, res) => {
  const { date } = req.body; // optional: { date: '2026-07-15' }
  const targetDate = date || new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().slice(0, 10);
  runItemSalesSync(targetDate, targetDate);
  res.json({ message: `Item Sales Member sync for ${targetDate} triggered manually in the background.` });
});

// \u2500€\u2500€ USER TASKS (ACTIVITY LOGGING) \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/tasks/stores', async (req, res) => {
  try {
    const crmPool = await getCrmPool();
    const result = await crmPool.request().query(`
      SELECT DISTINCT ORG_CD AS store_code, ORG_NAME AS store_name
      FROM DimStore
      WHERE ORG_STATUS = 'O'
      ORDER BY ORG_CD ASC
    `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/tasks', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const isAdmin = req.headers['x-user-admin'] === 'true';

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await poolPromise;
    let query = `SELECT * FROM UserTasks`;
    const request = pool.request();

    if (!isAdmin) {
      query += ` WHERE user_id = @uid`;
      request.input('uid', sql.NVarChar, userId);
    }

    query += ` ORDER BY created_at DESC`;
    const result = await request.query(query);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/tasks', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const username = req.headers['x-user-name'];
  const { title, description, start_date, target_date, status, duration, reason, solving_notes, actual_completion_date, priority } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('uid', sql.NVarChar, userId)
      .input('uname', sql.NVarChar, username)
      .input('title', sql.NVarChar, title)
      .input('desc', sql.NVarChar, description)
      .input('start', sql.DateTime, start_date || new Date())
      .input('target', sql.DateTime, target_date || null)
      .input('actual', sql.DateTime, actual_completion_date || null)
      .input('status', sql.NVarChar, status || 'Pending')
      .input('duration', sql.NVarChar, duration)
      .input('priority', sql.NVarChar, priority || 'Normal')
      .input('reason', sql.NVarChar, reason)
      .input('notes', sql.NVarChar, solving_notes)
      .input('category', sql.NVarChar, req.body.category || 'General')
      .input('storeCode', sql.NVarChar, req.body.store_code || null)
      .input('storeName', sql.NVarChar, req.body.store_name || null)
      .input('now', sql.DateTime, new Date())
      .query(`
        INSERT INTO UserTasks (user_id, username, store_code, store_name, title, description, start_date, target_date, actual_completion_date, status, duration, priority, reason, solving_notes, created_at, updated_at, category)
        VALUES (@uid, @uname, @storeCode, @storeName, @title, @desc, @start, @target, @actual, @status, @duration, @priority, @reason, @notes, @now, @now, @category)
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/tasks/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { id } = req.params;
  const { title, description, start_date, target_date, status, duration, reason, solving_notes, actual_completion_date, priority } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await poolPromise;
    // Check ownership
    const check = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT user_id FROM UserTasks WHERE id = @id');

    if (check.recordset.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (check.recordset[0].user_id !== userId) return res.status(403).json({ error: 'Forbidden: You do not own this task' });

    await pool.request()
      .input('id', sql.Int, id)
      .input('title', sql.NVarChar, title)
      .input('desc', sql.NVarChar, description)
      .input('start', sql.DateTime, start_date || null)
      .input('target', sql.DateTime, target_date || null)
      .input('actual', sql.DateTime, actual_completion_date || null)
      .input('status', sql.NVarChar, status)
      .input('duration', sql.NVarChar, duration)
      .input('priority', sql.NVarChar, priority || 'Normal')
      .input('reason', sql.NVarChar, reason)
      .input('notes', sql.NVarChar, solving_notes)
      .input('category', sql.NVarChar, req.body.category || 'General')
      .input('storeCode', sql.NVarChar, req.body.store_code || null)
      .input('storeName', sql.NVarChar, req.body.store_name || null)
      .input('now', sql.DateTime, new Date())
      .query(`
        UPDATE UserTasks 
        SET title = @title, description = @desc, start_date = ISNULL(@start, start_date), target_date = @target, 
            actual_completion_date = @actual, status = @status, 
            duration = @duration, priority = @priority, reason = @reason, solving_notes = @notes,
            store_code = @storeCode,
            store_name = @storeName,
            category = @category,
            updated_at = @now
        WHERE id = @id
      `);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/tasks/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const isAdmin = req.headers['x-user-admin'] === 'true';
  const { id } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await poolPromise;
    const check = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT user_id FROM UserTasks WHERE id = @id');

    if (check.recordset.length === 0) return res.status(404).json({ error: 'Task not found' });

    if (!isAdmin && check.recordset[0].user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.request().input('id', sql.Int, id).query('DELETE FROM UserTasks WHERE id = @id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/tasks/export', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const isAdmin = req.headers['x-user-admin'] === 'true';
  const { startDate, endDate, status, userFilter, priority, store } = req.query;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await poolPromise;
    let query = `SELECT * FROM UserTasks WHERE 1=1`;
    const request = pool.request();

    if (!isAdmin) {
      query += ` AND user_id = @uid`;
      request.input('uid', sql.NVarChar, userId);
    } else if (userFilter && userFilter !== 'All') {
      query += ` AND username = @uname`;
      request.input('uname', sql.NVarChar, userFilter);
    }

    if (status && status !== 'All') {
      query += ` AND status = @status`;
      request.input('status', sql.NVarChar, status);
    }

    if (priority && priority !== 'All') {
      query += ` AND priority = @priority`;
      request.input('priority', sql.NVarChar, priority);
    }

    if (store && store !== 'All') {
      query += ` AND (store_name = @store OR store_code = @store)`;
      request.input('store', sql.NVarChar, store);
    }

    if (startDate) {
      query += ` AND created_at >= @start`;
      request.input('start', sql.DateTime, startDate);
    }

    if (endDate) {
      query += ` AND created_at <= @end`;
      request.input('end', sql.DateTime, endDate);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await request.query(query);
    const tasks = result.recordset;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('User Tasks');

    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Owner', key: 'username', width: 20 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Store', key: 'store_name', width: 25 },
      { header: 'Priority', key: 'priority', width: 15 },
      { header: 'Target Date', key: 'target_date', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Duration', key: 'duration', width: 15 },
      { header: 'Reason', key: 'reason', width: 30 },
      { header: 'Solving Notes', key: 'solving_notes', width: 50 },
      { header: 'Created At', key: 'created_at', width: 20 }
    ];

    tasks.forEach(task => {
      worksheet.addRow({
        ...task,
        target_date: task.target_date ? new Date(task.target_date).toLocaleString() : '',
        created_at: new Date(task.created_at).toLocaleString()
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=tasks_report.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ ABC ANALYSIS PERIOD REPORT \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
// GET /api/abc-analysis/available-dates
// Returns list of dates that have synced data
router.get('/api/abc-analysis/available-dates', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        TRANSACTION_DATE AS sync_date,
        COUNT(DISTINCT ORG_CD) AS org_count,
        COUNT(*) AS item_count
      FROM ItemPerformanceABC
      GROUP BY TRANSACTION_DATE
      ORDER BY sync_date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/abc-analysis/report?start_date=2026-05-01&end_date=2026-05-31&org_cd=ALL
// Aggregates data from ItemPerformanceABC for the given date range, recalculates ABC categories
router.get('/api/abc-analysis/report', async (req, res) => {
  try {
    let { start_date, end_date, org_name, page = '1', limit = '100', search = '', sortBy = 'SALES_VALUE', sortDir = 'desc' } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required (format: YYYY-MM-DD)' });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const pool = await poolPromise;
    const crmPool = await getCrmPool();

    // Resolve org_name to org_cd
    let org_cd = null;
    if (org_name && org_name !== 'All Store') {
      const storeResult = await crmPool.request()
        .input('org_name', sql.NVarChar, org_name)
        .query(`
          SELECT DISTINCT ORG_CD
          FROM DimStore
          WHERE ORG_NAME = @org_name
        `);

      if (storeResult.recordset.length > 0) {
        org_cd = storeResult.recordset[0].ORG_CD;
      }
    }

    // Build org filter
    const orgFilter = (org_cd && org_cd !== 'ALL')
      ? `AND ORG_CD = @org_cd`
      : '';

    const request = pool.request()
      .input('start_date', sql.Date, start_date)
      .input('end_date', sql.Date, end_date);

    if (org_cd && org_cd !== 'ALL') {
      request.input('org_cd', sql.NVarChar, org_cd);
    }

    // Build dynamic select and group by based on ALL vs specific store
    const selectOrg = (org_cd === 'ALL' || !org_cd) ? "'ALL' AS ORG_CD" : "ORG_CD";
    const groupByClause = (org_cd === 'ALL' || !org_cd) ? "ITM_CD" : "ORG_CD, ITM_CD";

    // Re-aggregate daily snapshots and recalculate ABC categories for the period
    const query = `
      WITH AGGREGATED AS (
        SELECT
          ${selectOrg},
          ITM_CD,
          MAX(ITEM_NAME) AS ITEM_NAME,
          MAX(UOM)       AS UOM,
          SUM(SALES_VALUE)       AS SALES_VALUE,
          SUM(QTY_SOLD)          AS QTY_SOLD,
          SUM(FREQUENCY)         AS FREQUENCY,
          SUM(COST_VALUE * QTY_SOLD)        AS COST_VALUE,
          SUM(MARGIN_VALUE)      AS MARGIN_VALUE,
          COUNT(DISTINCT TRANSACTION_DATE) AS ACTIVE_DAYS,
          MIN(TRANSACTION_DATE) AS FIRST_DATE,
          MAX(TRANSACTION_DATE) AS LAST_DATE
        FROM ItemPerformanceABC
        WHERE TRANSACTION_DATE >= @start_date
          AND TRANSACTION_DATE <= @end_date
          ${orgFilter}
        GROUP BY ${groupByClause}
      ),
      DERIVED AS (
        SELECT *,
          CASE WHEN SALES_VALUE = 0 THEN 0
               ELSE ROUND((MARGIN_VALUE / SALES_VALUE) * 100, 2)
          END AS GP_PERCENT,
          CASE WHEN QTY_SOLD = 0 THEN 0
               ELSE ROUND(SALES_VALUE / QTY_SOLD, 2)
          END AS AVG_SELL_PRICE,
          CASE WHEN FREQUENCY = 0 THEN 0
               ELSE ROUND(SALES_VALUE / FREQUENCY, 2)
          END AS AVG_BASKET_VALUE,
          SALES_VALUE * 100.0 / SUM(SALES_VALUE) OVER (PARTITION BY ORG_CD) AS CONTRIBUTION_PCT,
          DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY SALES_VALUE DESC) AS RANK_SALES,
          DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY MARGIN_VALUE DESC) AS RANK_MARGIN,
          DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY QTY_SOLD DESC) AS RANK_QTY,
          DENSE_RANK() OVER (PARTITION BY ORG_CD ORDER BY FREQUENCY DESC) AS RANK_FREQUENCY,
          PERCENT_RANK() OVER (PARTITION BY ORG_CD ORDER BY SALES_VALUE ASC) AS SALES_SCORE,
          PERCENT_RANK() OVER (PARTITION BY ORG_CD ORDER BY MARGIN_VALUE ASC) AS MARGIN_SCORE,
          PERCENT_RANK() OVER (PARTITION BY ORG_CD ORDER BY FREQUENCY ASC) AS FREQUENCY_SCORE
        FROM AGGREGATED
      ),
      CUMULATIVE AS (
        SELECT *,
          SUM(CONTRIBUTION_PCT) OVER (
            PARTITION BY ORG_CD
            ORDER BY SALES_VALUE DESC
            ROWS UNBOUNDED PRECEDING
          ) AS CUMULATIVE_PCT,
          PERCENT_RANK() OVER (PARTITION BY ORG_CD ORDER BY GP_PERCENT ASC) AS GP_SCORE
        FROM DERIVED
      ),
      RANKING AS (
        SELECT *,
          ROUND((SALES_SCORE * 40) + (MARGIN_SCORE * 30) + (FREQUENCY_SCORE * 20) + (GP_SCORE * 10), 2) AS HEALTH_SCORE
        FROM CUMULATIVE
      )
      SELECT
        ORG_CD,
        ITM_CD,
        ITEM_NAME,
        UOM,
        SALES_VALUE,
        QTY_SOLD,
        FREQUENCY,
        COST_VALUE,
        MARGIN_VALUE,
        GP_PERCENT,
        AVG_SELL_PRICE,
        AVG_BASKET_VALUE,
        CONTRIBUTION_PCT,
        CUMULATIVE_PCT,
        CASE
          WHEN CUMULATIVE_PCT <= 80 THEN 'A'
          WHEN CUMULATIVE_PCT <= 95 THEN 'B'
          ELSE 'C'
        END AS ABC_CATEGORY,
        RANK_SALES,
        RANK_MARGIN,
        RANK_QTY,
        RANK_FREQUENCY,
        ACTIVE_DAYS,
        FIRST_DATE,
        LAST_DATE,
        HEALTH_SCORE,
        CASE
          WHEN HEALTH_SCORE >= 80 THEN 'STRATEGIC'
          WHEN HEALTH_SCORE >= 60 THEN 'GROWTH'
          WHEN HEALTH_SCORE >= 40 THEN 'MAINTAIN'
          ELSE 'REVIEW'
        END AS HEALTH_CATEGORY
      FROM RANKING
      ORDER BY ORG_CD, HEALTH_SCORE DESC;
    `;

    const result = await request.query(query);

    // Compute Summary from all records
    const summary = { total_sales: 0, total_items: 0, categories: { A: 0, B: 0, C: 0 } };
    for (const row of result.recordset) {
      summary.categories[row.ABC_CATEGORY]++;
      summary.total_sales += parseFloat(row.SALES_VALUE || 0);
      summary.total_items++;
    }

    // Apply Search
    let filteredData = result.recordset;
    if (search) {
      const lowerSearch = search.toLowerCase();
      filteredData = filteredData.filter(r =>
        (r.ITEM_NAME && r.ITEM_NAME.toLowerCase().includes(lowerSearch)) ||
        (r.ITM_CD && r.ITM_CD.toLowerCase().includes(lowerSearch))
      );
    }

    // Apply Sort
    if (sortBy) {
      filteredData.sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Apply Pagination
    const totalRecords = filteredData.length;
    const totalPages = Math.ceil(totalRecords / limitNum);
    const offset = (pageNum - 1) * limitNum;
    const paginatedData = filteredData.slice(offset, offset + limitNum);

    res.json({
      period: { start_date, end_date },
      totalRecords,
      totalPages,
      summary,
      rows: paginatedData
    });

  } catch (err) {
    // test-heartbeat.cjs
    const sql = require('mssql');

    const config = {
      server: '192.168.x.x', // Database server
      database: 'CentaurDeploy',
      authentication: {
        type: 'default',
        options: { userName: 'sa', password: 'your_pass' }
      },
      options: { encrypt: false, trustServerCertificate: true }
    };

    async function test() {
      try {
        const pool = new sql.ConnectionPool(config);
        await pool.connect();

        const result = await pool.request()
          .input('h', sql.NVarChar, 'VMSQLDWH')
          .query('SELECT * FROM Devices WHERE hostname = @h');

        console.log('Current record:', result.recordset[0]);
        await pool.close();
      } catch (err) {
        console.error('ERROR:', err.message);
      }
    }

    test(); console.error('[ABC-REPORT]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/abc-analysis/orgs  â€” list distinct ORG_CD with org_name from DimStore
router.get('/api/abc-analysis/orgs', async (req, res) => {
  try {
    const pool = await poolPromise;
    const crmPool = await getCrmPool();

    // Get distinct ORG_CD from ItemPerformanceABC
    const abcResult = await pool.request().query(`
      SELECT DISTINCT ORG_CD
      FROM ItemPerformanceABC
      ORDER BY ORG_CD
    `);

    console.log('[ABC-ORGS] Found', abcResult.recordset.length, 'distinct ORG_CD in ItemPerformanceABC');

    // Get org names from DimStore
    const storeResult = await crmPool.request().query(`
      SELECT DISTINCT ORG_CD AS org_cd, ORG_NAME AS org_name 
      FROM DimStore 
      WHERE 1 = 1
      ORDER BY ORG_CD ASC
    `);

    console.log('[ABC-ORGS] Found', storeResult.recordset.length, 'stores in DimStore');

    // Create a map for quick lookup
    const storeMap = {};
    storeResult.recordset.forEach(s => {
      storeMap[s.org_cd] = s.org_name;
    });

    // Combine ABC org codes with store names
    const combined = abcResult.recordset.map(r => ({
      org_cd: r.ORG_CD,
      org_name: storeMap[r.ORG_CD] || r.ORG_CD // fallback to code if name not found
    }));

    console.log('[ABC-ORGS] Returning', combined.length, 'combined store records:', combined);

    res.json(combined);
  } catch (err) {
    console.error('[ABC-ORGS] Error:', err.message, err);
    res.status(500).json({ error: err.message });
  }
});

// \u2500€\u2500€ INSTALLERS ROUTES \u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€\u2500€
router.get('/api/installers', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Installers ORDER BY uploaded_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/installers', installerUpload.single('file'), async (req, res) => {
  const uid = req.headers['x-user-id'];
  const { name, version, description } = req.body;
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const pool = await poolPromise;
    
    // Check if user is admin
    const userRes = await pool.request().input('uid', sql.NVarChar, uid).query("SELECT r.is_admin, u.username FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid");
    const user = userRes.recordset[0];
    if (!user || !user.is_admin) {
      // Clean up uploaded file if unauthorized
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(403).json({ error: "Only administrators can upload installation files" });
    }

    const id = `inst-${Date.now()}`;
    const file_name = req.file.originalname;
    const file_path = req.file.path.replace(/\\/g, '/'); // Normalize path
    const file_size = (req.file.size / (1024 * 1024)).toFixed(2) + ' MB';
    const file_type = path.extname(file_name).toLowerCase().replace('.', '');

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('version', sql.NVarChar, version || null)
      .input('file_name', sql.NVarChar, file_name)
      .input('file_path', sql.NVarChar, file_path)
      .input('file_size', sql.NVarChar, file_size)
      .input('file_type', sql.NVarChar, file_type)
      .input('description', sql.NVarChar, description || null)
      .input('uploaded_by', sql.NVarChar, user.username)
      .query(`
        INSERT INTO Installers (id, name, version, file_name, file_path, file_size, file_type, description, uploaded_by)
        VALUES (@id, @name, @version, @file_name, @file_path, @file_size, @file_type, @description, @uploaded_by)
      `);

    // Log activity
    await pool.request()
      .input('time', sql.NVarChar, new Date().toLocaleString())
      .input('user', sql.NVarChar, user.username)
      .input('action', sql.NVarChar, `Uploaded installation file: ${name} (Version: ${version || 'N/A'}, File: ${file_name})`)
      .query('INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @user, @action)');

    res.json({ success: true, message: 'Installation file uploaded successfully' });
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/installers/:id', async (req, res) => {
  const uid = req.headers['x-user-id'];
  const { id } = req.params;
  const { name, version, description } = req.body;

  try {
    const pool = await poolPromise;
    const userRes = await pool.request().input('uid', sql.NVarChar, uid).query("SELECT r.is_admin, u.username FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid");
    const user = userRes.recordset[0];
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: "Only administrators can update installation files" });
    }

    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('version', sql.NVarChar, version || null)
      .input('description', sql.NVarChar, description || null)
      .query(`
        UPDATE Installers 
        SET name = @name, version = @version, description = @description
        WHERE id = @id
      `);

    res.json({ success: true, message: 'Installer metadata updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/installers/:id', async (req, res) => {
  const uid = req.headers['x-user-id'];
  const { id } = req.params;

  try {
    const pool = await poolPromise;
    const userRes = await pool.request().input('uid', sql.NVarChar, uid).query("SELECT r.is_admin, u.username FROM Users u JOIN Roles r ON u.role_id = r.id WHERE u.id = @uid");
    const user = userRes.recordset[0];
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: "Only administrators can delete installation files" });
    }

    // Get file path before deleting record
    const fileRes = await pool.request().input('id', sql.NVarChar, id).query("SELECT file_path, name FROM Installers WHERE id = @id");
    if (fileRes.recordset.length === 0) {
      return res.status(404).json({ error: "Installer not found" });
    }

    const { file_path, name } = fileRes.recordset[0];

    // Delete record from DB
    await pool.request().input('id', sql.NVarChar, id).query("DELETE FROM Installers WHERE id = @id");

    // Try deleting physical file
    try {
      if (fs.existsSync(file_path)) {
        fs.unlinkSync(file_path);
      }
    } catch (fileErr) {
      console.error(`[INSTALLERS] Failed to delete file: ${file_path}`, fileErr);
    }

    // Log activity
    await pool.request()
      .input('time', sql.NVarChar, new Date().toLocaleString())
      .input('user', sql.NVarChar, user.username)
      .input('action', sql.NVarChar, `Deleted installation file: ${name}`)
      .query('INSERT INTO ActivityLog (time, [user], action) VALUES (@time, @user, @action)');

    res.json({ success: true, message: 'Installer deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/installers/:id/download', async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await poolPromise;
    const fileRes = await pool.request().input('id', sql.NVarChar, id).query("SELECT file_path, file_name FROM Installers WHERE id = @id");
    if (fileRes.recordset.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }

    const { file_path, file_name } = fileRes.recordset[0];
    if (fs.existsSync(file_path)) {
      res.download(file_path, file_name);
    } else {
      res.status(404).send('Physical file not found on server.');
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
