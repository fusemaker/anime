import Feedback from '../models/Feedback.js';
import Event from '../models/Event.js';
import logger from '../utils/logger.js';

export const createFeedback = async (userId, eventId, rating, comments = '') => {
  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    if (rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5' };
    }

    const existingFeedback = await Feedback.findOne({ userId, eventId });
    if (existingFeedback) {
      existingFeedback.rating = rating;
      existingFeedback.comments = comments;
      await existingFeedback.save();
      return { success: true, feedback: existingFeedback, message: 'Feedback updated' };
    }

    const feedback = new Feedback({
      userId,
      eventId,
      rating,
      comments: comments.trim(),
    });

    await feedback.save();
    return { success: true, feedback, message: 'Thank you for your feedback' };
  } catch (error) {
    logger.error('Error creating feedback:', error);
    return { success: false, error: 'Failed to save feedback' };
  }
};

export const getEventFeedback = async (eventId) => {
  try {
    return await Feedback.find({ eventId }).populate('userId', 'username');
  } catch (error) {
    logger.error('Error fetching feedback:', error);
    return [];
  }
};
