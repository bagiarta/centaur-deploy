const sql = require('mssql');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function check() {
  try {
    const pool = await sql.connect(dbConfig);
    const pkgId = 'pkg-agent-2.5.0';
    const currentPath = path.resolve('public/agent.exe');
    const repoPath = path.resolve('F:/PepiUpdater/Repo/agent.exe');
    
    // Copy to repo
    fs.copyFileSync(currentPath, repoPath);
    
    // Register Package
    await pool.request()
      .input('id', sql.NVarChar, pkgId)
      .input('name', sql.NVarChar, 'Agent Update 2.5.0 (C# with Inventory)')
      .input('version', sql.NVarChar, '2.5.0')
      .input('file_path', sql.NVarChar, 'agent.exe')
      .input('type', sql.NVarChar, 'exe')
      .input('uploaded_by', sql.NVarChar, 'System')
      .input('uploaded_at', sql.NVarChar, new Date().toISOString())
      .query(`
        DELETE FROM Packages WHERE id = @id;
        INSERT INTO Packages (id, name, version, file_path, type, uploaded_by, uploaded_at)
        VALUES (@id, @name, @version, @file_path, @type, @uploaded_by, @uploaded_at)
      `);
      
    // Create Deployment
    const depId = 'dep-agent-2.5.0';
    const devices = await pool.request().query("SELECT id, hostname, ip FROM Devices");
    const targets = devices.recordset;

    await pool.request()
        .input('id', sql.NVarChar, depId)
        .input('package_id', sql.NVarChar, pkgId)
        .input('package_name', sql.NVarChar, 'Agent Update 2.5.0 (C# with Inventory)')
        .input('target_path', sql.NVarChar, 'C:\\Program Files\\PepiUpdaterAgent')
        .input('created_by', sql.NVarChar, 'System')
        .input('status', sql.NVarChar, 'running')
        .input('total_targets', sql.Int, targets.length)
        .input('pending_count', sql.Int, targets.length)
        .query(`
          DELETE FROM Deployments WHERE id = @id;
          DELETE FROM DeploymentTargets WHERE deployment_id = @id;
          INSERT INTO Deployments (id, package_id, package_name, target_path, created_by, status, total_targets, pending_count)
          VALUES (@id, @package_id, @package_name, @target_path, @created_by, @status, @total_targets, @pending_count)
        `);
        
    for (const d of targets) {
        await pool.request()
          .input('deployment_id', sql.NVarChar, depId)
          .input('device_id', sql.NVarChar, d.id)
          .input('hostname', sql.NVarChar, d.hostname)
          .input('ip', sql.NVarChar, d.ip)
          .input('status', sql.NVarChar, 'pending')
          .query(`
            INSERT INTO DeploymentTargets (deployment_id, device_id, hostname, ip, status, log)
            VALUES (@deployment_id, @device_id, @hostname, @ip, @status, 'Waiting for agent...')
          `);
    }

    console.log(`Deployed Agent to ${targets.length} devices.`);
    await sql.close();
  } catch (err) {
    console.error(err.message);
  }
}
check();
