const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('http://localhost:3001/api/assets/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'TEST-01',
        name: 'Test Location',
        type: 'STORE',
        parent_location: '',
        status: 'ACTIVE'
      })
    });
    console.log('Status:', res.status);
    console.log('Headers:', res.headers.raw());
    const data = await res.text();
    console.log('Body length:', data.length);
  } catch (err) {
    console.error(err);
  }
}
test();
