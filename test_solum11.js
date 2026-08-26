async function testSolum() {
  const gatewayIp = '192.168.85.224';
  const url = `http://${gatewayIp}/api/v2/common/articles`;

  const payload = [{
    stationCode: "DEFAULT",
    articleId: "101001024681",
    articleName: "Item Name",
    data: { PRICE: "106965", price: "106965" }
  }];

  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    console.log('Status:', res.status, 'Body:', await res.text());
  } catch (e) {}
}
testSolum();
