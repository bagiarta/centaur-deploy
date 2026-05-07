const fs = require('fs');
const content = fs.readFileSync('server.cjs', 'utf-8');

// TIME UTILS
const timeStart = content.indexOf('// ── TIMEZONE HELPER FUNCTIONS');
const timeEnd = content.indexOf('/**', timeStart);
let timeStr = content.substring(timeStart, timeEnd);

timeStr = timeStr.replace('function getCurrentTimestamp()', 'export function getCurrentTimestamp()');
timeStr = timeStr.replace('function getCurrentTimeHHMM()', 'export function getCurrentTimeHHMM()');
timeStr = timeStr.replace('function getISOTimestamp()', 'export function getISOTimestamp()');

fs.writeFileSync('utils/timeUtils.js', timeStr);
console.log('utils/timeUtils.js generated');

// SQL UTILS
const sqlStart = content.indexOf('/**\r\n * Validates if the SQL query');
const sqlEnd = content.indexOf('// ── H2H CRM INTEGRATION', sqlStart);
let sqlStr = content.substring(sqlStart, sqlEnd);

sqlStr = sqlStr.replace('function isValidSafeSQL(script)', 'export function isValidSafeSQL(script)');

fs.writeFileSync('utils/sqlUtils.js', sqlStr);
console.log('utils/sqlUtils.js generated');
