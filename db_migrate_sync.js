import sql from 'mssql';
import { initDb, poolPromise } from './config/db.js';

async function run() {
  await initDb();
  const pool = await poolPromise;
  
  try {
    await pool.request().query('ALTER TABLE Devices ADD last_network_poll DATETIME');
    console.log('Added last_network_poll to Devices');
  } catch(e) { console.log('last_network_poll error:', e.message) }
  
  try {
    await pool.request().query('ALTER TABLE NetworkPolicies ADD updated_at DATETIME DEFAULT GETDATE()');
    console.log('Added updated_at to NetworkPolicies');
  } catch(e) { console.log('updated_at error:', e.message) }
  
  process.exit();
}
run();
