const fs = require('fs');
const path = require('path');

const paths = [
  'f:/PepiUpdater/centaur-deploy/src/pages/UserManagementPage.tsx',
  'f:/PepiUpdater/centaur-deploy/src/pages/RoleManagementPage.tsx'
];

paths.forEach(p => {
  console.log(`${p}: ${fs.existsSync(p)}`);
  if (fs.existsSync(p)) {
    console.log(`Stat: ${JSON.stringify(fs.statSync(p))}`);
  }
});
