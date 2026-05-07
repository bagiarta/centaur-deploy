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

const getDbConn = extractRouteBody('app.get(\'/api/devices/:id/db-connection\'', 'app.post(\'/api/devices/:id/db-connection\'');
const postDbConn = extractRouteBody('app.post(\'/api/devices/:id/db-connection\'', 'app.post(\'/api/webhook/test-device-ping\'');
const getDevices = extractRouteBody('app.get(\'/api/devices\'', 'app.post(\'/api/remote-commands\'');
const postDevices = extractRouteBody('app.post(\'/api/devices\'', 'app.put(\'/api/devices/:id\'');
const putDevices = extractRouteBody('app.put(\'/api/devices/:id\'', 'app.delete(\'/api/devices/:id\'');
const deleteDevices = extractRouteBody('app.delete(\'/api/devices/:id\'', 'app.post(\'/api/devices/register\'');
const registerDevices = extractRouteBody('app.post(\'/api/devices/register\'', 'app.get(\'/api/groups\'');

let controller = `
import sql from 'mssql';
import { poolPromise } from '../config/db.js';

export const getDbConnection = ${getDbConn};

export const saveDbConnection = ${postDbConn};

export const getAllDevices = ${getDevices};

export const createDevice = ${postDevices};

export const updateDevice = ${putDevices};

export const deleteDevice = ${deleteDevices};

export const registerDevice = ${registerDevices};
`;

fs.writeFileSync('controllers/deviceController.js', controller);

let routes = `
import express from 'express';
import { 
    getDbConnection, 
    saveDbConnection, 
    getAllDevices, 
    createDevice, 
    updateDevice, 
    deleteDevice, 
    registerDevice 
} from '../controllers/deviceController.js';

const router = express.Router();

router.get('/', getAllDevices);
router.post('/', createDevice);
router.put('/:id', updateDevice);
router.delete('/:id', deleteDevice);
router.post('/register', registerDevice);
router.get('/:id/db-connection', getDbConnection);
router.post('/:id/db-connection', saveDbConnection);

export default router;
`;
fs.writeFileSync('routes/deviceRoutes.js', routes);

console.log('Device controller and routes generated');
