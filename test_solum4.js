async function testSolum() {
  try {
    const labelId = 'OCO4BBDE7471';
    const gatewayIp = '192.168.85.224';
    const apiKey = 'DEFAULT_MOCK_KEY'; // In eslRoutes.js they fallback to DEFAULT_MOCK_KEY, but wait, the API key might be empty.
    
    // I will try without api key first, or I can pull it from DB if I disable WHERE status = 'online'
    
    const blinkUrl = 'http://' + gatewayIp + '/api/v2/common/labels/blink';
    console.log('\nTesting Flash LED: ' + blinkUrl);
    
    // Test original blink payload structure
    const blinkRes2 = await fetch(blinkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
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
