import { initDb, poolPromise } from './config/db.js';

initDb().then(() => {
  return poolPromise;
}).then(pool => {
  return pool.request().query("UPDATE SystemConfigs SET value = '2.9.0' WHERE [key] = 'LATEST_AGENT_VERSION'");
}).then(() => {
  console.log('UPDATE DONE');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
