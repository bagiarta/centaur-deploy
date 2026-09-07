import { initDb, poolPromise } from './config/db.js';
async function run() {
    await initDb();
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT DISTINCT ip FROM Devices WHERE ip IS NOT NULL");
    console.log(res.recordset.map(r => r.ip).join(','));
    process.exit(0);
}
run();
