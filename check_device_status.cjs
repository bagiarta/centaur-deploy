require('dotenv').config();
const sql = require('mssql');

async function checkStatus() {
  await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: 'DBWH_8529',
    options: {encrypt: false, trustServerCertificate: true}
  });
  
  const devices = await sql.query`
    SELECT id, name, ip_address, status, last_poll, poll_interval, created_at 
    FROM CCTVDevices 
    WHERE is_active=1 
    ORDER BY created_at DESC
  `;
  
  console.log('\n=== CCTV DEVICES STATUS ===\n');
  devices.recordset.forEach(d => {
    console.log(`${d.name} (${d.ip_address})`);
    console.log(`  Status: ${d.status}`);
    console.log(`  Last Poll: ${d.last_poll || 'Never'}`);
    console.log(`  Poll Interval: ${d.poll_interval}s`);
    console.log(`  Created: ${d.created_at}\n`);
  });
  
  await sql.close();
}

checkStatus();
