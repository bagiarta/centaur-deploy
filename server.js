import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server as SocketIOServer } from 'socket.io';
import { initDb, poolPromise } from './config/db.js';
import { v4 as uuidv4 } from 'uuid';
import sql from 'mssql';
import proxy from 'express-http-proxy';

// Route imports
import deviceRoutes from './routes/deviceRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import sqlRoutes from './routes/sqlRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import pushRoutes from './routes/pushRoutes.js';
import scaleRoutes from './routes/scaleRoutes.js';
import cctvRoutes from './routes/cctvRoutes.js';
import eslRoutes from './routes/eslRoutes.js';
import legacyRoutes, { startBackgroundTasks } from './routes/legacyRoutes.js';
import trialSupportManagerRoutes from './routes/trialSupportManagerRoutes.js';
import { sendWebPush } from './controllers/pushController.js';
import { startCCTVPollingJob } from './utils/cctvPollingService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const sslDir = path.resolve(__dirname, 'config', 'ssl');
const keyPath = path.join(sslDir, 'server.key');
const certPath = path.join(sslDir, 'centaur-ca.crt');

const httpServer = createHttpServer(app);
let httpsServer;

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const credentials = {
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8')
  };
  httpsServer = createHttpsServer(credentials, app);
  console.log('🔒 HTTPS Enabled (using certificates from config/ssl/)');
} else {
  console.log('🔓 HTTPS Disabled (no certificates found)');
}

const io = new SocketIOServer({
  cors: { origin: '*' }
});
io.attach(httpServer);
if (httpsServer) {
  io.attach(httpsServer);
}

const port = process.env.PORT || 3005;
const httpsPort = process.env.HTTPS_PORT || 3002;
if (!fs.existsSync('C:\\Digimap')) { fs.mkdirSync('C:\\Digimap', { recursive: true }); }

// Repo path – same as routes/scaleRoutes.js & legacyRoutes.js
const REPO_PATH = path.resolve('F:\\PepiUpdater\\Repo');

// Ensure Repo path exists
if (!fs.existsSync(REPO_PATH)) {
  fs.mkdirSync(REPO_PATH, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoints for Enterprise SSO Module
app.use('/sso-api', proxy('http://localhost:3003', {
  preserveHostHdr: true,
  proxyReqPathResolver: function (req) {
    return '/api' + req.url;
  },
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    proxyReqOpts.headers['x-forwarded-proto'] = srcReq.protocol;
    return proxyReqOpts;
  }
}));

app.use('/sso', proxy('http://localhost:3000', {
  preserveHostHdr: true,
  proxyReqPathResolver: function (req) {
    // Keep the full /sso prefix so serve.js can match /sso/static/js/...
    return '/sso' + req.url;
  },
  proxyReqOptDecorator: function(proxyReqOpts, srcReq) {
    proxyReqOpts.headers['x-forwarded-proto'] = srcReq.protocol;
    return proxyReqOpts;
  }
}));


// Configure Multer for package uploads
const packageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REPO_PATH),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const packageUpload = multer({ storage: packageStorage });
// Template upload configuration – stores files in C:\\Digimap
const templateStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'C:\\Digimap'),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const templateUpload = multer({ storage: templateStorage });

// Initialize Database
initDb().then(() => {
  startBackgroundTasks();
  startCCTVPollingJob();
});

