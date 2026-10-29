import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import * as crmController from '../controllers/crmController.js';
import * as crmTicketController from '../controllers/crmTicketController.js';
import * as productionFlagController from '../controllers/productionFlagController.js';

const router = express.Router();

const ticketsUploadDir = path.join(process.cwd(), 'uploads', 'tickets');
if (!fs.existsSync(ticketsUploadDir)) {
    fs.mkdirSync(ticketsUploadDir, { recursive: true });
}

const ticketStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, ticketsUploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const ticketUpload = multer({ storage: ticketStorage });

router.get('/api/reports/crm-sync', crmController.getCrmSyncStatusLegacy);
router.get('/api/crm/dashboard', crmController.getApiCrmDashboard);
router.get('/api/crm/dashboard/transactions', crmController.getApiCrmDashboardTransactions);
router.get('/api/crm/dashboard/competition', crmController.getApiCrmDashboardCompetition);
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

// Support Utilities: item production flag
router.get('/api/support/production-flags', productionFlagController.getProductionFlagItems);
router.get('/api/support/production-flags/history', productionFlagController.getProductionFlagHistory);
router.put('/api/support/production-flags/:itemCode', productionFlagController.updateProductionFlag);

// Ticket module routes
router.get('/api/crm/tickets-dashboard', crmTicketController.getTicketDashboard);
router.get('/api/crm/tickets/approval-config', crmTicketController.getApprovalWorkflowConfig);
router.put('/api/crm/tickets/approval-config', crmTicketController.updateApprovalWorkflowConfig);
router.get('/api/crm/tickets/customer-lookup', crmTicketController.lookupCustomer);
router.get('/api/crm/tickets/billing-lookup', crmTicketController.lookupBilling);
router.post('/api/crm/tickets', crmTicketController.createTicket);
router.get('/api/crm/tickets', crmTicketController.getTickets);
router.get('/api/crm/tickets/:id', crmTicketController.getTicketById);
router.post('/api/crm/tickets/:id/recheck-h2h', crmTicketController.recheckTicketH2h);
router.get('/api/crm/tickets/:id/recheck-h2h', crmTicketController.recheckTicketH2h);
router.post('/api/crm/tickets/:id/approve', crmTicketController.approveTicket);
router.post('/api/crm/tickets/:id/resubmit', crmTicketController.resubmitTicket);
router.delete('/api/crm/tickets/:id', crmTicketController.deleteTicket);
router.post('/api/crm/tickets/:id/execute', crmTicketController.executeTicket);
router.post('/api/crm/tickets/upload', ticketUpload.single('attachment'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/tickets/${req.file.filename}`;
    res.json({ url: fileUrl });
});

export default router;
