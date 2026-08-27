import { initDb, poolPromise } from './config/db.js';
import sql from 'mssql';

(async () => {
  try {
    await initDb();
    const pool = await poolPromise;
    const result = await pool.request()
      .input('asset_code', sql.VarChar, 'TEST01')
      .input('request_type', sql.VarChar, 'TRANSFER')
      .input('from_location', sql.VarChar, null)
      .input('to_location', sql.VarChar, null)
      .input('reason', sql.VarChar, 'test')
      .input('requested_by', sql.VarChar, 'Admin')
      .query('INSERT INTO AM_Movements (asset_code, request_type, from_location, to_location, reason, requested_by) OUTPUT INSERTED.* VALUES (@asset_code, @request_type, @from_location, @to_location, @reason, @requested_by)');
    console.log(result.recordset[0]);
  } catch (err) {
    console.error('DB ERROR:', err.message);
  }
  process.exit(0);
})();
