import express from 'express';
import { chat } from '../controllers/chatController.js';
import { getConversations, getConversation, saveConversation, deleteConversation } from '../controllers/conversationController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/', authenticate, chat);
router.post('/save', authenticate, saveConversation);
router.get('/history', authenticate, getConversations);
router.get('/history/:sessionId', authenticate, getConversation);
router.delete('/history/:sessionId', authenticate, deleteConversation);

export default router;
