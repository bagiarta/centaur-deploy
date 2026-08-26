async function testSolum() {
  const gatewayIp = '192.168.85.224';
  const apiKey = 'DEFAULT_MOCK_KEY';
  
  const urlsToTest = [
    `http://${gatewayIp}/api/v2/common/articles/101001024681`,
    `http://${gatewayIp}/api/v2/articles`,
    `http://${gatewayIp}/api/v2/common/labels/OCO4BBDE7471`
  ];

  for (const url of urlsToTest) {
    try {
      console.log('Testing GET URL:', url);
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });
      console.log('Status:', res.status);
      console.log('Response:', await res.text());
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}
testSolum();
