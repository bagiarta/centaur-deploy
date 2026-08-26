async function testSolum() {
  const labelId = 'OCO4BBDE7471'; 
  const gatewayIp = '192.168.85.224';
  const apiKey = 'DEFAULT_MOCK_KEY';
  
  // Test variations of article push
  const urlsToTest = [
    `http://${gatewayIp}/api/v2/common/articles`,
    `http://${gatewayIp}/api/v2/common/articles?company=PEPI&store=1`,
    `http://${gatewayIp}/api/v2/articles`,
    `http://${gatewayIp}/api/v2/articles?company=PEPI&store=1`,
    `http://${gatewayIp}/api/v2/articles?company=DEFAULT&store=DEFAULT`
  ];

  const p = [{
    company: "PEPI",
    store: "1",
    articleId: "101001024681",
    articleName: "Item Name",
    nfcUrl: "",
    data: {
      PRICE: "106965",
      originPrice: "106965",
      uom: "pcs"
    }
  }];

  for (const url of urlsToTest) {
    try {
      console.log('Testing URL:', url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(p) 
      });
      console.log('Status:', res.status);
      console.log('Response:', await res.text());
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}
testSolum();
