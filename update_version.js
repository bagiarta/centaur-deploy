import sql from 'mssql';
import { dbConfig } from './config/db.js';

async function update() {
    try {
        const pool = await sql.connect(dbConfig);
        await pool.request().query("UPDATE SystemConfigs SET [value] = '3.1.1' WHERE [key] = 'LATEST_AGENT_VERSION'");
        console.log('Updated to 3.1.1');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
update();
