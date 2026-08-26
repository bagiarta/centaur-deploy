async function testSolum() {
  const labelId = '0C281FDE7491'; // A label ID from earlier logs 0C281FDE7491
  const gatewayIp = '192.168.85.224';
  const apiKey = 'DEFAULT_MOCK_KEY';
  const blinkUrl = 'http://' + gatewayIp + '/api/v2/common/labels/blink';

  const payloads = [
    { labelCodes: [labelId], duration: 10, color: 'GREEN' },
    { labelId: [labelId], duration: 10, color: 'GREEN' },
    { labelIds: [labelId], duration: 10, color: 'GREEN' },
    [{ labelId: labelId, duration: 10, color: 'GREEN' }],
    { labelCode: labelId, duration: 10, pattern: 1 },
    { labelCode: labelId, ledDuration: 10, ledColor: 2 },
  ];

  for (const p of payloads) {
    const res = await fetch(blinkUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(p) 
    });
    console.log('Payload:', JSON.stringify(p));
    console.log('Response:', await res.text());
  }
}
testSolum();
