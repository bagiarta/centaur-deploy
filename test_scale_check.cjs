const sql = require('mssql');
const cfg = { user:'sa', password:'R3S1K0_g4j1', server:'192.168.85.29', database:'DBWH_8529', options:{encrypt:false,trustServerCertificate:true} };

sql.connect(cfg).then(async pool => {
  // Latest pending commands with correct column names
  const r = await pool.request().query(
    "SELECT TOP 5 id, exec_id, device_id, hostname, status, result_log, created_at, executed_at FROM PendingCommands ORDER BY created_at DESC"
  );
  console.log('=== PENDING COMMANDS (last 5) ===');
  if (r.recordset.length === 0) {
    console.log('(no rows)');
  } else {
    r.recordset.forEach(row => {
      console.log(`\n[${row.status}] exec_id: ${row.exec_id}`);
      console.log(`  device: ${row.hostname} (${row.device_id})`);
      console.log(`  created: ${row.created_at}  executed: ${row.executed_at}`);
      if (row.result_log) console.log(`  result: ${String(row.result_log).substring(0, 200)}`);
    });
  }

  // ScaleJobs
  const sj = await pool.request().query('SELECT TOP 3 * FROM ScaleJobs ORDER BY created_at DESC');
  console.log('\n=== SCALE JOBS ===');
  if (sj.recordset.length === 0) {
    console.log('(no rows)');
  } else {
    sj.recordset.forEach(row => console.log(JSON.stringify(row)));
  }

  await sql.close();
}).catch(e => console.error('Error:', e.message));
