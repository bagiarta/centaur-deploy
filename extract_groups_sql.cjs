const fs = require('fs');
const content = fs.readFileSync('server.cjs', 'utf-8');

function extractRouteBody(startMarker, nextMarker) {
    const start = content.indexOf(startMarker);
    if (start === -1) return null;
    let end;
    if (nextMarker) {
        end = content.indexOf(nextMarker, start);
    } else {
        end = content.length;
    }
    
    const block = content.substring(start, end);
    const handlerStart = block.indexOf('(', block.indexOf('app.')) + 1;
    const comma = block.indexOf(',', handlerStart);
    
    let actualFunction = block.substring(comma + 1).trim();
    const lastClosing = actualFunction.lastIndexOf('});');
    if (lastClosing !== -1) {
        actualFunction = actualFunction.substring(0, lastClosing + 1);
    }
    
    return actualFunction;
}

// GROUPS
const getGroups = extractRouteBody('app.get(\'/api/groups\'', 'app.post(\'/api/groups\'');
const postGroups = extractRouteBody('app.post(\'/api/groups\'', 'app.put(\'/api/groups/:id\'');
const putGroups = extractRouteBody('app.put(\'/api/groups/:id\'', 'app.delete(\'/api/groups/:id\'');
const deleteGroups = extractRouteBody('app.delete(\'/api/groups/:id\'', 'app.get(\'/api/packages\'');
const postGroupDevices = extractRouteBody('app.post(\'/api/groups/:id/devices\'', 'app.post(\'/api/sql/test-connection\'');

let groupCtrl = `
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

export const getGroups = ${getGroups};
export const createGroup = ${postGroups};
export const updateGroup = ${putGroups};
export const deleteGroup = ${deleteGroups};
export const manageGroupDevices = ${postGroupDevices};
`;
fs.writeFileSync('controllers/groupController.js', groupCtrl);

let groupRoutes = `
import express from 'express';
import { getGroups, createGroup, updateGroup, deleteGroup, manageGroupDevices } from '../controllers/groupController.js';
const router = express.Router();

router.get('/', getGroups);
router.post('/', createGroup);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);
router.post('/:id/devices', manageGroupDevices);
export default router;
`;
fs.writeFileSync('routes/groupRoutes.js', groupRoutes);

// SQL
const testSql = extractRouteBody('app.post(\'/api/sql/test-connection\'', 'app.post(\'/api/sql/execute\'');
const executeSql = extractRouteBody('app.post(\'/api/sql/execute\'', 'app.get(\'/api/deployments\'');
const remoteCommands = extractRouteBody('app.post(\'/api/remote-commands\'', 'app.post(\'/api/devices\''); // From lines 1099

let sqlCtrl = `
import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { isValidSafeSQL } from '../utils/sqlUtils.js';
import { getCurrentTimeHHMM } from '../utils/timeUtils.js';

export const testConnection = ${testSql};
export const executeCommand = ${executeSql};
export const executeRemoteCommands = ${remoteCommands};
`;
fs.writeFileSync('controllers/sqlController.js', sqlCtrl);

let sqlRoutes = `
import express from 'express';
import { testConnection, executeCommand, executeRemoteCommands } from '../controllers/sqlController.js';
const router = express.Router();

router.post('/test-connection', testConnection);
router.post('/execute', executeCommand);
router.post('/remote-commands', executeRemoteCommands);
export default router;
`;
fs.writeFileSync('routes/sqlRoutes.js', sqlRoutes);

console.log('Group and SQL controllers/routes generated');
