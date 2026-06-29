import express from 'express';
import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDigiNetUpdateScript } from '../utils/diginetUpdateScript.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_PATH = path.resolve('F:\\PepiUpdater\\Repo');
const DIGINET_ROOT = process.env.DIGINET_ROOT || 'F:\\PepiUpdater\\DIGINET';

// Ensure scales directory inside Repo exists
const SCALES_DIR = path.join(REPO_PATH, 'scales');
if (!fs.existsSync(SCALES_DIR)) {
  fs.mkdirSync(SCALES_DIR, { recursive: true });
}

const router = express.Router();

// Helper to escape CSV/text cells if needed
function escapeCell(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(';') || str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function resolveScaleTargetIp(scale) {
  return scale?.ip || scale?.gateway_ip || '';
}

function getScaleIpCandidates(scale) {
  return [...new Set([scale?.ip, scale?.gateway_ip].filter(Boolean))];
}

function listDigiNetPackages(rootPath = DIGINET_ROOT) {
  if (!rootPath || !fs.existsSync(rootPath)) return [];

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  return entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const fullPath = path.join(rootPath, entry.name);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(entry.name).toLowerCase();
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'folder' : 'file',
        ext,
        size: stat.size,
        path: fullPath
      };
    })
    .filter((item) => item.type === 'folder' || ['.exe', '.msi', '.zip', '.rar', '.cab', '.dll', '.bat', '.cmd'].includes(item.ext));
}

// ── DIGI F25 PROTOCOL HELPERS ───────────────────────────────────────────────
// Digi Teraoka scales communicate via a proprietary binary F25 protocol on TCP port 4001
const DIGI_CONST = {
  STX: 0x02,   // Start of Text
  ETX: 0x03,   // End of Text
  ACK: 0x06,   // Acknowledge
  NAK: 0x15,   // Negative Acknowledge
  ENQ: 0x05,   // Enquiry
  EOT: 0x04,   // End of Transmission
  DEFAULT_PORT: 4001,
  TIMEOUT: 5000
};

/**
 * Build a Digi F25 PLU record buffer.
 * Format: STX + RecordType('P') + PLU data fields + ETX + BCC
 * Simplified F25 PLU record: STX P pluNo,name,unitPrice,tare,shelfLife ETX BCC
 */
function buildDigiF25PluRecord(pluNumber, name, unitPrice, tare, shelfLife) {
  // Digi SM-series PLU format fields (simplified):
  // Field 1: PLU Number (6 digits, zero-padded)
  // Field 2: Item Name (up to 24 chars)
  // Field 3: Unit Price (8 digits, no decimal point, in cents)
  // Field 4: Tare weight (5 digits, in grams)
  // Field 5: Shelf life (3 digits, in days)
  const pluStr = String(pluNumber).padStart(6, '0');
  const nameStr = String(name).substring(0, 24).padEnd(24, ' ');
  const priceStr = String(Math.round(unitPrice)).padStart(8, '0');
  const tareStr = String(Math.round((tare || 0) * 1000)).padStart(5, '0');
  const shelfStr = String(shelfLife || 3).padStart(3, '0');

  const dataStr = `P${pluStr}${nameStr}${priceStr}${tareStr}${shelfStr}`;
  const dataBytes = Buffer.from(dataStr, 'ascii');

  // Calculate BCC (Block Check Character) = XOR of all bytes between STX and ETX (exclusive)
  let bcc = 0;
  for (let i = 0; i < dataBytes.length; i++) {
    bcc ^= dataBytes[i];
  }
  bcc ^= DIGI_CONST.ETX;

  return Buffer.concat([
    Buffer.from([DIGI_CONST.STX]),
    dataBytes,
    Buffer.from([DIGI_CONST.ETX]),
    Buffer.from([bcc])
  ]);
}

/**
 * Send PLU items to a Digi scale via F25 TCP protocol.
 * Returns a promise that resolves with { success, sentCount, errors }.
 */
async function sendDigiF25Plu(scaleIp, port, pluItems) {
  const net = await import('net');

  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(DIGI_CONST.TIMEOUT);
    let sentCount = 0;
    const errors = [];
    let currentIndex = 0;
    let resolved = false;

    const finish = (success) => {
      if (resolved) return;
      resolved = true;
      if (!client.destroyed) client.destroy();
      resolve({ success, sentCount, errors, total: pluItems.length });
    };

    client.on('error', (err) => {
      errors.push(`Connection error: ${err.message}`);
      finish(false);
    });

    client.on('timeout', () => {
      errors.push('Connection timeout');
      finish(sentCount > 0);
    });

    const sendNextPlu = () => {
      if (currentIndex >= pluItems.length) {
        // All done - send EOT to signal end
        client.write(Buffer.from([DIGI_CONST.EOT]));
        setTimeout(() => finish(true), 300);
        return;
      }

      const item = pluItems[currentIndex];
      try {
        const record = buildDigiF25PluRecord(
          item.plu_number, item.name, item.price, item.tare, item.shelf_life
        );
        client.write(record);
        currentIndex++;
      } catch (err) {
        errors.push(`PLU ${item.plu_number}: ${err.message}`);
        currentIndex++;
        sendNextPlu(); // Skip and continue
      }
    };

    client.connect(port || DIGI_CONST.DEFAULT_PORT, scaleIp, () => {
      // Send ENQ to initiate handshake
      client.write(Buffer.from([DIGI_CONST.ENQ]));
    });

    client.on('data', (data) => {
      for (const byte of data) {
        if (byte === DIGI_CONST.ACK) {
          // Scale acknowledged - send next PLU or start sending
          if (currentIndex > 0) sentCount++;
          sendNextPlu();
        } else if (byte === DIGI_CONST.NAK) {
          // Scale rejected the last record
          errors.push(`PLU at index ${currentIndex - 1}: NAK received (rejected by scale)`);
          sendNextPlu(); // Try next anyway
        }
      }
    });
  });
}