// Session Validation Middleware
app.use(async (req, res, next) => {
  const excludedPaths = [
    '/api/auth/login',
    '/api/auth/sso-login',
    '/api/auth/sso-config',
    '/api/auth/sso-logout',
    '/api/ssl/cert',
    '/api/ssl/installer'
  ];

  if (excludedPaths.includes(req.path)) {
    return next();
  }

  const sessionId = req.headers['x-session-id'] || req.headers['X-Session-Id'];
  const userId = req.headers['x-user-id'] || req.headers['X-User-Id'];

  if (userId) {
    if (!sessionId) {
      console.warn(`[AUTH] Blocked request from user ${userId}: Missing x-session-id header.`);
      return res.status(401).json({ error: 'Unauthorized: Session required' });
    }

    try {
      const pool = await poolPromise;
      const sessionResult = await pool.request()
        .input('sid', sql.VarChar, sessionId)
        .input('user_id', sql.VarChar, userId)
        .query('SELECT is_active FROM UserSessions WHERE id = @sid AND user_id = @user_id');

      const session = sessionResult.recordset[0];
      if (!session || !session.is_active) {
        console.warn(`[AUTH] Session ${sessionId} is inactive or invalid for user ${userId}.`);
        return res.status(401).json({ error: 'Unauthorized: Session expired or revoked' });
      }
    } catch (err) {
      console.error('[AUTH] Session validation error:', err);
      return res.status(500).json({ error: 'Internal server error during session validation' });
    }
  }

  next();
});

// Register Routes
app.use('/api/devices', deviceRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/sql', sqlRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/chat', chatRoutes);
// Endpoint for uploading template files (e.g., PLU CSV)
app.post('/api/templates/upload', templateUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  return res.json({ success: true, path: req.file.path });
});
app.use('/api/push', pushRoutes);
app.use('/api/scales', scaleRoutes);
app.use('/api/cctv', cctvRoutes);
app.use('/api/esl', eslRoutes);
app.use('/api/trial/support-manager', trialSupportManagerRoutes);

// Mount all remaining (unmigrated) routes at root to preserve exact paths
app.use('/', legacyRoutes);

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// SSL Downloads
app.get('/api/ssl/cert', (req, res) => {
  const caPath = path.join(sslDir, 'centaur-ca.crt');
  if (fs.existsSync(caPath)) {
    res.download(caPath, 'centaur-ca.crt');
  } else {
    res.status(404).send('Certificate not found on server.');
  }
});

app.get('/api/ssl/installer', (req, res) => {
  const host = req.headers.host || '192.168.85.55:3001';
  const batContent = `@echo off
setlocal
echo ===================================================
echo Memasang Sertifikat SSL Centaur Deploy ke Windows
echo ===================================================
echo Meminta akses Administrator...
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Akses Administrator dikonfirmasi.
) else (
    echo GAGAL: Skrip ini harus dijalankan sebagai Administrator!
    echo Silakan tutup jendela ini, lalu Klik Kanan file Install-Cert.bat 
    echo dan pilih "Run as Administrator".
    pause
    exit /b 1
)

cd /d "%~dp0"
echo Mengunduh sertifikat dari server...
powershell -Command "[Net.ServicePointManager]::ServerCertificateValidationCallback = {$true}; (New-Object Net.WebClient).DownloadFile('https://${host}/api/ssl/cert', 'centaur-ca.crt')"

if exist "centaur-ca.crt" (
    echo Sertifikat ditemukan, memasang ke Trusted Root...
    certutil -addstore -f "Root" centaur-ca.crt
    echo.
    echo ===================================================
    echo SUKSES! Sertifikat berhasil dipasang.
    echo Silakan tutup semua jendela browser (Chrome/Edge),
    echo lalu buka kembali halaman Centaur Deploy.
    echo ===================================================
    pause
) else (
    echo GAGAL: Sertifikat tidak ditemukan atau gagal diunduh.
    pause
)
`;
  res.setHeader('Content-disposition', 'attachment; filename=Install-Cert.bat');
  res.setHeader('Content-type', 'application/x-bat');
  res.send(batContent);
});

