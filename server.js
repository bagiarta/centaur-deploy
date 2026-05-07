import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initDb } from './config/db.js';

// Route imports
import deviceRoutes from './routes/deviceRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import sqlRoutes from './routes/sqlRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import legacyRoutes from './routes/legacyRoutes.js';
// Note: deploymentRoutes, etc. would be imported here too.

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const REPO_PATH = path.resolve('F:\\PepiUpdater\\Repo');

// Ensure Repo path exists
if (!fs.existsSync(REPO_PATH)) {
  fs.mkdirSync(REPO_PATH, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for package uploads
const packageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REPO_PATH),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const packageUpload = multer({ storage: packageStorage });

// Initialize Database
initDb();

// Register Routes
app.use('/api/devices', deviceRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/sql', sqlRoutes);
app.use('/api/webhook', webhookRoutes);

// Mount all remaining (unmigrated) routes at root to preserve exact paths
app.use('/', legacyRoutes);

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Fallback error handler
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// SPA Fallback - Use app.use for catch-all (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Modular Server running on port ${port} (ES Modules)`);
});
