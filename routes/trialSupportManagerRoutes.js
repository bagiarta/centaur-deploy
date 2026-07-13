import express from 'express';
import * as smController from '../controllers/trialSupportManagerController.js';

const router = express.Router();

router.get('/stores', smController.getStores);
router.get('/pic-users', smController.getPicUsers);
router.get('/cctv-devices', smController.getCctvDevices);
router.get('/schedules', smController.getSchedules);
router.post('/schedules', smController.createSchedule);
router.put('/schedules/:id', smController.updateSchedule);
router.delete('/schedules/:id', smController.deleteSchedule);
router.post('/results', smController.submitPMResult);
router.get('/action-items', smController.getActionItems);
router.put('/action-items/:id/resolve', smController.resolveActionItem);
router.get('/analytics', smController.getAnalytics);

export default router;
