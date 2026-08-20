const fs = require('fs');
const files = [
  'f:\\PepiUpdater\\centaur-deploy\\routes\\legacyRoutes.js',
  'f:\\PepiUpdater\\centaur-deploy\\server.cjs',
  'f:\\PepiUpdater\\centaur-deploy\\scripts\\sync_dev_loyalty_etl.cjs',
  'f:\\PepiUpdater\\centaur-deploy\\scripts\\sync_wakeup_call_cache_only.cjs'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const hasMojibake = content.includes('ðŸŽŸï¸') || content.includes('ðŸš¨') || content.includes('âœ…');
    if (hasMojibake) {
      console.log(`Found mojibake in ${file}`);
    } else if (/[^\x00-\x7F]/.test(content)) {
      console.log(`Found other non-ASCII in ${file}`);
    }
  }
});
