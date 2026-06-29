import express from 'express';
import * as deviceController from '../controllers/deviceController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Device Management Routes
router.get('/', authenticate, deviceController.getAllDevices);
router.get('/online', authenticate, deviceController.getOnlineDevices);
router.get('/health/:deviceId', authenticate, deviceController.getDeviceHealth);
router.get('/:id', authenticate, deviceController.getDeviceById);
router.post('/', authenticate, deviceController.createDevice);
router.put('/:id', authenticate, deviceController.updateDevice);
router.delete('/:id', authenticate, deviceController.deleteDevice);

// Device status endpoints
router.get('/:id/status', authenticate, deviceController.getDeviceStatus);
router.post('/:id/check', authenticate, deviceController.checkDeviceStatus);

// Channel routes
router.get('/:deviceId/channels', authenticate, deviceController.getDeviceChannels);
router.get('/:deviceId/channels/:channelId', authenticate, deviceController.getChannelById);

// Storage routes
router.get('/:id/storage', authenticate, deviceController.getDeviceStorage);

export default router;