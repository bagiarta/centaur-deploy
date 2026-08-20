import express from 'express';
import * as crmController from '../controllers/crmController.js';
const router = express.Router();

router.get('/api/reports/crm-sync', crmController.getCrmSyncStatusLegacy);
router.get('/api/crm/customer/:phone', crmController.getApiCrmCustomerPhone);
router.get('/api/dev/loyalty/stats', crmController.getApiDevLoyaltyStats);
router.get('/api/dev/loyalty/summary', crmController.getApiDevLoyaltySummary);
router.get('/api/dev/loyalty/profiles', crmController.getApiDevLoyaltyProfiles);
router.get('/api/dev/loyalty/item-sales', crmController.getApiDevLoyaltyItemsales);
router.get('/api/dev/loyalty/export/:tab/:format', crmController.exportDevLoyalty);
router.get('/api/dev/loyalty/etl-status', crmController.getApiDevLoyaltyEtlstatus);
router.post('/api/dev/loyalty/trigger-etl', crmController.postApiDevLoyaltyTriggeretl);
router.get('/api/crm/reports/stores', crmController.getApiCrmReportsStores);
router.get('/api/crm/reports/:type', crmController.getApiCrmReportsType);
router.get('/api/crm/reports/:type/export/:format', crmController.exportCrmReport);
router.get('/api/crm/sync-status', crmController.getApiCrmSyncstatus);
router.get('/api/crm/test-connection', crmController.getApiCrmTestconnection);
router.get('/api/crm/sync-logs', crmController.getApiCrmSynclogs);
router.post('/api/crm/sync-retry', crmController.postApiCrmSyncretry);

export default router;
