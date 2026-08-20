const fs = require('fs');
const filePath = 'f:\\PepiUpdater\\centaur-deploy\\server.cjs';
let content = fs.readFileSync(filePath, 'utf-8');
const searchStr = `    setTimeout(eslSyncLoop, 10 * 60 * 1000);
  }
  eslSyncLoop();`;
const replaceStr = `    setTimeout(eslSyncLoop, 10 * 60 * 1000);
  }
  eslSyncLoop();

  // Start Wakeup Call Cache Cron
  try {
    const { initCron } = require('./services/wakeupCallCron.cjs');
    initCron();
  } catch (err) {
    console.error('Wakeup Call Cron Init Error:', err);
  }`;
content = content.replace(searchStr, replaceStr);
fs.writeFileSync(filePath, content, 'utf-8');
console.log('Injected wakeupCallCron into server.cjs');
