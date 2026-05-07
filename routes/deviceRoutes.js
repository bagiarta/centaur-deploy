
import express from 'express';
import { 
    getDbConnection, 
    saveDbConnection, 
    getAllDevices, 
    createDevice, 
    updateDevice, 
    deleteDevice, 
    registerDevice 
} from '../controllers/deviceController.js';

const router = express.Router();

router.get('/', getAllDevices);
router.post('/', createDevice);
router.put('/:id', updateDevice);
router.delete('/:id', deleteDevice);
router.post('/register', registerDevice);
router.get('/:id/db-connection', getDbConnection);
router.post('/:id/db-connection', saveDbConnection);

export default router;