// Fallback error handler
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// SPA Fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── SOCKET.IO: Real-time Chat ────────────────────────────────
io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;
  if (userId) {
    socket.join(`user:${userId}`);
    console.log(`[Chat] User ${userId} connected (socket: ${socket.id})`);
  }

  // Join a conversation room
  socket.on('join_room', (conversationId) => {
    socket.join(`room:${conversationId}`);
  });

  // Send a message (supports optional file attachments)
  socket.on('send_message', async ({ conversationId, senderId, content, attachmentUrl, attachmentName, attachmentType }) => {
    const hasText = content?.trim();
    const hasAttachment = attachmentUrl?.trim();
    if (!conversationId || !senderId || (!hasText && !hasAttachment)) return;

    try {
      const pool = await poolPromise;
      const msgId = uuidv4();
      const now = new Date().toISOString();
      const safeContent = hasText ? content : '';

      // Persist to DB (with optional attachment columns)
      await pool.request()
        .input('id',             sql.NVarChar, msgId)
        .input('cid',            sql.NVarChar, conversationId)
        .input('sid',            sql.NVarChar, senderId)
        .input('content',        sql.NVarChar, safeContent)
        .input('attachmentUrl',  sql.NVarChar, attachmentUrl  || null)
        .input('attachmentName', sql.NVarChar, attachmentName || null)
        .input('attachmentType', sql.NVarChar, attachmentType || null)
        .query(`
          INSERT INTO ChatMessages (id, conversation_id, sender_id, content, is_read, created_at, attachment_url, attachment_name, attachment_type)
          VALUES (@id, @cid, @sid, @content, 0, GETDATE(), @attachmentUrl, @attachmentName, @attachmentType)
        `);

      // Fetch sender info
      const senderRes = await pool.request()
        .input('sid', sql.NVarChar, senderId)
        .query('SELECT username, full_name FROM Users WHERE id = @sid');
      const sender = senderRes.recordset[0] || { username: 'Unknown', full_name: 'Unknown' };

      const message = {
        id: msgId,
        conversation_id: conversationId,
        sender_id: senderId,
        username: sender.username,
        full_name: sender.full_name,
        content: safeContent,
        is_read: false,
        created_at: now,
        attachment_url:  attachmentUrl  || null,
        attachment_name: attachmentName || null,
        attachment_type: attachmentType || null,
      };

      // Broadcast to all participants in the room
      io.to(`room:${conversationId}`).emit('new_message', message);

      // Push notification to users NOT in the room (unread badge update)
      const participantsRes = await pool.request()
        .input('cid', sql.NVarChar, conversationId)
        .query('SELECT user_id FROM ChatParticipants WHERE conversation_id = @cid');

      const preview = hasText ? content.substring(0, 60) : `📎 ${attachmentName || 'Attachment'}`;
      for (const { user_id } of participantsRes.recordset) {
        if (user_id !== senderId) {
          io.to(`user:${user_id}`).emit('new_notification', {
            conversationId,
            senderId,
            senderName: sender.full_name,
            preview
          });

          // If user is offline (no active socket), send Web Push
          const room = io.sockets.adapter.rooms.get(`user:${user_id}`);
          if (!room || room.size === 0) {
             sendWebPush(user_id, {
               title: sender.full_name,
               body: preview,
               url: `/`
             });
          }
        }
      }
    } catch (err) {
      console.error('[Chat] send_message error:', err.message);
    }
  });

  // Delete a message (soft delete)
  socket.on('delete_message', async ({ messageId, conversationId, senderId }) => {
    if (!messageId || !conversationId || !senderId) return;

    try {
      const pool = await poolPromise;
      
      const updateRes = await pool.request()
        .input('msgId', sql.NVarChar, messageId)
        .input('sid', sql.NVarChar, senderId)
        .query(`
          UPDATE ChatMessages 
          SET content = '🚫 Pesan ini telah dihapus', 
              attachment_url = NULL, 
              attachment_name = NULL, 
              attachment_type = NULL 
          WHERE id = @msgId AND sender_id = @sid
        `);

      if (updateRes.rowsAffected[0] > 0) {
        // Broadcast to room that the message was deleted
        io.to(`room:${conversationId}`).emit('message_deleted', {
          messageId,
          conversationId,
          content: '🚫 Pesan ini telah dihapus'
        });
      }
    } catch (err) {
      console.error('[Chat] delete_message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Chat] User ${userId} disconnected`);
  });
});

httpServer.listen(port, () => {
  console.log(`🚀 HTTP Server running on port ${port} (ES Modules + Socket.io)`);
});

if (httpsServer) {
  httpsServer.listen(httpsPort, () => {
    console.log(`🔒 HTTPS Server running on port ${httpsPort} (ES Modules + Socket.io)`);
  });
}
