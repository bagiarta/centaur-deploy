import express from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { initDb, poolPromise } from './config/db.js';
import { v4 as uuidv4 } from 'uuid';
import sql from 'mssql';

// Route imports
import deviceRoutes from './routes/deviceRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import sqlRoutes from './routes/sqlRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import legacyRoutes, { startBackgroundTasks } from './routes/legacyRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' }
});

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
initDb().then(() => {
  startBackgroundTasks();
});

// Register Routes
app.use('/api/devices', deviceRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/sql', sqlRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/chat', chatRoutes);

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
        }
      }
    } catch (err) {
      console.error('[Chat] send_message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Chat] User ${userId} disconnected`);
  });
});

httpServer.listen(port, () => {
  console.log(`🚀 Modular Server running on port ${port} (ES Modules + Socket.io)`);
});
