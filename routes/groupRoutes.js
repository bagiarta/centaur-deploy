
import express from 'express';
import { getGroups, createGroup, updateGroup, deleteGroup, manageGroupDevices } from '../controllers/groupController.js';
const router = express.Router();

router.get('/', getGroups);
router.post('/', createGroup);
router.put('/:id', updateGroup);
router.delete('/:id', deleteGroup);
router.post('/:id/devices', manageGroupDevices);
export default router;
