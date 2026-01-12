import Reminder from '../models/Reminder.js';
import Event from '../models/Event.js';
import Registration from '../models/Registration.js';
import { addSubscriber, sendReminderEmail } from './mailchimpService.js';
import logger from '../utils/logger.js';

export const createReminder = async (userId, eventId, reminderDate, reminderType = 'before_event', message = null) => {
  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return { success: false, error: 'Event not found' };
    }

    const existingReminder = await Reminder.findOne({
      userId,
      eventId,
      status: 'pending',
    });

    if (existingReminder) {
      return { success: false, error: 'You already have a reminder set for this event' };
    }

    const reminder = new Reminder({
      userId,
      eventId,
      reminderDate: reminderDate || event.startDate,
      reminderType,
      message: message || `Reminder: ${event.title} is coming up`,
      status: 'pending',
    });

    await reminder.save();
    
    // Add user to Mailchimp for reminders if they have email
    const registration = await Registration.findOne({ userId, eventId });
    if (registration && registration.email) {
      try {
        await addSubscriber(
          registration.email,
          registration.name?.split(' ')[0] || '',
          registration.name?.split(' ').slice(1).join(' ') || '',
          {
            EVENT: event.title,
            EDATE: event.startDate.toISOString().split('T')[0],
          }
        );
        logger.info('User added to Mailchimp for reminders:', registration.email);
      } catch (error) {
        logger.warn('Mailchimp subscription failed:', error);
      }
    }
    
    return { success: true, reminder };
  } catch (error) {
    logger.error('Error creating reminder:', error);
    return { success: false, error: 'Failed to create reminder' };
  }
};

export const getUserReminders = async (userId) => {
  try {
    return await Reminder.find({ userId, status: 'pending' })
      .populate('eventId')
      .sort({ reminderDate: 1 });
  } catch (error) {
    logger.error('Error fetching reminders:', error);
    return [];
  }
};
