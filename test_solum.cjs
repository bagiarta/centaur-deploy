const sql = require('mssql');
const { poolPromise } = require('./config/db.js');

async function testSolum() {
  try {
    const pool = await poolPromise;
    const org_cd = '002'; // From user log
    const labelId = 'OCO4BBDE7471';
    
    // 1. Get gateway
    const gwResult = await pool.request()
      .input('org_cd', sql.NVarChar, org_cd)
      .query("SELECT gateway_ip, hostname, api_key FROM ESL_GATEWAYS WHERE org_cd = @org_cd AND status = 'online'");
      
    if (gwResult.recordset.length === 0) {
      console.log('No online gateway found for org 002');
      process.exit(1);
    }
    const gateway = gwResult.recordset[0];
    
    console.log(`Using gateway ${gateway.hostname} (${gateway.gateway_ip})`);

    // 2. Test Blink (Flash LED)
    const blinkUrl = `http://${gateway.gateway_ip}/api/v2/common/labels/blink`;
    console.log(`\nTesting Flash LED: ${blinkUrl}`);
    const blinkRes = await fetch(blinkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.api_key || ''}`
      },
      body: JSON.stringify({ labelId, duration: 10, color: 'GREEN' })
    });
    console.log(`Blink Status: ${blinkRes.status}`);
    console.log(`Blink Response: ${await blinkRes.text()}`);

    // 3. Test Article Push
    const sku = '101001024681';
    const itemName = 'Test Item Name';
    const price = '106965';
    
    const articleUrl = `http://${gateway.gateway_ip}/api/v2/common/articles`;
    console.log(`\nTesting Article Push: ${articleUrl}`);
    const articleRes = await fetch(articleUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.api_key || ''}`
      },
      body: JSON.stringify([{
        articleId: sku,
        articleName: itemName,
        nfcUrl: "",
        data: {
          price: price,
          originPrice: price,
          uom: "pcs"
        }
      }])
    });
    console.log(`Article Status: ${articleRes.status}`);
    console.log(`Article Response: ${await articleRes.text()}`);
    
    // 4. Test Label Link
    const linkUrl = `http://${gateway.gateway_ip}/api/v2/common/labels/link`;
    console.log(`\nTesting Label Link: ${linkUrl}`);
    const linkRes = await fetch(linkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gateway.api_key || ''}`
      },
      body: JSON.stringify({ labelId: labelId, articleId: sku })
    });
    console.log(`Link Status: ${linkRes.status}`);
    console.log(`Link Response: ${await linkRes.text()}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testSolum();
