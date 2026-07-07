const fs = require('fs');

const files = [
  'f:/PepiUpdater/centaur-deploy/server.cjs',
  'f:/PepiUpdater/centaur-deploy/routes/legacyRoutes.js'
];

let output = '';

files.forEach(file => {
  if (fs.existsSync(file)) {
    output += 'Searching in: ' + file + '\n';
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('/targets') || line.includes('/tickets')) {
        output += `Line ${index + 1}: ${line.trim()}\n`;
      }
    });
  } else {
    output += 'File does not exist: ' + file + '\n';
  }
});

fs.writeFileSync('f:/PepiUpdater/centaur-deploy/search_results.txt', output);
console.log('Done!');
