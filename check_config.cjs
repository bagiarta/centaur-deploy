const { poolPromise } = require('./server.cjs');

async function run() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT * FROM SystemConfigs WHERE [key] IN ('LATEST_AGENT_VERSION', 'AGENT_UPDATE_URL')");
    console.log(res.recordset);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
