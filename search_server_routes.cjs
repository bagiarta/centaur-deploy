const fs = require('fs');

const content = fs.readFileSync('f:/PepiUpdater/centaur-deploy/server.cjs', 'utf8');
const lines = content.split('\n');
let output = '';

lines.forEach((line, index) => {
  if (line.includes('legacyRoutes') || line.includes('sync_abc') || line.includes('sync_abc_analysis')) {
    output += `Line ${index + 1}: ${line.trim()}\n`;
  }
});

fs.writeFileSync('f:/PepiUpdater/centaur-deploy/server_route_search.txt', output || 'No matches found', 'utf8');
console.log('Search finished!');
