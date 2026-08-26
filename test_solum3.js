import sql from 'mssql';
import { initDb, poolPromise } from './config/db.js';

async function testSolum() {
  try {
    await initDb();
    const pool = await poolPromise;
    const org_cd = '002';
    const labelId = 'OCO4BBDE7471';
    
    const gwResult = await pool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query("SELECT gateway_ip, hostname, api_key FROM ESL_GATEWAYS WHERE org_cd = @org_cd AND status = 'online'");
      
    const gateway = gwResult.recordset[0];
    console.log('Using gateway ' + gateway.hostname + ' (' + gateway.gateway_ip + ')');

    const blinkUrl = 'http://' + gateway.gateway_ip + '/api/v2/common/labels/blink';
    console.log('\nTesting Flash LED: ' + blinkUrl);
    const blinkRes = await fetch(blinkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (gateway.api_key || '')
      },
      body: JSON.stringify({ labelCode: labelId, duration: 10, color: 'GREEN' }) 
    });
    console.log('Blink Status: ' + blinkRes.status);
    console.log('Blink Response: ' + await blinkRes.text());
    
    // Test original blink payload structure just in case
    const blinkRes2 = await fetch(blinkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (gateway.api_key || '')
      },
      body: JSON.stringify({ labelId: labelId, duration: 10, color: 'GREEN' }) 
    });
    console.log('Blink 2 Status: ' + blinkRes2.status);
    console.log('Blink 2 Response: ' + await blinkRes2.text());
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testSolum();
