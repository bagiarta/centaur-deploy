import sql from 'mssql';
import { initDb, poolPromise } from './config/db.js';

async function run() {
  await initDb();
  const pool = await poolPromise;
  
  try {
    await pool.request().query('ALTER TABLE NetworkPolicies ADD is_active BIT DEFAULT 1');
    console.log('Added is_active');
  } catch(e) { console.log('is_active error:', e.message) }
  
  try {
    await pool.request().query('ALTER TABLE NetworkPolicies ADD site_group_id INT');
    console.log('Added site_group_id');
  } catch(e) { console.log('site_group_id error:', e.message) }
  
  try {
    await pool.request().query('ALTER TABLE NetworkPolicies ALTER COLUMN domain NVARCHAR(255) NULL');
    console.log('Altered domain to NULL');
  } catch(e) { console.log('domain error:', e.message) }
  
  try {
    await pool.request().query(`IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SiteGroups' AND xtype='U')
       CREATE TABLE SiteGroups (
           id INT IDENTITY(1,1) PRIMARY KEY,
           name NVARCHAR(100) NOT NULL,
           description NVARCHAR(255),
           created_at DATETIME DEFAULT GETDATE()
       )`);
    console.log('Created SiteGroups');
  } catch(e) { console.log('SiteGroups error:', e.message) }
  
  try {
    await pool.request().query(`IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='SiteGroupItems' AND xtype='U')
       CREATE TABLE SiteGroupItems (
           id INT IDENTITY(1,1) PRIMARY KEY,
           group_id INT NOT NULL,
           domain NVARCHAR(255) NOT NULL,
           FOREIGN KEY (group_id) REFERENCES SiteGroups(id) ON DELETE CASCADE
       )`);
    console.log('Created SiteGroupItems');
  } catch(e) { console.log('SiteGroupItems error:', e.message) }
  
  process.exit();
}
run();
