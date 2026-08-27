import { initDb, poolPromise } from './config/db.js';
import sql from 'mssql';

(async () => {
  try {
    await initDb();
    const pool = await poolPromise;
    const movement_id = 'MOV-' + Date.now();
    const result = await pool.request()
      .input('movement_id', sql.VarChar, movement_id)
      .input('asset_code', sql.VarChar, 'TEST01')
      .input('request_type', sql.VarChar, 'TRANSFER')
      .input('from_location', sql.VarChar, null)
      .input('to_location', sql.VarChar, null)
      .input('reason', sql.VarChar, 'test')
      .input('requested_by', sql.VarChar, 'Admin')
      .input('status', sql.VarChar, 'PENDING')
      .query('INSERT INTO AM_Movements (movement_id, asset_code, request_type, from_location, to_location, reason, requested_by, status, request_date, created_at) VALUES (@movement_id, @asset_code, @request_type, @from_location, @to_location, @reason, @requested_by, @status, GETDATE(), GETDATE())');
    console.log(result.recordset);
  } catch (err) {
    console.error('DB ERROR:', err.message);
  }
  process.exit(0);
})();
