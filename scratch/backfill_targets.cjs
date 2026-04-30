const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER || '192.168.85.29',
  database: process.env.DB_NAME || 'DBWH_8529',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASS || 'R3S1K0_g4j1',
  options: {
    trustServerCertificate: true,
    encrypt: false
  }
};

async function backfill() {
  let pool;
  try {
    console.log('Connecting to database...');
    pool = await sql.connect(config);
    console.log('Connected.');

    // 1. Get all solved targets with missing info
    const targets = await pool.request().query("SELECT id, ticket_id, hostname FROM TicketTargets WHERE status = 'Solved' AND solved_by IS NULL");
    console.log(`Found ${targets.recordset.length} solved targets with missing info.`);

    let updateCount = 0;
    let skippedCount = 0;

    for (const target of targets.recordset) {
      // 2. Search for the log entry
      // Pattern: "Target [HOSTNAME] status updated to Solved"
      const actionPattern = `Target ${target.hostname} status updated to Solved`;
      
      const logs = await pool.request()
        .input('ticket_id', sql.NVarChar, target.ticket_id)
        .input('pattern', sql.NVarChar, `%${actionPattern}%`)
        .query(`
          SELECT TOP 1 performed_by, created_at 
          FROM TicketLogs 
          WHERE ticket_id = @ticket_id AND action LIKE @pattern 
          ORDER BY created_at DESC
        `);

      if (logs.recordset.length > 0) {
        const log = logs.recordset[0];
        
        // 3. Update the target
        await pool.request()
          .input('id', sql.Int, target.id)
          .input('user', sql.NVarChar, log.performed_by)
          .input('date', sql.DateTime, log.created_at)
          .query('UPDATE TicketTargets SET solved_by = @user, updated_at = @date WHERE id = @id');
        
        updateCount++;
        if (updateCount % 10 === 0) console.log(`Progress: Updated ${updateCount} targets...`);
      } else {
        skippedCount++;
      }
    }

    console.log('--- BACKFILL COMPLETE ---');
    console.log(`Successfully updated: ${updateCount}`);
    console.log(`Logs not found for: ${skippedCount}`);
    
  } catch (err) {
    console.error('Error during backfill:', err);
  } finally {
    if (pool) await pool.close();
  }
}

backfill();
