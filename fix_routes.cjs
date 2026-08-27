const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'assetRoutes.js');
let content = fs.readFileSync(filePath, 'utf8');

const regex = /router\.post\('\/movements'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to create movement' }\);\r?\n  }\r?\n}\);\s*router\.put\('\/movements\/:id'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to update movement' }\);\r?\n  }\r?\n}\);\s*router\.delete\('\/movements\/:id'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to delete movement' }\);\r?\n  }\r?\n}\);\s*/m;

if (regex.test(content)) {
  content = content.replace(regex, '');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully deleted the first broken block.');
} else {
  const regex2 = /router\.post\('\/movements'[\s\S]*?res\.status\(500\)\.json\({ error: 'Failed to create movement' }\);\r?\n  }\r?\n}\);\s*/;
  if (regex2.test(content)) {
    content = content.replace(regex2, '');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Successfully deleted just the first POST block.');
  } else {
    console.log('Could not find the block to delete.');
  }
}
