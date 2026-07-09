const fs = require('fs');

function findResolve() {
  const file = 'f:/PepiUpdater/centaur-deploy/routes/legacyRoutes.js';
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  let resolveStart = -1;
  let runStart = -1;
  
  lines.forEach((line, index) => {
    if (line.includes('async function resolveAssistantKeyword') || line.includes('function resolveAssistantKeyword')) {
      resolveStart = index;
    }
    if (line.includes('/api/assistant-keywords/run')) {
      runStart = index;
    }
  });

  if (resolveStart !== -1) {
    console.log(`✅ Found resolveAssistantKeyword at line ${resolveStart + 1}`);
    const chunk = lines.slice(resolveStart, resolveStart + 250).join('\n');
    fs.writeFileSync('f:/PepiUpdater/centaur-deploy/resolve_code_utf8.txt', chunk, 'utf8');
  } else {
    console.log('❌ resolveAssistantKeyword not found.');
  }

  if (runStart !== -1) {
    console.log(`✅ Found /api/assistant-keywords/run at line ${runStart + 1}`);
    const chunk = lines.slice(runStart - 10, runStart + 100).join('\n');
    fs.writeFileSync('f:/PepiUpdater/centaur-deploy/run_code_utf8.txt', chunk, 'utf8');
  } else {
    console.log('❌ /api/assistant-keywords/run not found.');
  }
  
  console.log('Done!');
}

findResolve();
