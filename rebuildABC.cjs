const { runSync } = require('./scripts/sync_abc_analysis.cjs');

async function run() {
  console.log('Repopulating ABC Analysis table for the last 30 days...');
  const today = new Date();
  
  for (let i = 30; i >= 1; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    
    try {
      console.log(`Syncing for ${dateStr}...`);
      await runSync(dateStr);
    } catch (err) {
      console.error(`Error syncing for ${dateStr}:`, err);
    }
  }
  
  console.log('Repopulation complete.');
  process.exit(0);
}

run();
