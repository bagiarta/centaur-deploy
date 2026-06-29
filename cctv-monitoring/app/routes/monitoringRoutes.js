import express from 'express';
import * as monitoringController from '../controllers/monitoringController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Monitoring Log Routes
router.get('/', authenticate, monitoringController.getMonitoringLogs);
router.get('/recent', authenticate, monitoringController.getRecentLogs);
router.get('/unresolved', authenticate, monitoringController.getUnresolvedAlerts);
router.get('/device/:deviceId/health', authenticate, monitoringController.getDeviceHealth);

// Log Management Routes
router.put('/logs/:id/resolve', authenticate, monitoringController.resolveLog);
router.put('/logs/resolve', authenticate, monitoringController.resolveMultipleLogs);

export default router;