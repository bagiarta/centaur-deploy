import express from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Dashboard Routes
router.get('/summary', authenticate, dashboardController.getDashboardSummary);
router.get('/online-map', authenticate, dashboardController.getOnlineDevicesMap);
router.get('/alerts', authenticate, dashboardController.getRecentAlerts);
router.get('/storage', authenticate, dashboardController.getStorageStatus);
router.get('/channels', authenticate, dashboardController.getChannelStatus);

export default router;