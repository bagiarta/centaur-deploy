import sql from 'mssql';
import { poolPromise } from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Upload Storage Config ────────────────────────────────────────────
const CHAT_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'chat');
if (!fs.existsSync(CHAT_UPLOAD_DIR)) {
  fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
}

const chatStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CHAT_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `chat-${Date.now()}-${uuidv4()}${ext}`);
  }
});

const ALLOWED_EXTENSIONS = new Set([
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz',
  // Executables & reports
  '.exe', '.msi', '.rpt',
  // Others
  '.xml', '.json', '.log', '.sql'
]);

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type "${ext}" is not allowed`));
    }
  }
});

// POST /api/chat/upload
export const uploadChatFile = [
  chatUpload.single('file'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/chat/${req.file.filename}`;
    res.json({
      url,
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size
    });
  }
];

// GET /api/chat/users  — list all users to start a chat with
export const getUsers = async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT id, username, full_name FROM Users ORDER BY full_name');
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/chat/conversations  — list conversations for current user
export const getConversations = async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('uid', sql.NVarChar, userId)
      .query(`
        SELECT
          c.id,
          c.type,
          c.name,
          c.created_at,
          -- Last message preview (show "(attachment)" if content is empty)
          ISNULL((SELECT TOP 1 CASE WHEN content IS NULL OR content = '' THEN '📎 ' + ISNULL(attachment_name, 'Attachment') ELSE content END FROM ChatMessages WHERE conversation_id = c.id ORDER BY created_at DESC), NULL) AS last_message,
          (SELECT TOP 1 created_at FROM ChatMessages WHERE conversation_id = c.id ORDER BY created_at DESC) AS last_message_at,
          -- Unread count for this user
          (SELECT COUNT(*) FROM ChatMessages WHERE conversation_id = c.id AND is_read = 0 AND sender_id != @uid) AS unread_count,
          -- Participants info (excluding self)
          (
            SELECT STRING_AGG(u.full_name, ', ')
            FROM ChatParticipants cp
            JOIN Users u ON u.id = cp.user_id
            WHERE cp.conversation_id = c.id AND cp.user_id != @uid
          ) AS participants_name,
          (
            SELECT STRING_AGG(cp.user_id, ',')
            FROM ChatParticipants cp
            WHERE cp.conversation_id = c.id AND cp.user_id != @uid
          ) AS participants_ids
        FROM ChatConversations c
        INNER JOIN ChatParticipants p ON p.conversation_id = c.id
        WHERE p.user_id = @uid
        ORDER BY last_message_at DESC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/chat/conversations/:conversationId/messages
export const getMessages = async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  const { conversationId } = req.params;

  try {
    const pool = await poolPromise;

    // Mark messages as read
    await pool.request()
      .input('cid', sql.NVarChar, conversationId)
      .input('uid', sql.NVarChar, userId)
      .query(`UPDATE ChatMessages SET is_read = 1 WHERE conversation_id = @cid AND sender_id != @uid`);

    // Fetch messages — include attachment columns
    const result = await pool.request()
      .input('cid', sql.NVarChar, conversationId)
      .query(`
        SELECT m.id, m.sender_id, u.username, u.full_name, m.content, m.is_read, m.created_at,
               m.attachment_url, m.attachment_name, m.attachment_type
        FROM ChatMessages m
        JOIN Users u ON u.id = m.sender_id
        WHERE m.conversation_id = @cid
        ORDER BY m.created_at ASC
      `);

    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/chat/conversations  — find existing or create new DM/Group
export const createOrFindConversation = async (req, res) => {
  const senderId = req.headers['x-user-id'];
  const { targetUserIds, groupName } = req.body; // targetUserIds: array of user IDs
  if (!senderId || !targetUserIds || !targetUserIds.length) {
    return res.status(400).json({ error: 'Missing sender or target users' });
  }

  try {
    const pool = await poolPromise;
    const allParticipants = [...new Set([senderId, ...targetUserIds])];
    const isDirect = allParticipants.length === 2;

    // For DM: check if conversation already exists between exactly these 2 users
    if (isDirect) {
      const existing = await pool.request()
        .input('uid1', sql.NVarChar, allParticipants[0])
        .input('uid2', sql.NVarChar, allParticipants[1])
        .query(`
          SELECT c.id FROM ChatConversations c
          WHERE c.type = 'direct'
          AND (SELECT COUNT(*) FROM ChatParticipants WHERE conversation_id = c.id) = 2
          AND EXISTS (SELECT 1 FROM ChatParticipants WHERE conversation_id = c.id AND user_id = @uid1)
          AND EXISTS (SELECT 1 FROM ChatParticipants WHERE conversation_id = c.id AND user_id = @uid2)
        `);
      if (existing.recordset.length > 0) {
        return res.json({ id: existing.recordset[0].id, existing: true });
      }
    }

    // Create new conversation
    const convoId = uuidv4();
    await pool.request()
      .input('id', sql.NVarChar, convoId)
      .input('type', sql.NVarChar, isDirect ? 'direct' : 'group')
      .input('name', sql.NVarChar, groupName || null)
      .query(`INSERT INTO ChatConversations (id, type, name) VALUES (@id, @type, @name)`);

    for (const uid of allParticipants) {
      await pool.request()
        .input('cid', sql.NVarChar, convoId)
        .input('uid', sql.NVarChar, uid)
        .query(`INSERT INTO ChatParticipants (conversation_id, user_id) VALUES (@cid, @uid)`);
    }

    res.json({ id: convoId, existing: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/chat/unread  — total unread count for badge
export const getUnreadCount = async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  if (!userId) return res.json({ count: 0 });

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('uid', sql.NVarChar, userId)
      .query(`
        SELECT COUNT(*) as count FROM ChatMessages m
        JOIN ChatParticipants p ON p.conversation_id = m.conversation_id
        WHERE p.user_id = @uid AND m.sender_id != @uid AND m.is_read = 0
      `);
    res.json({ count: result.recordset[0].count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
