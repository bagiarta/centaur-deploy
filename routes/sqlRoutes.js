
import express from 'express';
import { testConnection, executeCommand, executeRemoteCommands } from '../controllers/sqlController.js';
const router = express.Router();

router.post('/test-connection', testConnection);
router.post('/execute', executeCommand);
router.post('/remote-commands', executeRemoteCommands);
export default router;
