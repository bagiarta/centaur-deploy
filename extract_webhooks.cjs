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
    
    // Find the actual app.get/post/put/delete call
    const block = content.substring(start, end);
    const handlerStart = block.indexOf('(', block.indexOf('app.')) + 1; // get past app.post(
    const comma = block.indexOf(',', handlerStart);
    let asyncStr = block.indexOf('async', comma);
    let reqResStart = block.indexOf('(', comma);
    
    let actualFunction = block.substring(comma + 1).trim();
    // find the closing '});'
    const lastClosing = actualFunction.lastIndexOf('});');
    if (lastClosing !== -1) {
        actualFunction = actualFunction.substring(0, lastClosing + 1);
    }
    
    return actualFunction;
}

const webhookTestDevicePing = extractRouteBody('app.post(\'/api/webhook/test-device-ping\'', 'app.get(\'/api/webhook/test-results\'');
const webhookTestResults = extractRouteBody('app.get(\'/api/webhook/test-results\'', 'app.post(\'/api/webhook/device-ping\'');
const webhookDevicePing = extractRouteBody('app.post(\'/api/webhook/device-ping\'', 'app.get(\'/api/devices\'');

let webhookController = `
import fs from 'fs';
import path from 'path';
import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { getCurrentTimestamp } from '../utils/timeUtils.js';

// ES Module dirname equivalent
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const testDevicePing = ${webhookTestDevicePing};

export const testResults = ${webhookTestResults};

export const devicePing = ${webhookDevicePing};
`;

fs.writeFileSync('controllers/webhookController.js', webhookController);

let webhookRoutes = `
import express from 'express';
import { testDevicePing, testResults, devicePing } from '../controllers/webhookController.js';

const router = express.Router();

router.post('/test-device-ping', testDevicePing);
router.get('/test-results', testResults);
router.post('/device-ping', devicePing);

export default router;
`;
fs.writeFileSync('routes/webhookRoutes.js', webhookRoutes);

console.log('Webhook controller and routes generated');
