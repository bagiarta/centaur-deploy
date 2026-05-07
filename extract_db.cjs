const fs = require('fs');
const content = fs.readFileSync('server.cjs', 'utf-8');

const dbConfigStart = content.indexOf('const dbConfig = {');
const dbConfigEnd = content.indexOf('};', dbConfigStart) + 2;
const dbConfigStr = content.substring(dbConfigStart, dbConfigEnd).replace('const dbConfig =', 'export const dbConfig =');

const initDbStart = content.indexOf('async function initDb() {');
const endMarker = 'console.log(\'Purging orphaned data...\');';
const purgingEnd = content.indexOf('}', content.indexOf('catch (err)', content.indexOf(endMarker))) + 1;
// We need the entire block from initDb to the end of seedData which ends around the purging data catch block.

let initDbStr = content.substring(initDbStart, purgingEnd + 1);
initDbStr = initDbStr.replace('async function initDb()', 'export async function initDb()');
// Actually, seedData is a separate function, we can export it or not.

let finalCode = "import sql from 'mssql';\nimport dotenv from 'dotenv';\ndotenv.config();\n\n";
finalCode += dbConfigStr + '\n\n';
finalCode += 'export let poolPromise;\n\n';
finalCode += initDbStr + '\n';

fs.writeFileSync('config/db.js', finalCode);
console.log('config/db.js generated');
