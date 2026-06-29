import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initDb } from './config/db.js';
import { initSocket, getIO } from './config/socket.js';
import { startPollingJob } from './cron/pollingJob.js';
import { startCleanupJob } from './cron/cleanupJob.js';

// Import routes
import deviceRoutes from './app/routes/deviceRoutes.js';
import dashboardRoutes from './app/routes/dashboardRoutes.js';
import notificationRoutes from './app/routes/notificationRoutes.js';
import monitoringRoutes from './app/routes/monitoringRoutes.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = initSocket(httpServer);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CCTV Monitoring System',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/devices', deviceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/monitoring', monitoringRoutes);

// API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'CCTV Monitoring System API',
    version: '1.0.0',
    endpoints: {
      devices: {
        getAll: 'GET /api/devices',
        getById: 'GET /api/devices/:id',
        create: 'POST /api/devices',
        update: 'PUT /api/devices/:id',
        delete: 'DELETE /api/devices/:id',
        getStatus: 'GET /api/devices/:id/status',
        check: 'POST /api/devices/:id/check',
        getChannels: 'GET /api/devices/:deviceId/channels',
        getStorage: 'GET /api/devices/:id/storage'
      },
      dashboard: {
        getSummary: 'GET /api/dashboard/summary',
        getOnlineMap: 'GET /api/dashboard/online-map',
        getAlerts: 'GET /api/dashboard/alerts',
        getStorageStatus: 'GET /api/dashboard/storage',
        getChannelStatus: 'GET /api/dashboard/channels'
      },
      notifications: {
        getChannels: 'GET /api/notifications',
        createChannel: 'POST /api/notifications',
        test: 'POST /api/notifications/test',
        sendTest: 'POST /api/notifications/send-test'
      },
      monitoring: {
        getLogs: 'GET /api/monitoring',
        getRecent: 'GET /api/monitoring/recent',
        getUnresolved: 'GET /api/monitoring/unresolved',
        resolve: 'PUT /api/monitoring/logs/:id/resolve'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[CCTV Server] Error:', err.message);
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Start server
const PORT = process.env.PORT || 3006;

const startServer = async () => {
  try {
    // Initialize database
    await initDb();
    
    // Start cron jobs
    startPollingJob();
    startCleanupJob();
    
    // Start server
    httpServer.listen(PORT, () => {
      console.log(`🚀 CCTV Monitoring Server running on port ${PORT}`);
      console.log(`📡 Socket.IO initialized`);
      console.log(`⏰ Polling job scheduled`);
      console.log(`🧹 Cleanup job scheduled`);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('[CCTV Server] SIGTERM received, shutting down gracefully...');
      httpServer.close(() => {
        console.log('[CCTV Server] Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', async () => {
      console.log('[CCTV Server] SIGINT received, shutting down gracefully...');
      httpServer.close(() => {
        console.log('[CCTV Server] Server closed');
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('[CCTV Server] Failed to start:', err.message);
    process.exit(1);
  }
};

startServer();