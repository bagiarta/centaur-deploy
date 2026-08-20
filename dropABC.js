import { poolPromise, initDb } from './config/db.js';
async function run() {
  await initDb();
  const pool = await poolPromise;
  console.log('Dropping corrupted table ItemPerformanceABC...');
  try {
    await pool.request().query('DROP TABLE ItemPerformanceABC');
    console.log('Table dropped successfully.');
  } catch (err) {
    console.error('Error dropping table:', err);
  }
  process.exit(0);
}
run();
