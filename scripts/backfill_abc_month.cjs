const { runSync } = require('./sync_abc_analysis.cjs');

async function backfillMonth(yearMonth) {
  // yearMonth format: 'YYYY-MM', e.g., '2026-05'
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    console.error('Format salah! Gunakan format YYYY-MM. Contoh: 2026-05');
    return;
  }

  const [year, month] = yearMonth.split('-');
  // get total days in that month
  const daysInMonth = new Date(year, month, 0).getDate();

  console.log(`=================================================`);
  console.log(`🚀 STARTING BULK BACKFILL FOR MONTH: ${yearMonth}`);
  console.log(`Total days to sync: ${daysInMonth}`);
  console.log(`=================================================\n`);

  for (let i = 1; i <= daysInMonth; i++) {
    const dayStr = i.toString().padStart(2, '0');
    const dateStr = `${year}-${month}-${dayStr}`;
    
    console.log(`\n⏳ [${i}/${daysInMonth}] Processing date: ${dateStr}...`);
    try {
      await runSync(dateStr);
    } catch (e) {
      console.error(`❌ Failed processing ${dateStr}:`, e.message);
    }
  }

  console.log(`\n=================================================`);
  console.log(`✅ BULK BACKFILL FOR ${yearMonth} COMPLETE!`);
  console.log(`=================================================`);
}

const argMonth = process.argv[2];
if (argMonth) {
  backfillMonth(argMonth).then(() => {
    process.exit(0);
  });
} else {
  console.log('Silakan masukkan bulan yang ingin di-tarik datanya.');
  console.log('Contoh: node scripts/backfill_abc_month.cjs 2026-05');
  process.exit(1);
}
