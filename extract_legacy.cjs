const fs = require('fs');

const content = fs.readFileSync('server.cjs', 'utf-8');

// Find the start of the unmigrated routes (GET /api/deployments is at line 1593)
const startMarker = "app.get('/api/deployments', async (req, res) => {";
let startIndex = content.indexOf(startMarker);
// Let's include the marker itself
let remainingCode = content.substring(startIndex);

// Replace app. with router.
// But ONLY for app.get, app.post, app.put, app.delete
remainingCode = remainingCode.replace(/app\.get\(/g, 'router.get(');
remainingCode = remainingCode.replace(/app\.post\(/g, 'router.post(');
remainingCode = remainingCode.replace(/app\.put\(/g, 'router.put(');
remainingCode = remainingCode.replace(/app\.delete\(/g, 'router.delete(');

const legacyFile = `
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
import pdfParse from 'pdf-parse';
import cron from 'node-cron';
import ExcelJS from 'exceljs';

import { poolPromise, dbConfig } from '../config/db.js';
import { h2hConfig, getH2hToken } from '../config/h2h.js';
import { getCurrentTimestamp, getCurrentTimeHHMM } from '../utils/timeUtils.js';

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
  filename: (req, file, cb) => cb(null, \`\${Date.now()}-\${file.originalname}\`)
});
const workflowUpload = multer({ storage: workflowStorage });

// CRM Pool recreated
let crmPoolPromise = null;

async function getCrmPool() {
  if (crmPoolPromise) return crmPoolPromise;
  try {
    const pool = await poolPromise;
    const deviceRes = await pool.request()
      .input('name', sql.NVarChar, 'DBWH SERVER')
      .input('ip', sql.NVarChar, '192.168.85.55')
      .query(\`
        SELECT TOP 1 d.*, c.db_user, c.db_password, c.db_name 
        FROM Devices d
        LEFT JOIN DeviceDbConnections c ON d.id = c.device_id
        WHERE d.hostname = @name OR d.ip = @ip
      \`);

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
    console.error('❌ Failed to initialize CRM Pool:', err.message);
    crmPoolPromise = null;
    throw err;
  }
}

// Ensure __dirname is available for file uploads
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_PATH = path.resolve('F:\\\\PepiUpdater\\\\Repo');
const packageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REPO_PATH),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const packageUpload = multer({ storage: packageStorage });

const router = express.Router();

${remainingCode}

export default router;
`;

fs.writeFileSync('routes/legacyRoutes.js', legacyFile);
console.log('legacyRoutes.js generated successfully!');
