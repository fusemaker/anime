import Conversation from '../models/Conversation.js';
import logger from './logger.js';

/**
 * Safely save conversation with error handling and retry logic
 * @param {Object} conversation - Mongoose conversation document
 * @param {Object} options - { retries: number, silent: boolean }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const safeSaveConversation = async (conversation, options = {}) => {
  const { retries = 2, silent = false } = options;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await conversation.save();
      if (attempt > 0) {
        logger.info(`[CONVERSATION] Save succeeded on retry ${attempt} for sessionId: ${conversation.sessionId}`);
      }
      return { success: true };
    } catch (error) {
      lastError = error;
      const isRetryable = error.name === 'MongoNetworkError' || 
                         error.name === 'MongoTimeoutError' ||
                         error.code === 11000; // Duplicate key (retry won't help, but log it)

      if (!silent) {
        logger.error(`[CONVERSATION] Save failed (attempt ${attempt + 1}/${retries + 1}) for sessionId: ${conversation.sessionId}`, {
          error: error.message,
          errorName: error.name,
          errorCode: error.code,
          isRetryable
        });
      }

      // Don't retry on duplicate key errors
      if (error.code === 11000) {
        logger.warn(`[CONVERSATION] Duplicate sessionId detected: ${conversation.sessionId}`);
        return { success: false, error: 'Duplicate sessionId' };
      }

      // Only retry on network/timeout errors
      if (attempt < retries && isRetryable) {
        const delay = Math.min(100 * Math.pow(2, attempt), 1000); // Exponential backoff, max 1s
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-retryable error or out of retries
      break;
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error during conversation save'
  };
};
