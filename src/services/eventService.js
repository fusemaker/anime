import Event from '../models/Event.js';
import Registration from '../models/Registration.js';
import User from '../models/User.js';
import { addSubscriber } from './mailchimpService.js';
import { sendRegistrationEmail } from './emailService.js';
import logger from '../utils/logger.js';

export const getEventById = async (eventId) => {
  try {
    return await Event.findById(eventId);
  } catch (error) {
    logger.error('Error fetching event:', error);
    return null;
  }
};

export const createRegistration = async (userId, eventId, name, email) => {
  try {
    const existingRegistration = await Registration.findOne({
      userId,
      eventId,
    });

    if (existingRegistration) {
      return { success: false, error: 'You are already registered for this event' };
    }

    const registration = new Registration({
      userId,
      eventId,
      name,
      email,
      status: 'confirmed',
    });

    await registration.save();
    
    // Get event and user for email notification
    const event = await Event.findById(eventId);
    const user = await User.findById(userId);
    
    // Send real-time email notification
    if (user && user.email && event) {
      sendRegistrationEmail(user.email, user.username || name, event)
        .then(result => {
          if (result && result.success) {
            logger.info(`✅ Registration email sent successfully to ${user.email}`);
          } else {
            logger.error(`❌ Failed to send registration email to ${user.email}:`, result?.error || 'Unknown error');
          }
        })
        .catch(err => {
          logger.error('❌ Error sending registration email:', err);
        });
    }
    
    // Add to Mailchimp for event updates and reminders
    if (email) {
      try {
        if (event) {
          await addSubscriber(
            email,
            name?.split(' ')[0] || '',
            name?.split(' ').slice(1).join(' ') || '',
            {
              EVENT: event.title,
              EDATE: event.startDate ? event.startDate.toISOString().split('T')[0] : '',
              ELOC: event.location || '',
            }
          );
          logger.info('User added to Mailchimp on registration:', email);
        }
      } catch (error) {
        logger.warn('Mailchimp subscription failed on registration:', error);
      }
    }
    
    return { success: true, registration };
  } catch (error) {
    logger.error('Error creating registration:', error);
    if (error.code === 11000) {
      return { success: false, error: 'You are already registered for this event' };
    }
    return { success: false, error: 'Registration failed' };
  }
};

export const getUserRegistrations = async (userId) => {
  try {
    return await Registration.find({ userId }).populate('eventId');
  } catch (error) {
    logger.error('Error fetching registrations:', error);
    return [];
  }
};

export const createEvent = async (eventData) => {
  try {
    const event = new Event(eventData);
    await event.save();
    logger.info('Event created:', event._id);
    return { success: true, event };
  } catch (error) {
    logger.error('Error creating event:', error);
    return { success: false, error: 'Failed to create event' };
  }
};
