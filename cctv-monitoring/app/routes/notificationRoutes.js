import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Notification Channel Routes
router.get('/', authenticate, notificationController.getAllNotificationChannels);
router.post('/', authenticate, notificationController.createNotificationChannel);
router.put('/:id', authenticate, notificationController.updateNotificationChannel);
router.delete('/:id', authenticate, notificationController.deleteNotificationChannel);

// Notification Rule Routes
router.get('/rules', authenticate, notificationController.getAllNotificationRules);
router.post('/rules', authenticate, notificationController.createNotificationRule);
router.put('/rules/:id', authenticate, notificationController.updateNotificationRule);
router.delete('/rules/:id', authenticate, notificationController.deleteNotificationRule);

// Test and Send Routes
router.post('/test', authenticate, notificationController.testNotification);
router.post('/send-test', authenticate, notificationController.sendTestMessage);

export default router;