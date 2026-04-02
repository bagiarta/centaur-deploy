import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// SQL Server configuration
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: false, // For local dev, usually false
    trustServerCertificate: true,
  },
};

// Application State
let poolPromise;

// Attempt to initialize database connection and create table
async function initDb() {
  try {
    poolPromise = sql.connect(dbConfig);
    const pool = await poolPromise;
    console.log('✅ Connected to SQL Server:', dbConfig.server);

    // Create Devices table if it doesn't exist
    const createTableQuery = `
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Devices' AND xtype='U')
      CREATE TABLE Devices (
          id NVARCHAR(50) PRIMARY KEY,
          hostname NVARCHAR(100) NOT NULL,
          ip NVARCHAR(50) NOT NULL,
          os_version NVARCHAR(100),
          cpu NVARCHAR(100),
          ram NVARCHAR(50),
          disk NVARCHAR(50),
          agent_version NVARCHAR(50),
          status NVARCHAR(50),
          last_seen NVARCHAR(50),
          group_ids NVARCHAR(500) -- Simple string concatenation for simplicity
      )
    `;
    await pool.request().query(createTableQuery);
    console.log('✅ Devices table ready in DBWH_8529');
  } catch (err) {
    console.error('❌ Database Connection Failed! Bad Config: ', err);
  }
}

// ── GET /api/devices ──────────────────────────────────────
app.get('/api/devices', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Devices');
    
    // Parse the group_ids back into arrays for the frontend mapping
    const devices = result.recordset.map(row => ({
      ...row,
      group_ids: row.group_ids ? row.group_ids.split(',').filter(Boolean) : []
    }));
    
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/devices ─────────────────────────────────────
app.post('/api/devices', async (req, res) => {
  try {
    const { id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, last_seen, group_ids } = req.body;
    const groupsString = Array.isArray(group_ids) ? group_ids.join(',') : '';

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version)
      .input('cpu', sql.NVarChar, cpu)
      .input('ram', sql.NVarChar, ram)
      .input('disk', sql.NVarChar, disk)
      .input('agent_version', sql.NVarChar, agent_version)
      .input('status', sql.NVarChar, status)
      .input('last_seen', sql.NVarChar, last_seen)
      .input('group_ids', sql.NVarChar, groupsString)
      .query(`
        INSERT INTO Devices 
        (id, hostname, ip, os_version, cpu, ram, disk, agent_version, status, last_seen, group_ids)
        VALUES 
        (@id, @hostname, @ip, @os_version, @cpu, @ram, @disk, @agent_version, @status, @last_seen, @group_ids)
      `);
      
    res.status(201).json({ message: 'Device created successfully', device: req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/devices/:id ──────────────────────────────────
app.put('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { hostname, ip, os_version, cpu, ram, disk, agent_version, status, last_seen, group_ids } = req.body;
    const groupsString = Array.isArray(group_ids) ? group_ids.join(',') : '';

    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('hostname', sql.NVarChar, hostname)
      .input('ip', sql.NVarChar, ip)
      .input('os_version', sql.NVarChar, os_version)
      .input('cpu', sql.NVarChar, cpu)
      .input('ram', sql.NVarChar, ram)
      .input('disk', sql.NVarChar, disk)
      .input('agent_version', sql.NVarChar, agent_version)
      .input('status', sql.NVarChar, status)
      .input('last_seen', sql.NVarChar, last_seen)
      .input('group_ids', sql.NVarChar, groupsString)
      .query(`
        UPDATE Devices 
        SET hostname=@hostname, ip=@ip, os_version=@os_version, cpu=@cpu, 
            ram=@ram, disk=@disk, agent_version=@agent_version, status=@status, 
            last_seen=@last_seen, group_ids=@group_ids
        WHERE id=@id
      `);
      
    res.json({ message: 'Device updated successfully', device: { ...req.body, id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/devices/:id ───────────────────────────────
app.delete('/api/devices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query('DELETE FROM Devices WHERE id=@id');
      
    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the server
app.listen(port, async () => {
  console.log('🚀 Server running on http://localhost:' + port);
  await initDb();
});
