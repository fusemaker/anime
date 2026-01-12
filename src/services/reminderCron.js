import cron from 'node-cron';
import Reminder from '../models/Reminder.js';
import Event from '../models/Event.js';
import Registration from '../models/Registration.js';
import User from '../models/User.js';
import { send24HourReminderEmail, sendPastEventReminderEmail } from './emailService.js';
import logger from '../utils/logger.js';

// Run every hour to check for 24-hour "remind me later" reminders
cron.schedule('0 * * * *', async () => {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Find "remind me later" reminders that should be sent in the next hour
    const reminders = await Reminder.find({
      status: 'pending',
      reminderType: 'remind_later',
      reminderDate: {
        $gte: now,
        $lte: oneHourFromNow,
      },
    }).populate('eventId').populate('userId');
    
    for (const reminder of reminders) {
      if (!reminder.eventId || !reminder.userId) continue;
      
      // Get user's email from User model (real-time notification)
      const user = await User.findById(reminder.userId._id);
      if (user && user.email) {
        const event = reminder.eventId;
        
        // Send 24-hour reminder email using NodeMailer
        await send24HourReminderEmail(user.email, user.username, event);
        
        // Mark reminder as sent
        reminder.status = 'sent';
        reminder.sentAt = new Date();
        await reminder.save();
        
        logger.info(`✅ 24-hour reminder sent to ${user.email} for event: ${event.title}`);
      }
    }
  } catch (error) {
    logger.error('Error in 24-hour reminder cron job:', error);
  }
});

// Run daily at 9 AM to check for past events (attendance reminders)
cron.schedule('0 9 * * *', async () => {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // Find past events (yesterday or earlier) that users registered for
    const pastRegistrations = await Registration.find({
      status: 'confirmed',
    }).populate('eventId').populate('userId');
    
    for (const registration of pastRegistrations) {
      if (!registration.eventId || !registration.userId) continue;
      
      const event = registration.eventId;
      if (!event.startDate) continue;
      
      const eventDate = new Date(event.startDate);
      eventDate.setHours(0, 0, 0, 0);
      
      // Check if event was yesterday or earlier (past event)
      if (eventDate < today) {
        // Get user's email from User model (real-time notification)
        const user = await User.findById(registration.userId._id);
        if (user && user.email) {
          // Send past event reminder email using NodeMailer
          await sendPastEventReminderEmail(user.email, user.username, event);
          
          logger.info(`✅ Past event reminder sent to ${user.email} for event: ${event.title}`);
        }
      }
    }
  } catch (error) {
    logger.error('Error in past event reminder cron job:', error);
  }
});

logger.info('✅ Reminder cron jobs scheduled:');
logger.info('  - 24-hour reminders: Every hour');
logger.info('  - Past event reminders: Daily at 9 AM');
