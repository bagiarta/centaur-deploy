import sql from 'mssql';

import { dbConfig } from './config/db.js';

const package_name = "DigiNET v3.0.3(1)"; 
const serverUrl = 'http://192.168.85.30:3001';
const packageUrl = `${serverUrl}/api/scales/diginet/download/DigiNET%20v3.0.3(1).rar`;

const updateScript = `
$packageUrl = '${packageUrl}';
$targetDir = 'C:\\TWS\\Temp';
$downloadPath = Join-Path $targetDir 'DigiNET.rar';

New-Item -ItemType Directory -Path $targetDir -Force | Out-Null;

try {
  Invoke-WebRequest -Uri $packageUrl -OutFile $downloadPath -UseBasicParsing;
  Write-Output "STATUS:SUCCESS|LOG:DigiNET package downloaded to $downloadPath";
} catch {
  Write-Output "STATUS:FAILED|LOG:$($_.Exception.Message)";
  exit 1;
}
`.trim();

async function queueDigiNetUpdate() {
  let pool;
  try {
    pool = await sql.connect(dbConfig);
    const cmdId = `cmd-${Date.now()}-scale-update`;
    const execId = `scale-update-${Date.now()}`;
    const device_id = 'dev-1773220748821'; // The test scale device_id
    const hostname = 'test-digi';
    const ip = '192.168.85.254';

    await pool.request()
      .input('id', sql.NVarChar, cmdId)
      .input('exec_id', sql.NVarChar, execId)
      .input('device_id', sql.NVarChar, device_id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('command', sql.NVarChar, updateScript)
      .query(`
        INSERT INTO PendingCommands (id, exec_id, device_id, hostname, ip, command, status, created_at)
        VALUES (@id, @exec_id, @device_id, @hostname, @ip, @command, 'pending', GETDATE())
      `);

    console.log("Successfully queued PendingCommand for DigiNet update.");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    if (pool) await pool.close();
  }
}

queueDigiNetUpdate();
