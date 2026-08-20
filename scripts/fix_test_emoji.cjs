const fs = require('fs');
const path = require('path');

const filesToFix = [
  path.resolve(__dirname, '../server.cjs'),
  path.resolve(__dirname, '../routes/legacyRoutes.js')
];

filesToFix.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const origLength = content.length;
    
    // Test Notification bell emoji corrupted as ðŸ””
    content = content.replace(/ðŸ””/g, '\\uD83D\\uDD14');
    
    // There might also be other corrupted emojis that the previous script missed
    // For example the warning sign or other symbols if they were slightly different.
    // We explicitly target the test notification strings if they have any weird prefix
    content = content.replace(/let message = `.*? \*Test Notification\*/g, 'let message = `\\uD83D\\uDD14 *Test Notification*');
    content = content.replace(/title: '.*? Test Notification'/g, "title: '\\uD83D\\uDD14 Test Notification'");

    if (content.length !== origLength || content !== fs.readFileSync(file, 'utf8')) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`[FIXED] Restored test notification emojis in ${path.basename(file)}`);
    }
  }
});
