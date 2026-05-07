const fs = require('fs');
const content = fs.readFileSync('server.cjs', 'utf-8');

const h2hStart = content.indexOf('// ── H2H CRM INTEGRATION');
const h2hEnd = content.indexOf('// ── CRM REPORTS DATABASE POOL');

if (h2hStart !== -1 && h2hEnd !== -1) {
  let h2hStr = content.substring(h2hStart, h2hEnd);
  
  // Replace to export
  h2hStr = h2hStr.replace('const h2hConfig =', 'export const h2hConfig =');
  h2hStr = h2hStr.replace('async function getH2hToken()', 'export async function getH2hToken()');
  
  // Need fetch? No, fetch is global in Node 18+.
  
  fs.writeFileSync('config/h2h.js', h2hStr);
  console.log('config/h2h.js generated');
} else {
  console.log('H2H section not found');
}
