import express from 'express';
import { getUsers, getConversations, getMessages, createOrFindConversation, getUnreadCount, uploadChatFile } from '../controllers/chatController.js';

const router = express.Router();

router.get('/users', getUsers);
router.get('/conversations', getConversations);
router.get('/conversations/:conversationId/messages', getMessages);
router.post('/conversations', createOrFindConversation);
router.get('/unread', getUnreadCount);
router.post('/upload', uploadChatFile); // File attachment upload

export default router;
