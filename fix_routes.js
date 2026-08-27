const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'assetRoutes.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the index of the first router.post('/movements'
const firstIdx = content.indexOf("router.post('/movements'");
const secondIdx = content.indexOf("router.post('/movements'", firstIdx + 10);

if (firstIdx !== -1 && secondIdx !== -1) {
  // Delete from firstIdx up to just before the secondIdx. We should probably find the end of the first block safely, but actually we can just find the end of the route.
  // Or safer: replace the exact first block.
  // Wait, let's just use regex.
  const regex = /router\.post\('\/movements'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to create movement' }\);\r?\n  }\r?\n}\);\s+router\.put\('\/movements\/:id'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to update movement' }\);\r?\n  }\r?\n}\);\s+router\.delete\('\/movements\/:id'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to delete movement' }\);\r?\n  }\r?\n}\);/m;
  
  if (regex.test(content)) {
    content = content.replace(regex, '');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully deleted the first broken block.');
  } else {
    // try a simpler regex
    const regex2 = /router\.post\('\/movements'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to create movement' }\);\r?\n  }\r?\n}\);\r?\n/;
    if (regex2.test(content)) {
      content = content.replace(regex2, '');
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Successfully deleted just the first POST block.');
    } else {
      console.log('Could not find the block to delete.');
    }
  }
} else {
  console.log('Could not find two endpoints.');
}
