import Conversation from '../models/Conversation.js';
import logger from '../utils/logger.js';
import { safeSaveConversation } from '../utils/conversationPersistence.js';

// Get all conversations for a user
export const getConversations = async (req, res) => {
  try {
    const userId = req.userId;
    
    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .select('sessionId messages createdAt updatedAt lastIntent')
      .lean();
    
    // Format conversations for frontend
    const formattedConversations = conversations.map(conv => ({
      sessionId: conv.sessionId,
      preview: conv.messages && conv.messages.length > 0 
        ? conv.messages[conv.messages.length - 1].content.substring(0, 100)
        : 'Empty conversation',
      messageCount: conv.messages ? conv.messages.length : 0,
      lastIntent: conv.lastIntent || 'general',
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    }));
    
    res.json({
      success: true,
      conversations: formattedConversations,
    });
  } catch (error) {
    logger.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations',
    });
  }
};

// Get a specific conversation by sessionId
export const getConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;
    
    const conversation = await Conversation.findOne({ userId, sessionId });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }
    
    res.json({
      success: true,
      conversation: {
        sessionId: conversation.sessionId,
        messages: conversation.messages,
        lastIntent: conversation.lastIntent,
        context: conversation.context,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversation',
    });
  }
};

// Save/Update a conversation
export const saveConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { sessionId, messages } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
      });
    }
    
    let conversation = await Conversation.findOne({ userId, sessionId });
    
    if (conversation) {
      // Update existing conversation
      if (messages && Array.isArray(messages)) {
        conversation.messages = messages;
        conversation.markModified('messages');
      }
      conversation.updatedAt = new Date();
    } else {
      // Create new conversation
      conversation = new Conversation({
        userId,
        sessionId,
        messages: messages || [],
        context: {},
      });
    }
    
    const saveResult = await safeSaveConversation(conversation, userId, sessionId);
    
    if (!saveResult.success) {
      logger.error('[CONVERSATION] Failed to save conversation:', saveResult.error);
      return res.status(500).json({
        success: false,
        error: 'Failed to save conversation',
      });
    }
    
    res.json({
      success: true,
      message: 'Conversation saved successfully',
      conversation: {
        sessionId: conversation.sessionId,
        messageCount: conversation.messages?.length || 0,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error saving conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save conversation',
    });
  }
};

// Delete a conversation
export const deleteConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;
    
    const conversation = await Conversation.findOneAndDelete({ userId, sessionId });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }
    
    res.json({
      success: true,
      message: 'Conversation deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting conversation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete conversation',
    });
  }
};
