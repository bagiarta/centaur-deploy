const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('http://localhost:3001/api/test-assets');
    console.log('Status:', res.status);
    const data = await res.text();
    console.log('Body:', data.substring(0, 50));
  } catch (err) {
    console.error(err);
  }
}
test();
