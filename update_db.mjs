import { initDb, poolPromise } from './config/db.js';

async function run() {
    try {
        await initDb();
        const pool = await poolPromise;
        const res = await pool.request().query("SELECT * FROM SystemConfigs WHERE [key]='LATEST_AGENT_VERSION'");
        if (res.recordset.length > 0) {
            await pool.request().query("UPDATE SystemConfigs SET [value]='3.0.0' WHERE [key]='LATEST_AGENT_VERSION'");
            console.log('Updated existing config');
        } else {
            await pool.request().query("INSERT INTO SystemConfigs ([key], [value]) VALUES ('LATEST_AGENT_VERSION', '3.0.0')");
            console.log('Inserted new config');
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
}
run();
