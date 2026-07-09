const fs = require('fs');
const path = require('path');

const filesToSearch = [
  'f:/PepiUpdater/centaur-deploy/server.cjs',
  'f:/PepiUpdater/centaur-deploy/routes/legacyRoutes.js',
  'f:/PepiUpdater/centaur-deploy/routes/chatRoutes.js',
  'f:/PepiUpdater/centaur-deploy/routes/sqlRoutes.js',
  'f:/PepiUpdater/centaur-deploy/routes/deviceRoutes.js'
];

let output = '';

filesToSearch.forEach(file => {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('assistant-keywords/run') || line.includes('keywords/run')) {
      output += `${file} - Line ${index + 1}: ${line.trim()}\n`;
    }
  });
});

fs.writeFileSync('f:/PepiUpdater/centaur-deploy/routes_search.txt', output || 'No matches found', 'utf8');
console.log('Done!');
