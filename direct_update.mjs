import sql from 'mssql';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { dbConfig } from './config/db.js';

// --- Digi F25 Protocol ---
const DIGI_CONST = { STX: 0x02, ETX: 0x03, ACK: 0x06, NAK: 0x15, ENQ: 0x05, EOT: 0x04, DEFAULT_PORT: 4001, TIMEOUT: 5000 };

function buildDigiF25PluRecord(pluNumber, name, unitPrice, tare, shelfLife) {
  const pluStr = String(pluNumber).padStart(6, '0');
  const nameStr = String(name).substring(0, 24).padEnd(24, ' ');
  const priceStr = String(Math.round(unitPrice)).padStart(8, '0');
  const tareStr = String(Math.round((tare || 0) * 1000)).padStart(5, '0');
  const shelfStr = String(shelfLife || 3).padStart(3, '0');
  const dataStr = `P${pluStr}${nameStr}${priceStr}${tareStr}${shelfStr}`;
  const dataBytes = Buffer.from(dataStr, 'ascii');
  let bcc = 0;
  for (let i = 0; i < dataBytes.length; i++) bcc ^= dataBytes[i];
  bcc ^= DIGI_CONST.ETX;
  return Buffer.concat([Buffer.from([DIGI_CONST.STX]), dataBytes, Buffer.from([DIGI_CONST.ETX]), Buffer.from([bcc])]);
}

function sendDigiF25Plu(scaleIp, port, pluItems) {
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

    client.on('error', (err) => { errors.push(`Connection error: ${err.message}`); finish(false); });
    client.on('timeout', () => { errors.push('Connection timeout'); finish(sentCount > 0); });

    const sendNextPlu = () => {
      if (currentIndex >= pluItems.length) {
        client.write(Buffer.from([DIGI_CONST.EOT]));
        setTimeout(() => finish(true), 300);
        return;
      }
      const item = pluItems[currentIndex];
      try {
        const record = buildDigiF25PluRecord(item.plu_number, item.name, item.price, item.tare, item.shelf_life);
        client.write(record);
        currentIndex++;
      } catch (err) {
        errors.push(`PLU ${item.plu_number}: ${err.message}`);
        currentIndex++;
        sendNextPlu();
      }
    };

    client.connect(port || DIGI_CONST.DEFAULT_PORT, scaleIp, () => {
      client.write(Buffer.from([DIGI_CONST.ENQ]));
    });

    client.on('data', (data) => {
      for (const byte of data) {
        if (byte === DIGI_CONST.ACK) {
          if (currentIndex > 0) sentCount++;
          sendNextPlu();
        } else if (byte === DIGI_CONST.NAK) {
          errors.push(`PLU at index ${currentIndex - 1}: NAK received`);
          sendNextPlu();
        }
      }
    });
  });
}

// --- Mettler FTP Update ---
function updateMettlerFtp(scaleIp, filePath, fileName) {
  return new Promise((resolve) => {
    const psScript = `
      try {
        $ftpRequest = [System.Net.FtpWebRequest]::Create("ftp://${scaleIp}/import/${fileName}");
        $ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile;
        $ftpRequest.Credentials = New-Object System.Net.NetworkCredential("admin", "admin");
        $ftpRequest.Timeout = 10000;
        $fileBytes = [System.IO.File]::ReadAllBytes("${filePath}");
        $ftpRequest.ContentLength = $fileBytes.Length;
        $ftpStream = $ftpRequest.GetRequestStream();
        $ftpStream.Write($fileBytes, 0, $fileBytes.Length);
        $ftpStream.Close();
        $ftpStream.Dispose();
        Write-Output "SUCCESS"
      } catch {
        Write-Output "ERROR: $($_.Exception.Message)"
      }
    `;
    const tempPs = path.join(process.cwd(), 'temp_ftp.ps1');
    fs.writeFileSync(tempPs, psScript);
    exec(`powershell.exe -ExecutionPolicy Bypass -File "${tempPs}"`, (error, stdout) => {
      fs.unlinkSync(tempPs);
      if (stdout.includes("SUCCESS")) resolve({ success: true });
      else resolve({ success: false, error: stdout.trim() });
    });
  });
}

function escapeCell(val) {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (str.includes(';') || str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// --- Main Execution ---
async function runDirectUpdate() {
  console.log('--- Starting Direct Scale Update ---');
  let pool;
  try {
    pool = await sql.connect(dbConfig);
    console.log('Connected to DB');

    // 1. Get Scales
    const scaleRes = await pool.request().query("SELECT * FROM Scales");
    const scales = scaleRes.recordset;
    if (scales.length === 0) {
      console.log('No scales found in DB.');
      process.exit(0);
    }

    // 2. Get the latest Template and its PLUs
    const tplRes = await pool.request().query("SELECT TOP 1 * FROM ScalePluTemplates ORDER BY created_at DESC");
    const template = tplRes.recordset[0];
    if (!template) {
      console.log('No PLU Templates found in DB.');
      process.exit(0);
    }

    const itemsRes = await pool.request().input('tpl', sql.NVarChar, template.id).query("SELECT * FROM ScalePluItems WHERE template_id = @tpl ORDER BY plu_number ASC");
    const items = itemsRes.recordset;
    if (items.length === 0) {
      console.log(`No PLU items found for template ${template.name}.`);
      process.exit(0);
    }

    console.log(`Found ${scales.length} scales and ${items.length} PLU items.`);

    // 3. Prepare CSV string for Mettler
    let fileContent = '';
    if (template.header_structure) fileContent += template.header_structure + '\r\n';
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

    // 4. Update each scale
    for (const scale of scales) {
      const isDigi = scale.model && scale.model.toLowerCase().includes('digi');
      const targetIp = scale.ip; // Direct update uses scale IP directly
      console.log(`\n-> Updating ${scale.name} [${scale.model}] at IP ${targetIp}...`);
      
      if (isDigi) {
        console.log(`   Running Digi F25 Sync to ${targetIp}:4001...`);
        const result = await sendDigiF25Plu(targetIp, DIGI_CONST.DEFAULT_PORT, items);
        if (result.success) {
          console.log(`   [SUCCESS] Digi F25 sync sent ${result.sentCount}/${result.total} PLUs. Errors: ${result.errors.length}`);
        } else {
          console.log(`   [ERROR] Digi F25 sync failed: ${result.errors.join(' | ')}`);
        }
      } else {
        console.log(`   Running Mettler FTP Sync to ${targetIp}...`);
        const fileName = `plu_sync_${scale.id}.csv`;
        const tempFilePath = path.join(process.cwd(), fileName);
        fs.writeFileSync(tempFilePath, fileContent, 'utf-8');
        
        const result = await updateMettlerFtp(targetIp, tempFilePath, fileName);
        fs.unlinkSync(tempFilePath);
        
        if (result.success) {
          console.log(`   [SUCCESS] Mettler FTP sync completed for ${fileName}.`);
        } else {
          console.log(`   [ERROR] Mettler FTP sync failed: ${result.error}`);
        }
      }
    }
    
    console.log('\n--- Update Process Finished ---');
  } catch (err) {
    console.error('Execution Error:', err);
  } finally {
    if (pool) await pool.close();
  }
}

runDirectUpdate();
