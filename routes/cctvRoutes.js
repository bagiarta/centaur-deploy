import express from 'express';
import * as cctvController from '../controllers/cctvController.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// CCTV DEVICE ROUTES
// ═══════════════════════════════════════════════════════════════

router.get('/devices', cctvController.getAllCCTVDevices);
router.get('/devices/:id', cctvController.getCCTVDeviceById);
router.get('/devices/:id/time', cctvController.getCCTVDeviceTime);
router.post('/devices', cctvController.createCCTVDevice);
router.put('/devices/:id', cctvController.updateCCTVDevice);
router.post('/devices/:id/sync', cctvController.syncCCTVDevice);
router.delete('/devices/:id', cctvController.deleteCCTVDevice);

router.get('/ping', (req, res) => res.json({ ping: 'pong-v2' }));
router.post('/channels/:id', cctvController.updateCCTVChannel);

// ═══════════════════════════════════════════════════════════════
// CCTV DASHBOARD
// ═══════════════════════════════════════════════════════════════

router.get('/dashboard', cctvController.getCCTVDashboard);

// ═══════════════════════════════════════════════════════════════
// CCTV MONITORING LOGS
// ═══════════════════════════════════════════════════════════════

router.get('/logs', cctvController.getCCTVLogs);
router.put('/logs/:id/resolve', cctvController.resolveCCTVLog);

// ═══════════════════════════════════════════════════════════════
// CCTV LOCATIONS
// ═══════════════════════════════════════════════════════════════

router.get('/locations', cctvController.getAllCCTVLocations);

// ═══════════════════════════════════════════════════════════════
// HIKVISION ISAPI AUTO-DISCOVERY
// ═══════════════════════════════════════════════════════════════

router.post('/test-connection', cctvController.testConnection);
router.post('/discover', cctvController.discoverDevice);
router.post('/poll-now', cctvController.triggerPollNow);

export default router;