async function testSolum() {
  const labelId = 'OCO4BBDE7471'; 
  const gatewayIp = '192.168.85.224';
  const apiKey = 'DEFAULT_MOCK_KEY';
  const articleUrl = 'http://' + gatewayIp + '/api/v2/common/articles';

  const p = [{
    articleId: "101001024681",
    articleName: "Item Name",
    nfcUrl: "",
    data: {
      PRICE: "106965",
      originPrice: "106965",
      uom: "pcs"
    }
  }];

  const res = await fetch(articleUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
    body: JSON.stringify(p) 
  });
  console.log('Article Push Status:', res.status);
  console.log('Response:', await res.text());
}
testSolum();
