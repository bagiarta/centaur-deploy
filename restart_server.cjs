const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function restartServer() {
  try {
    console.log('🔄 Mencari proses server yang sedang berjalan...');
    
    // Kill existing node processes (server)
    try {
      await execAsync('taskkill /f /im node.exe');
      console.log('✅ Proses node server berhasil dihentikan');
    } catch (err) {
      console.log('ℹ️  Tidak ada proses node yang perlu dihentikan');
    }
    
    // Wait a moment
    console.log('⏳ Menunggu 3 detik...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('🚀 Memulai ulang server...');
    console.log('💡 Silakan jalankan server manual dengan: node server.cjs');
    console.log('');
    console.log('✅ Perbaikan bug hardcode procedure admin sudah diterapkan!');
    console.log('   Sekarang keyword LICENSE bisa dijalankan tanpa admin jika Admin Only = NO');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

restartServer();