const axios = require('axios');
(async () => {
  try {
    const res = await axios.post('http://localhost:3000/api/assets/movements', {
      asset_code: 'TEST01',
      request_type: 'TRANSFER',
      from_location: 'LOC1',
      to_location: 'LOC2',
      reason: 'Testing',
      requested_by: 'Admin'
    });
    console.log(res.data);
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
})();
