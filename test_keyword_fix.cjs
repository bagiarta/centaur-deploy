const fetch = require('node-fetch');

async function testKeywordFix() {
  try {
    console.log('🧪 TESTING KEYWORD PROCEDURE FIX');
    console.log('='.repeat(50));
    
    // Test dengan user non-admin yang real
    const mockNonAdminUser = {
      id: 'user-1774864178404', // adjie
      username: 'adjie',
      is_admin: false
    };
    
    console.log('📋 Test Case: Non-admin user menggunakan keyword LICENSE');
    console.log(`   User: ${mockNonAdminUser.username} (admin: ${mockNonAdminUser.is_admin})`);
    console.log(`   Keyword: LICENSE (Admin Only: NO)`);
    console.log('');
    
    // Simulate assistant keyword call
    const testPayload = {
      message: 'LICENSE host=STORESRVR046',
      userId: mockNonAdminUser.id
    };
    
    console.log('🚀 Mengirim test request ke server...');
    
    const response = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': mockNonAdminUser.id
      },
      body: JSON.stringify({
        userId: mockNonAdminUser.id,
        prompt: 'LICENSE host=STORESRVR046 STORE=046',
        history: []
      })
    });
    
    const result = await response.json();
    
    console.log('📥 Response dari server:');
    console.log('   Status:', response.status);
    console.log('   Result:', JSON.stringify(result, null, 2));
    
    // Analyze result
    if (result.text && result.text.includes('hanya boleh dijalankan oleh administrator')) {
      console.log('');
      console.log('❌ MASIH ADA BUG! Keyword masih membutuhkan admin');
      console.log('   Kemungkinan penyebab:');
      console.log('   1. Server belum restart dengan fix terbaru');
      console.log('   2. Ada logic hardcode lain yang belum diperbaiki');
      console.log('   3. Cache atau session yang masih menyimpan data lama');
    } else if (result.text && result.text.includes('Target host')) {
      console.log('');
      console.log('✅ BERHASIL! Keyword bisa dijalankan non-admin');
      console.log('   (Error host normal karena connection issue, tapi tidak ada admin block)');
    } else {
      console.log('');  
      console.log('ℹ️  Response tidak terduga, perlu analisa lebih lanjut');
    }
    
  } catch (err) {
    console.error('❌ Test Error:', err.message);
    console.log('');
    console.log('💡 Pastikan server sudah berjalan di port 3001');
  }
}

testKeywordFix();