
import express from 'express';
import { testDevicePing, testResults, devicePing } from '../controllers/webhookController.js';

const router = express.Router();

router.post('/test-device-ping', testDevicePing);
router.get('/test-results', testResults);
router.post('/device-ping', devicePing);

export default router;
