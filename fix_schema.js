import { initDb, poolPromise } from './config/db.js';

async function run() {
  await initDb();
  const pool = await poolPromise;
  
  await pool.request().query(`
    IF OBJECT_ID('AM_Movements', 'U') IS NOT NULL
      DROP TABLE AM_Movements;
      
    CREATE TABLE AM_Movements (
      id INT IDENTITY(1,1) PRIMARY KEY,
      movement_id VARCHAR(50) NOT NULL,
      asset_code VARCHAR(100) NOT NULL,
      request_type VARCHAR(50) NOT NULL,
      from_location VARCHAR(100),
      to_location VARCHAR(100),
      request_date DATETIME DEFAULT GETDATE(),
      completion_date DATETIME,
      status VARCHAR(20) DEFAULT 'PENDING',
      requested_by VARCHAR(100),
      approved_by VARCHAR(100),
      reason NVARCHAR(MAX),
      created_at DATETIME DEFAULT GETDATE()
    );
  `);
  console.log('Recreated AM_Movements table successfully.');
  process.exit(0);
}
run();
