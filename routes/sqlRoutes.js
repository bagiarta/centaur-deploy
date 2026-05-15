
import express from 'express';
import { testConnection, executeCommand, executeRemoteCommands, getDatabases, getTables } from '../controllers/sqlController.js';
const router = express.Router();

router.get('/databases/:deviceId', getDatabases);
router.get('/tables/:deviceId/:databaseName', getTables);

router.post('/test-connection', testConnection);
router.post('/execute', executeCommand);
router.post('/remote-commands', executeRemoteCommands);
export default router;
