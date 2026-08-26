async function testSolum() {
  const gatewayIp = '192.168.85.224';
  const urls = [
    `http://${gatewayIp}/api/v2/articles?company=PEPI&store=002`,
    `http://${gatewayIp}/api/v2/articles?company=PEPI&store=1`,
    `http://${gatewayIp}/api/v2/common/articles`
  ];

  const payload = [{
    articleId: "101001024681",
    articleName: "Item Name",
    data: { PRICE: "106965" }
  }];

  for (const url of urls) {
    try {
      console.log('---');
      console.log('Testing URL:', url);
      // No Auth
      let res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      console.log('No Auth -> Status:', res.status, 'Body:', await res.text());

      // Empty Bearer
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' }, body: JSON.stringify(payload) });
      console.log('Empty Bearer -> Status:', res.status, 'Body:', await res.text());

      // Dummy Bearer
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer DUMMY' }, body: JSON.stringify(payload) });
      console.log('Dummy Bearer -> Status:', res.status, 'Body:', await res.text());
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}
testSolum();