/**
 * Send a simple Digi status inquiry via F25 protocol.
 * Returns the raw response bytes.
 */
async function sendDigiStatusInquiry(scaleIp, port) {
  const net = await import('net');

  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(DIGI_CONST.TIMEOUT);
    let responseBytes = [];

    client.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    client.on('timeout', () => {
      client.destroy();
      resolve({ success: responseBytes.length > 0, response: Buffer.from(responseBytes) });
    });

    client.connect(port || DIGI_CONST.DEFAULT_PORT, scaleIp, () => {
      client.write(Buffer.from([DIGI_CONST.ENQ]));
    });

    client.on('data', (data) => {
      responseBytes.push(...data);
      // After receiving ACK, we have confirmation - close after short delay
      setTimeout(() => {
        client.destroy();
        resolve({
          success: true,
          response: Buffer.from(responseBytes),
          hex: Buffer.from(responseBytes).toString('hex'),
          hasAck: responseBytes.some(b => b === DIGI_CONST.ACK)
        });
      }, 500);
    });
  });
}

// ── CRUD: SCALES ─────────────────────────────────────────────────────────────

// GET /api/scales
router.get('/', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT s.*, d.hostname as gateway_hostname, d.ip as gateway_ip, d.status as gateway_status
      FROM Scales s
      LEFT JOIN Devices d ON s.device_id = d.id
      ORDER BY s.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales
router.post('/', async (req, res) => {
  const { name, ip, port, model, location, department, device_id } = req.body;
  if (!name || !ip || !model || !device_id) {
    return res.status(400).json({ error: 'Missing required scale fields (name, ip, model, device_id)' });
  }

  try {
    const pool = await poolPromise;
    const id = `scale-${uuidv4().substring(0, 8)}`;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('ip', sql.NVarChar, ip)
      .input('port', sql.Int, port || 3001)
      .input('model', sql.NVarChar, model)
      .input('location', sql.NVarChar, location || '')
      .input('department', sql.NVarChar, department || '')
      .input('device_id', sql.NVarChar, device_id)
      .query(`
        INSERT INTO Scales (id, name, ip, port, model, status, location, department, device_id, created_at, updated_at)
        VALUES (@id, @name, @ip, @port, @model, 'offline', @location, @department, @device_id, GETDATE(), GETDATE())
      `);

    res.status(201).json({ success: true, message: 'Scale registered successfully', scale_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/scales/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, ip, port, model, location, department, device_id, status } = req.body;

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('ip', sql.NVarChar, ip)
      .input('port', sql.Int, port)
      .input('model', sql.NVarChar, model)
      .input('location', sql.NVarChar, location || '')
      .input('department', sql.NVarChar, department || '')
      .input('device_id', sql.NVarChar, device_id)
      .input('status', sql.NVarChar, status || 'offline')
      .query(`
        UPDATE Scales 
        SET name = @name, ip = @ip, port = @port, model = @model, location = @location, 
            department = @department, device_id = @device_id, status = @status, updated_at = GETDATE()
        WHERE id = @id
      `);

    res.json({ success: true, message: 'Scale updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/scales/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        DELETE FROM ScaleJobs WHERE scale_id = @id;
        DELETE FROM Scales WHERE id = @id;
      `);
    res.json({ success: true, message: 'Scale deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── CRUD: TEMPLATES ──────────────────────────────────────────────────────────

// GET /api/scales/templates
router.get('/templates', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM ScalePluTemplates ORDER BY created_at DESC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales/templates
router.post('/templates', async (req, res) => {
  const { name, description, file_format, delimiter, header_structure, row_template } = req.body;
  if (!name || !row_template) {
    return res.status(400).json({ error: 'Missing template fields (name, row_template)' });
  }

  try {
    const pool = await poolPromise;
    const id = `tpl-${uuidv4().substring(0, 8)}`;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('file_format', sql.NVarChar, file_format || 'CSV')
      .input('delimiter', sql.NVarChar, delimiter || ',')
      .input('header', sql.NVarChar, header_structure || '')
      .input('template', sql.NVarChar, row_template)
      .query(`
        INSERT INTO ScalePluTemplates (id, name, description, file_format, delimiter, header_structure, row_template, created_at)
        VALUES (@id, @name, @description, @file_format, @delimiter, @header, @template, GETDATE())
      `);

    res.status(201).json({ success: true, template_id: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/scales/templates/:id
router.put('/templates/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, file_format, delimiter, header_structure, row_template } = req.body;

  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('file_format', sql.NVarChar, file_format || 'CSV')
      .input('delimiter', sql.NVarChar, delimiter || ',')
      .input('header', sql.NVarChar, header_structure || '')
      .input('template', sql.NVarChar, row_template)
      .query(`
        UPDATE ScalePluTemplates 
        SET name = @name, description = @description, file_format = @file_format, 
            delimiter = @delimiter, header_structure = @header, row_template = @template
        WHERE id = @id
      `);

    res.json({ success: true, message: 'Template updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/scales/templates/:id
router.delete('/templates/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        DELETE FROM ScalePluItems WHERE template_id = @id;
        DELETE FROM ScalePluTemplates WHERE id = @id;
      `);
    res.json({ success: true, message: 'Template and associated PLUs deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── CRUD: PLU ITEMS ──────────────────────────────────────────────────────────

// GET /api/scales/templates/:templateId/items
router.get('/templates/:templateId/items', async (req, res) => {
  const { templateId } = req.params;
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('template_id', sql.NVarChar, templateId)
      .query('SELECT * FROM ScalePluItems WHERE template_id = @template_id ORDER BY plu_number ASC');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales/templates/:templateId/items
router.post('/templates/:templateId/items', async (req, res) => {
  const { templateId } = req.params;
  const { plu_number, name, price, unit, shelf_life, tare, barcode_prefix, ingredients } = req.body;

  if (!plu_number || !name || price === undefined) {
    return res.status(400).json({ error: 'Missing PLU fields (plu_number, name, price)' });
  }

  try {
    const pool = await poolPromise;
    const id = `plu-${uuidv4().substring(0, 8)}`;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('template_id', sql.NVarChar, templateId)
      .input('plu', sql.Int, plu_number)
      .input('name', sql.NVarChar, name)
      .input('price', sql.Decimal(10, 2), price)
      .input('unit', sql.NVarChar, unit || 'kg')
      .input('shelf', sql.Int, shelf_life || 3)
      .input('tare', sql.Decimal(5, 3), tare || 0)
      .input('prefix', sql.NVarChar, barcode_prefix || '22')
      .input('ingredients', sql.NVarChar, ingredients || '')
      .query(`
        MERGE INTO ScalePluItems AS target
        USING (SELECT @template_id AS template_id, @plu AS plu_number) AS source
        ON target.template_id = source.template_id AND target.plu_number = source.plu_number
        WHEN MATCHED THEN 
          UPDATE SET name = @name, price = @price, unit = @unit, shelf_life = @shelf, 
                     tare = @tare, barcode_prefix = @prefix, ingredients = @ingredients, updated_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (id, template_id, plu_number, name, price, unit, shelf_life, tare, barcode_prefix, ingredients, created_at, updated_at)
          VALUES (@id, @template_id, @plu, @name, @price, @unit, @shelf, @tare, @prefix, @ingredients, GETDATE(), GETDATE());
      `);

    res.status(201).json({ success: true, message: 'PLU saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/scales/items/:id
router.delete('/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query('DELETE FROM ScalePluItems WHERE id = @id');
    res.json({ success: true, message: 'PLU deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales/templates/:templateId/import (CSV Import)
router.post('/templates/:templateId/import', async (req, res) => {
  const { templateId } = req.params;
  const { csv_data } = req.body; // Expecting raw csv text or parsed rows array
  if (!csv_data || !Array.isArray(csv_data)) {
    return res.status(400).json({ error: 'Missing csv_data or is not an array of rows' });
  }

  try {
    const pool = await poolPromise;
    let importCount = 0;

    for (const row of csv_data) {
      const { plu_number, name, price, unit, shelf_life, tare, barcode_prefix, ingredients } = row;
      if (!plu_number || !name || price === undefined) continue;

      const id = `plu-${uuidv4().substring(0, 8)}`;
      await pool.request()
        .input('id', sql.NVarChar, id)
        .input('template_id', sql.NVarChar, templateId)
        .input('plu', sql.Int, parseInt(plu_number))
        .input('name', sql.NVarChar, name)
        .input('price', sql.Decimal(10, 2), parseFloat(price))
        .input('unit', sql.NVarChar, unit || 'kg')
        .input('shelf', sql.Int, parseInt(shelf_life || 3))
        .input('tare', sql.Decimal(5, 3), parseFloat(tare || 0))
        .input('prefix', sql.NVarChar, barcode_prefix || '22')
        .input('ingredients', sql.NVarChar, ingredients || '')
        .query(`
          MERGE INTO ScalePluItems AS target
          USING (SELECT @template_id AS template_id, @plu AS plu_number) AS source
          ON target.template_id = source.template_id AND target.plu_number = source.plu_number
          WHEN MATCHED THEN 
            UPDATE SET name = @name, price = @price, unit = @unit, shelf_life = @shelf, 
                       tare = @tare, barcode_prefix = @prefix, ingredients = @ingredients, updated_at = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (id, template_id, plu_number, name, price, unit, shelf_life, tare, barcode_prefix, ingredients, created_at, updated_at)
            VALUES (@id, @template_id, @plu, @name, @price, @unit, @shelf, @tare, @prefix, @ingredients, GETDATE(), GETDATE());
        `);
      importCount++;
    }

    res.json({ success: true, message: `Successfully imported ${importCount} PLU items.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── REAL-TIME: SCALE COMMANDS (MT-SICS for Mettler, F25 for Digi) ────────────

// POST /api/scales/:id/command
router.post('/:id/command', async (req, res) => {
  const { id } = req.params;
  const { command } = req.body; // e.g. 'Z', 'T', 'S', 'SI' (Mettler) or 'STATUS', 'PING' (Digi)
  if (!command) return res.status(400).json({ error: 'Command is required' });

  try {
    const pool = await poolPromise;
    
    // Fetch scale and its gateway PC device
    const scaleRes = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT s.*, d.hostname, d.ip as gateway_ip FROM Scales s INNER JOIN Devices d ON s.device_id = d.id WHERE s.id = @id');
    
    const scale = scaleRes.recordset[0];
    if (!scale) return res.status(404).json({ error: 'Scale or gateway device not found' });
    const targetIps = getScaleIpCandidates(scale);
    if (!targetIps.length) return res.status(400).json({ error: 'No reachable IP found for this scale' });

    const execId = `scale-cmd-${uuidv4().substring(0, 8)}`;
    const isDigi = scale.model && scale.model.toLowerCase().includes('digi');

    // ── DIGI SCALE: F25 Protocol on port 4001 ──
    if (isDigi) {
      const digiPort = DIGI_CONST.DEFAULT_PORT;
      const digiErrors = [];
      const sendWithFallback = async () => {
        for (const candidateIp of targetIps) {
          const result = await sendDigiStatusInquiry(candidateIp, digiPort);
          if (result.success) {
            return { ...result, targetIp: candidateIp };
          }
          digiErrors.push(`${candidateIp}: ${result.error || 'No response'}`);
        }

        return { success: false, error: digiErrors.join(' | ') };
      };

      if (command === 'STATUS' || command === 'S' || command === 'SI') {
        // Send status inquiry via F25
        const result = await sendWithFallback();
        if (result.success) {
          // Update scale status to online
          await pool.request()
            .input('id', sql.NVarChar, id)
            .query("UPDATE Scales SET status = 'online', last_seen = GETDATE() WHERE id = @id");

          return res.json({
            success: true,
            exec_id: execId,
            message: `Digi Scale ACK OK (Port ${digiPort}) — Response: ${result.hex || 'ACK'}`
          });
        } else {
          return res.status(500).json({ error: `Digi connection failed: ${result.error || 'No response'}` });
        }
      }

      // For other commands (Z, T, etc.) — Digi doesn't support MT-SICS so we just ping
      const result = await sendWithFallback();
      return res.json({
        success: result.success,
        exec_id: execId,
        message: result.success
          ? `Digi F25 handshake OK (${result.hex}). Note: Digi scales do not support MT-SICS commands like '${command}'.`
          : `Digi connection failed: ${result.error || 'No response'}`
      });
    }

    // ── METTLER TOLEDO: MT-SICS Protocol on port 3001 ──
    const net = await import('net');
    
    const runMettlerCommand = (candidateIp) => new Promise((resolve) => {
      const client = new net.Socket();
      client.setTimeout(3000);
      let responseData = '';
      let completed = false;

      const finish = (payload) => {
        if (completed) return;
        completed = true;
        if (!client.destroyed) client.destroy();
        resolve(payload);
      };

      client.on('error', (err) => {
        finish({ success: false, error: `Connection failed: ${err.message}`, targetIp: candidateIp });
      });

      client.on('timeout', () => {
        finish({ success: false, error: 'Connection timeout to scale', targetIp: candidateIp });
      });

      client.connect(scale.port || 3001, candidateIp, () => {
        client.write(command + '\r\n');

        setTimeout(() => {
          if (!client.destroyed) {
            finish({
              success: true,
              targetIp: candidateIp,
              message: responseData.trim() || 'Command sent (No immediate response)'
            });
          }
        }, 500);
      });

      client.on('data', (data) => {
        responseData += data.toString();
        finish({ success: true, targetIp: candidateIp, message: responseData.trim() });
      });
    });

    let lastError = '';
    for (const candidateIp of targetIps) {
      const result = await runMettlerCommand(candidateIp);
      if (result.success) {
        return res.json({
          success: true,
          exec_id: execId,
          message: `${result.message} (via ${result.targetIp})`
        });
      }
      lastError = result.error || 'No response';
    }

    return res.status(500).json({ error: `Connection failed on all targets: ${lastError}` });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── SCALE JOBS & SYNC (FTP PLU Sync) ─────────────────────────────────────────

// GET /api/scales/download/:filename (Served for Agent download)
router.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(SCALES_DIR, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Sync file not found' });
  }
});

// GET /api/scales/diginet/packages
router.get('/diginet/packages', (req, res) => {
  try {
    res.json(listDigiNetPackages());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales/:id/update-diginet
router.post('/:id/update-diginet', async (req, res) => {
  const { id } = req.params;
  const { package_name, package_path } = req.body;

  if (!package_name) {
    return res.status(400).json({ error: 'package_name is required' });
  }

  try {
    const pool = await poolPromise;
    const scaleRes = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT s.*, d.hostname, d.ip as gateway_ip FROM Scales s INNER JOIN Devices d ON s.device_id = d.id WHERE s.id = @id');
    const scale = scaleRes.recordset[0];
    if (!scale) return res.status(404).json({ error: 'Scale or gateway device not found' });

    const targetIp = resolveScaleTargetIp(scale);
    const execId = `scale-update-${uuidv4().substring(0, 8)}`;
    const cmdId = `cmd-${Date.now()}-scale-update`;
    const serverHost = req.headers.host || '192.168.85.30:3001';
    const serverUrl = `http://${serverHost}`;
    const packageDownloadUrl = `${serverUrl}/api/scales/diginet/download/${encodeURIComponent(package_name)}`;
    const updateScript = buildDigiNetUpdateScript({
      packageName: package_name,
      packageUrl: packageDownloadUrl,
      tempRoot: '$env:TEMP'
    });

    await pool.request()
      .input('id', sql.NVarChar, cmdId)
      .input('exec_id', sql.NVarChar, execId)
      .input('device_id', sql.NVarChar, scale.device_id)
      .input('hostname', sql.NVarChar, scale.hostname)
      .input('ip', sql.NVarChar, targetIp || scale.gateway_ip)
      .input('command', sql.NVarChar, updateScript)
      .query(`
        INSERT INTO PendingCommands (id, exec_id, device_id, hostname, ip, command, status, created_at)
        VALUES (@id, @exec_id, @device_id, @hostname, @ip, @command, 'pending', GETDATE())
      `);

    res.json({ success: true, exec_id: execId, message: `DigiNET update dispatched to ${scale.name}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales/bulk-sync
router.post('/bulk-sync', async (req, res) => {
  const { scale_ids, template_id, created_by } = req.body;

  if (!scale_ids || !Array.isArray(scale_ids) || scale_ids.length === 0) {
    return res.status(400).json({ error: 'scale_ids array is required' });
  }
  if (!template_id) {
    return res.status(400).json({ error: 'template_id is required' });
  }

  try {
    const pool = await poolPromise;
    const serverHost = req.headers.host || '192.168.85.30:3001';
    const serverUrl = `http://${serverHost}`;

    // Validate Template
    const templateRes = await pool.request()
      .input('tpl_id', sql.NVarChar, template_id)
      .query('SELECT * FROM ScalePluTemplates WHERE id = @tpl_id');
    const template = templateRes.recordset[0];
    if (!template) return res.status(404).json({ error: 'PLU Template not found' });

    // Fetch Items
    const itemsRes = await pool.request()
      .input('tpl_id', sql.NVarChar, template_id)
      .query('SELECT * FROM ScalePluItems WHERE template_id = @tpl_id ORDER BY plu_number ASC');
    const items = itemsRes.recordset;

    let queuedCount = 0;

    // Group scales by their gateway device_id to process them sequentially per store
    const scalesByDevice = {};

    for (const id of scale_ids) {
      try {
        const scaleRes = await pool.request()
          .input('id', sql.NVarChar, id)
          .query('SELECT s.*, d.hostname, d.ip as gateway_ip FROM Scales s INNER JOIN Devices d ON s.device_id = d.id WHERE s.id = @id');
        const scale = scaleRes.recordset[0];
        if (!scale) continue;
        const targetIp = resolveScaleTargetIp(scale);
        if (!targetIp) continue;

        if (!scalesByDevice[scale.device_id]) {
          scalesByDevice[scale.device_id] = {
            device_id: scale.device_id,
            hostname: scale.hostname,
            scales: []
          };
        }
        
        // Generate the file contents based on row_template
        let fileContent = '';
        if (template.header_structure) {
          fileContent += template.header_structure + '\r\n';
        }

        for (const item of items) {
          let row = template.row_template;
          row = row.replace(/{plu_number}/g, item.plu_number);
          row = row.replace(/{name}/g, escapeCell(item.name));
          row = row.replace(/{price}/g, item.price.toFixed(2));
          row = row.replace(/{unit}/g, item.unit);
          row = row.replace(/{shelf_life}/g, item.shelf_life);
          row = row.replace(/{tare}/g, item.tare.toFixed(3));
          row = row.replace(/{barcode_prefix}/g, item.barcode_prefix);
          row = row.replace(/{ingredients}/g, escapeCell(item.ingredients || ''));
          fileContent += row + '\r\n';
        }
        const isDigi = scale.model && scale.model.toLowerCase().includes('digi');
        const isDigiF25 = isDigi && scale.port === 4001 && !scale.model.toLowerCase().includes('pc');
        const ext = isDigi ? 'csv' : (template.file_format?.toLowerCase() || 'csv');
        const fileName = `plu_sync_${scale.id}.${ext}`;
        const filePath = path.join(SCALES_DIR, fileName);
        fs.writeFileSync(filePath, fileContent, 'utf-8');

        // Create Scale Job record
        const jobId = `job-${uuidv4().substring(0, 8)}`;
        await pool.request()
          .input('id', sql.NVarChar, jobId)
          .input('scale_id', sql.NVarChar, scale.id)
          .input('payload', sql.NVarChar, fileName)
          .input('by', sql.NVarChar, created_by || 'admin')
          .query(`
            INSERT INTO ScaleJobs (id, scale_id, job_type, status, progress, log, payload_path, created_by, created_at)
            VALUES (@id, @scale_id, 'sync_plu', 'pending', 10, 'Sync file generated (Bulk)', @payload, @by, GETDATE())
          `);

        scalesByDevice[scale.device_id].scales.push({
          scaleId: scale.id,
          scaleIp: targetIp,
          scalePort: scale.port,
          fileName,
          jobId,
          isDigi,
          isDigiF25
        });

        queuedCount++;
      } catch (err) {
        console.error(`Error queuing sync for scale ${id}:`, err);
      }
    }

    // ── Process Digi scales directly from Node.js backend (F25 TCP) ──
    // ── Process Mettler or Digi PC scales via Agent PowerShell ──
    const digiScales = [];
    const agentByDevice = {};

    for (const devId in scalesByDevice) {
      const group = scalesByDevice[devId];
      for (const s of group.scales) {
        if (s.isDigi) {
          digiScales.push({ ...s, device_id: devId, hostname: group.hostname });
        } else {
          if (!mettlerByDevice[devId]) {
            mettlerByDevice[devId] = { ...group, scales: [] };
          }
          mettlerByDevice[devId].scales.push(s);
        }
      }
    }

    // ── DIGI: Direct F25 sync from backend (sequential, with delay) ──
    // Run this in background so the API response is fast
    if (digiScales.length > 0) {
      (async () => {
        for (let i = 0; i < digiScales.length; i++) {
          const s = digiScales[i];
          try {
            // Update job status: running
            await pool.request()
              .input('id', sql.NVarChar, s.jobId)
              .query("UPDATE ScaleJobs SET status = 'running', progress = 30, log = 'Connecting via F25 TCP...' WHERE id = @id");

            // Send PLU items directly to Digi scale via F25 protocol
            const result = await sendDigiF25Plu(s.scaleIp, DIGI_CONST.DEFAULT_PORT, items);

            if (result.success) {
              await pool.request()
                .input('id', sql.NVarChar, s.jobId)
                .input('log', sql.NVarChar, `PLU data sent via F25. ${result.sentCount}/${result.total} items acknowledged.${result.errors.length > 0 ? ' Errors: ' + result.errors.join('; ') : ''}`)
                .query("UPDATE ScaleJobs SET status = 'success', progress = 100, log = @log, completed_at = GETDATE() WHERE id = @id");

              // Update scale status
              await pool.request()
                .input('id', sql.NVarChar, s.scaleId)
                .query("UPDATE Scales SET status = 'online', last_seen = GETDATE() WHERE id = @id");
            } else {
              await pool.request()
                .input('id', sql.NVarChar, s.jobId)
                .input('log', sql.NVarChar, `F25 sync failed: ${result.errors.join('; ')}`)
                .query("UPDATE ScaleJobs SET status = 'failed', progress = 0, log = @log, completed_at = GETDATE() WHERE id = @id");
            }
          } catch (err) {
            await pool.request()
              .input('id', sql.NVarChar, s.jobId)
              .input('log', sql.NVarChar, `Unexpected error: ${err.message}`)
              .query("UPDATE ScaleJobs SET status = 'failed', progress = 0, log = @log, completed_at = GETDATE() WHERE id = @id");
          }

          // Delay between scales to prevent network congestion
          if (i < digiScales.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        console.log(`[Bulk Sync] Digi F25 direct sync completed for ${digiScales.length} scales.`);
      })().catch(err => console.error('[Bulk Sync] Digi background error:', err));
    }

    // ── AGENT: Agent-based FTP or PC Drop (sequential PowerShell script per agent) ──
    for (const devId in agentByDevice) {
      const group = agentByDevice[devId];
      if (group.scales.length === 0) continue;

      const execId = `scale-bulk-${uuidv4().substring(0, 8)}`;
      const cmdId = `cmd-${Date.now()}-scale-bulk-${devId}`;

      let ftpScript = `$wc = New-Object System.Net.WebClient;\n\n`;

      group.scales.forEach((s) => {
        const ftpUser = 'admin';
        const ftpPass = 'admin';
        const downloadUrl = `${serverUrl}/api/scales/download/${s.fileName}`;

        // Determine sync method per scale
        let scaleSyncCommand = '';
        if (s.isDigi && !s.isDigiF25) {
          // PC-based Digi: copy PLU file to DigiNet import folder
          const importDir = 'C:\\Digimap';
          scaleSyncCommand = `
            $localTempFile = "$env:TEMP\\${s.fileName}";
            $wc.DownloadFile('${downloadUrl}', $localTempFile);
            if (-Not (Test-Path -Path '${importDir}')) { New-Item -ItemType Directory -Path '${importDir}' -Force | Out-Null }
            Copy-Item -Path $localTempFile -Destination "${importDir}\\${s.fileName}" -Force;
            Remove-Item $localTempFile -Force -ErrorAction SilentlyContinue;
            Write-Output 'STATUS:SUCCESS|LOG:File copied to DigiNet import folder';
          `.trim();
        } else {
          // Existing FTP path for Mettler or other scales
          scaleSyncCommand = `
            $localTempFile = "$env:TEMP\\${s.fileName}";
            $wc.DownloadFile('${downloadUrl}', $localTempFile);
            $ftpRequest = [System.Net.FtpWebRequest]::Create('ftp://${s.scaleIp}/import/${s.fileName}');
            $ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile;
            $ftpRequest.Credentials = New-Object System.Net.NetworkCredential('${ftpUser}', '${ftpPass}');
            $fileBytes = [System.IO.File]::ReadAllBytes($localTempFile);
            $ftpRequest.ContentLength = $fileBytes.Length;
            $ftpStream = $ftpRequest.GetRequestStream();
            $ftpStream.Write($fileBytes, 0, $fileBytes.Length);
            $ftpStream.Close();
            $ftpStream.Dispose();
            Remove-Item $localTempFile -Force -ErrorAction SilentlyContinue;
            Write-Output 'STATUS:SUCCESS|LOG:File uploaded via FTP';
          `.trim();
        }

        ftpScript += `
# --- Syncing Scale: ${s.scaleIp} ---
try {
    Invoke-RestMethod -Uri "${serverUrl}/api/scales/jobs/${s.jobId}/status" -Method Post -Body (@{status='running'; progress=30; log='Downloading PLU file...'} | ConvertTo-Json) -ContentType "application/json" | Out-Null;

    ${scaleSyncCommand}

    Invoke-RestMethod -Uri "${serverUrl}/api/scales/jobs/${s.jobId}/status" -Method Post -Body (@{status='success'; progress=100; log='PLU data synchronized successfully.'} | ConvertTo-Json) -ContentType "application/json" | Out-Null;
    Write-Output "SUCCESS: Uploaded to ${s.scaleIp}";
} catch {
    Remove-Item "$env:TEMP\\${s.fileName}" -Force -ErrorAction SilentlyContinue;
    $errorMsg = $_.Exception.Message;
    Invoke-RestMethod -Uri "${serverUrl}/api/scales/jobs/${s.jobId}/status" -Method Post -Body (@{status='failed'; progress=0; log="Sync failed: $errorMsg"} | ConvertTo-Json) -ContentType "application/json" | Out-Null;
    Write-Output "FAILED: Sync to ${s.scaleIp} failed: $errorMsg";
}

Start-Sleep -Seconds 2

`;
      });

      await pool.request()
        .input('id', sql.NVarChar, cmdId)
        .input('exec_id', sql.NVarChar, execId)
        .input('device_id', sql.NVarChar, devId)
        .input('hostname', sql.NVarChar, group.hostname)
        .input('ip', sql.NVarChar, group.scales[0]?.scaleIp || '0.0.0.0')
        .input('command', sql.NVarChar, ftpScript)
        .query(`
          INSERT INTO PendingCommands (id, exec_id, device_id, hostname, ip, command, status, created_at)
          VALUES (@id, @exec_id, @device_id, @hostname, @ip, @command, 'pending', GETDATE())
        `);
    }

    const digiMsg = digiScales.length > 0 ? ` (${digiScales.length} Digi via direct F25 TCP)` : '';
    const mettlerCount = Object.values(mettlerByDevice).reduce((sum, g) => sum + g.scales.length, 0);
    const mettlerMsg = mettlerCount > 0 ? ` (${mettlerCount} Mettler via Agent FTP)` : '';

    res.json({ success: true, message: `Bulk sync queued for ${queuedCount} scales${digiMsg}${mettlerMsg}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales/:id/sync
router.post('/:id/sync', async (req, res) => {
  const { id } = req.params;
  const { template_id, created_by } = req.body;

  if (!template_id) return res.status(400).json({ error: 'template_id is required' });

  try {
    const pool = await poolPromise;

    // 1. Fetch Scale & Template & PLU Items
    const scaleRes = await pool.request()
      .input('id', sql.NVarChar, id)
      .query('SELECT s.*, d.hostname, d.ip as gateway_ip FROM Scales s INNER JOIN Devices d ON s.device_id = d.id WHERE s.id = @id');
    const scale = scaleRes.recordset[0];
    if (!scale) return res.status(404).json({ error: 'Scale or gateway device not found' });
    const targetIp = resolveScaleTargetIp(scale);
    if (!targetIp) return res.status(400).json({ error: 'Gateway IP device not found for this scale' });

    const templateRes = await pool.request()
      .input('tpl_id', sql.NVarChar, template_id)
      .query('SELECT * FROM ScalePluTemplates WHERE id = @tpl_id');
    const template = templateRes.recordset[0];
    if (!template) return res.status(404).json({ error: 'PLU Template not found' });

    const itemsRes = await pool.request()
      .input('tpl_id', sql.NVarChar, template_id)
      .query('SELECT * FROM ScalePluItems WHERE template_id = @tpl_id ORDER BY plu_number ASC');
    const items = itemsRes.recordset;

    // 2. Generate the file contents based on row_template
    let fileContent = '';
    
    // Add header if defined
    if (template.header_structure) {
      fileContent += template.header_structure + '\r\n';
    }

    for (const item of items) {
      let row = template.row_template;
      // Replace placeholders
      row = row.replace(/{plu_number}/g, item.plu_number);
      row = row.replace(/{name}/g, escapeCell(item.name));
      row = row.replace(/{price}/g, item.price.toFixed(2));
      row = row.replace(/{unit}/g, item.unit);
      row = row.replace(/{shelf_life}/g, item.shelf_life);
      row = row.replace(/{tare}/g, item.tare.toFixed(3));
      row = row.replace(/{barcode_prefix}/g, item.barcode_prefix);
      row = row.replace(/{ingredients}/g, escapeCell(item.ingredients || ''));
      
      fileContent += row + '\r\n';
    }

    // Write file to repository disk
    const ext = template.file_format?.toLowerCase() || 'csv';
    const fileName = `plu_sync_${scale.id}.${ext}`;
    const filePath = path.join(SCALES_DIR, fileName);
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    // 3. Create Scale Job
    const jobId = `job-${uuidv4().substring(0, 8)}`;
    await pool.request()
      .input('id', sql.NVarChar, jobId)
      .input('scale_id', sql.NVarChar, scale.id)
      .input('payload', sql.NVarChar, fileName)
      .input('by', sql.NVarChar, created_by || 'admin')
      .query(`
        INSERT INTO ScaleJobs (id, scale_id, job_type, status, progress, log, payload_path, created_by, created_at)
        VALUES (@id, @scale_id, 'sync_plu', 'pending', 10, 'Sync file generated', @payload, @by, GETDATE())
      `);

    const isDigi = scale.model && scale.model.toLowerCase().includes('digi');
    const isDigiF25 = isDigi && scale.port === 4001 && !scale.model.toLowerCase().includes('pc');

    // ── DIGI: Direct F25 TCP sync from Node.js backend ──
    if (isDigiF25) {
      // Run in background so API responds immediately
      (async () => {
        try {
          await pool.request()
            .input('id', sql.NVarChar, jobId)
            .query("UPDATE ScaleJobs SET status = 'running', progress = 30, log = 'Connecting via F25 TCP...' WHERE id = @id");

          const result = await sendDigiF25Plu(targetIp, DIGI_CONST.DEFAULT_PORT, items);

          if (result.success) {
            await pool.request()
              .input('id', sql.NVarChar, jobId)
              .input('log', sql.NVarChar, `PLU data sent via F25. ${result.sentCount}/${result.total} items acknowledged.${result.errors.length > 0 ? ' Errors: ' + result.errors.join('; ') : ''}`)
              .query("UPDATE ScaleJobs SET status = 'success', progress = 100, log = @log, completed_at = GETDATE() WHERE id = @id");

            await pool.request()
              .input('id', sql.NVarChar, id)
              .query("UPDATE Scales SET status = 'online', last_seen = GETDATE() WHERE id = @id");
          } else {
            await pool.request()
              .input('id', sql.NVarChar, jobId)
              .input('log', sql.NVarChar, `F25 sync failed: ${result.errors.join('; ')}`)
              .query("UPDATE ScaleJobs SET status = 'failed', progress = 0, log = @log, completed_at = GETDATE() WHERE id = @id");
          }
        } catch (err) {
          await pool.request()
            .input('id', sql.NVarChar, jobId)
            .input('log', sql.NVarChar, `Unexpected error: ${err.message}`)
            .query("UPDATE ScaleJobs SET status = 'failed', progress = 0, log = @log, completed_at = GETDATE() WHERE id = @id");
        }
      })().catch(err => console.error('[Digi Sync] Background error:', err));

      return res.json({ success: true, job_id: jobId, message: 'Digi F25 sync started. PLU data is being sent directly to the scale.' });
    }

    // ── AGENT-BASED SYNC (Mettler FTP or Digi PC File Drop via PowerShell) ──
    const serverHost = req.headers.host || '192.168.85.30:3001';
    const serverUrl = `http://${serverHost}`;

    const execId = `scale-sync-${uuidv4().substring(0, 8)}`;
    const cmdId = `cmd-${Date.now()}-scale-sync`;

    const ftpScript = `
$scaleIp = '${targetIp}';
$ftpUser = 'admin'; # default credentials for MT scales
$ftpPass = 'admin';
$jobId = '${jobId}';
$fileName = '${fileName}';
$downloadUrl = '${serverUrl}/api/scales/download/' + $fileName;
$localTempFile = "$env:TEMP\\$fileName";

Write-Host "Updating Scale Job status to running...";
Invoke-RestMethod -Uri "${serverUrl}/api/scales/jobs/$jobId/status" -Method Post -Body (@{status='running'; progress=30; log='Downloading PLU file from Centaur...'} | ConvertTo-Json) -ContentType "application/json" | Out-Null;

try {
    # 1. Download PLU file from server
    Write-Host "Downloading $downloadUrl to $localTempFile...";
    $wc = New-Object System.Net.WebClient;
    $wc.DownloadFile($downloadUrl, $localTempFile);

    Invoke-RestMethod -Uri "${serverUrl}/api/scales/jobs/$jobId/status" -Method Post -Body (@{status='running'; progress=60; log='PLU file downloaded. Uploading to scale via FTP...'} | ConvertTo-Json) -ContentType "application/json" | Out-Null;

    # 2. Upload or Drop to Scale
    if ('${isDigi}' -eq 'true') {
        Write-Host "Copying to Digi import folder...";
        $targetDir = "C:\\TWS\\Import";
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null;
        Copy-Item -Path $localTempFile -Destination "$targetDir\\$fileName" -Force;
    } else {
        Write-Host "Uploading to ftp://$scaleIp/import/$fileName...";
        $ftpRequest = [System.Net.FtpWebRequest]::Create("ftp://$scaleIp/import/$fileName");
        $ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile;
        $ftpRequest.Credentials = New-Object System.Net.NetworkCredential($ftpUser, $ftpPass);
        $ftpRequest.Timeout = 10000; # 10 seconds timeout

        $fileBytes = [System.IO.File]::ReadAllBytes($localTempFile);
        $ftpRequest.ContentLength = $fileBytes.Length;
        $ftpStream = $ftpRequest.GetRequestStream();
        $ftpStream.Write($fileBytes, 0, $fileBytes.Length);
        $ftpStream.Close();
        $ftpStream.Dispose();
    }

    # Cleanup local temp file
    Remove-Item $localTempFile -Force -ErrorAction SilentlyContinue;

    # Report Success
    Invoke-RestMethod -Uri "${serverUrl}/api/scales/jobs/$jobId/status" -Method Post -Body (@{status='success'; progress=100; log='PLU data synchronized successfully.'} | ConvertTo-Json) -ContentType "application/json" | Out-Null;
    Write-Output "STATUS:SUCCESS|LOG:PLU data uploaded successfully to scale at $scaleIp";
} catch {
    # Cleanup local temp file
    Remove-Item $localTempFile -Force -ErrorAction SilentlyContinue;

    # Report Failure
    $errorMsg = $_.Exception.Message;
    Invoke-RestMethod -Uri "${serverUrl}/api/scales/jobs/$jobId/status" -Method Post -Body (@{status='failed'; progress=0; log="Sync failed: $errorMsg"} | ConvertTo-Json) -ContentType "application/json" | Out-Null;
    Write-Output "STATUS:FAILED|LOG:Sync failed: $errorMsg";
}
`.trim();

    // Queue in PendingCommands targeting the agent PC
    await pool.request()
      .input('id', sql.NVarChar, cmdId)
      .input('exec_id', sql.NVarChar, execId)
      .input('device_id', sql.NVarChar, scale.device_id)
      .input('hostname', sql.NVarChar, scale.hostname)
      .input('ip', sql.NVarChar, targetIp || scale.gateway_ip)
      .input('command', sql.NVarChar, ftpScript)
      .query(`
        INSERT INTO PendingCommands (id, exec_id, device_id, hostname, ip, command, status, created_at)
        VALUES (@id, @exec_id, @device_id, @hostname, @ip, @command, 'pending', GETDATE())
      `);

    res.json({ success: true, job_id: jobId, exec_id: execId, message: 'Sync job initialized. Script dispatched to Agent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scales/jobs (Scale Jobs History)
router.get('/jobs/history', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT j.*, s.name as scale_name, COALESCE(d.ip, s.ip) as scale_ip
      FROM ScaleJobs j
      INNER JOIN Scales s ON j.scale_id = s.id
      LEFT JOIN Devices d ON s.device_id = d.id
      ORDER BY j.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scales/jobs/:jobId/status (Called by Agent PowerShell script to update ScaleJobs progress/status)
router.post('/jobs/:jobId/status', async (req, res) => {
  const { jobId } = req.params;
  const { status, progress, log } = req.body;

  try {
    const pool = await poolPromise;
    const completedQuery = status === 'success' || status === 'failed' ? ', completed_at = GETDATE()' : '';
    
    await pool.request()
      .input('id', sql.NVarChar, jobId)
      .input('status', sql.NVarChar, status)
      .input('progress', sql.Int, progress)
      .input('log', sql.NVarChar, log)
      .query(`
        UPDATE ScaleJobs 
        SET status = @status, progress = @progress, log = @log ${completedQuery}
        WHERE id = @id
      `);

    // If sync succeeded, update scale status to online/healthy
    if (status === 'success') {
      await pool.request()
        .input('id', sql.NVarChar, jobId)
        .query(`
          UPDATE Scales 
          SET status = 'online', last_seen = GETDATE()
          WHERE id = (SELECT scale_id FROM ScaleJobs WHERE id = @id)
        `);
    } else if (status === 'failed') {
      await pool.request()
        .input('id', sql.NVarChar, jobId)
        .query(`
          UPDATE Scales 
          SET status = 'error', last_seen = GETDATE()
          WHERE id = (SELECT scale_id FROM ScaleJobs WHERE id = @id)
        `);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
