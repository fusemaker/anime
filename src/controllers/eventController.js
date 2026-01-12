
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Registration from '../models/Registration.js';
import Reminder from '../models/Reminder.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { searchEvents } from '../services/serperService.js'; // Import Serper service
import { sendEventSavedEmail, sendRemindLaterEmail } from '../services/emailService.js';

export const getEvents = async (req, res) => {
  try {
    const {
      filter = 'all', // all, upcoming, past, drafts, discovery
      type, // category filter
      location,
      search,
      sort = 'date', // date, priority, attendees, recent
      limit = 50,
      skip = 0
    } = req.query;

    const userId = req.userId;
    let query = {};
    
    // Get user's registrations FIRST (needed for multiple filters)
    const userRegistrations = await Registration.find({ userId }).select('eventId');
    const registeredEventIds = userRegistrations.map(r => r.eventId.toString());

    // REAL-TIME DISCOVERY MODE - Show only events THIS USER discovered
    if (filter === 'discovery') {
      // Show only events discovered by this user (saved to DB with userId)
      query.$or = [
        { userId: userId, source: { $in: ['serpapi', 'serper'] } }, // Events discovered by this user
        { discoveredBy: userId } // Alternative: if we use discoveredBy field
      ];
      
      // If search query provided, also filter by search
      if (search) {
        query.title = new RegExp(search, 'i');
      }
      
      // If location provided, filter by location
      if (location) {
        query.location = new RegExp(location, 'i');
      }
      
      // Get user's discovered events from database
      let events = await Event.find(query)
        .sort(getSortOption(sort))
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean();

      // Enrich events with user-specific data
      events = events.map(event => {
        const eventObj = event;
        eventObj.isRegistered = registeredEventIds.includes(event._id.toString());
        return eventObj;
      });

      return res.json({
        success: true,
        events,
        total: events.length
      });
    }

    // Filter by date
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison

    const userReminders = await Reminder.find({ userId }).select('eventId');
    const remindedEventIds = userReminders.map(r => r.eventId.toString());

    // Handle PAST filter FIRST - only attended events (registered + date passed)
    if (filter === 'past') {
      // Show only events THIS USER ATTENDED (registered + date passed)
      if (registeredEventIds.length === 0) {
        return res.json({
          success: true,
          events: [],
          total: 0,
        });
      }
      // Build query for past attended events only
      // CRITICAL: Only show events user registered for AND that have passed
      query = {
        _id: { $in: registeredEventIds.map(id => new mongoose.Types.ObjectId(id)) }, // Only registered events
        startDate: { $exists: true, $lt: now } // Only past events with valid date (attended)
      };
      
      // Apply additional filters if provided
      if (type) {
        query.category = new RegExp(type, 'i');
      }
      if (location) {
        query.location = new RegExp(location, 'i');
      }
      if (search) {
        query.title = new RegExp(search, 'i');
      }
      
      logger.info(`[PAST FILTER] Query: ${JSON.stringify(query)}`);
      logger.info(`[PAST FILTER] Registered event IDs: ${registeredEventIds.length}`);
    } else if (filter === 'upcoming') {
      // Build query for user's events only
      const userEventConditions = [
        { userId: userId }, // User created events
        { _id: { $in: registeredEventIds.map(id => new mongoose.Types.ObjectId(id)) } }, // User registered events
        { userId: userId, source: { $in: ['serpapi', 'serper'] } }, // User discovered events
      ];
      
      // Show only THIS USER's upcoming events (registered + created + discovered that are upcoming)
      query = {
        $and: [
          { $or: userEventConditions },
          { startDate: { $gte: now } } // Only upcoming events
        ]
      };
      
      // Apply additional filters if provided
      if (type) {
        query.$and.push({ category: new RegExp(type, 'i') });
      }
      if (location) {
        query.$and.push({ location: new RegExp(location, 'i') });
      }
      if (search) {
        query.$and.push({ title: new RegExp(search, 'i') });
      }
    } else if (filter === 'registered') {
      // Show only THIS USER's registered events
      if (registeredEventIds.length === 0) {
        return res.json({
          success: true,
          events: [],
          total: 0,
        });
      }
      query = {
        _id: { $in: registeredEventIds.map(id => new mongoose.Types.ObjectId(id)) }
      };
      
      // Apply additional filters if provided
      if (type) {
        query.category = new RegExp(type, 'i');
      }
      if (location) {
        query.location = new RegExp(location, 'i');
      }
      if (search) {
        query.title = new RegExp(search, 'i');
      }
    } else if (filter === 'created' || filter === 'my_events') {
      // Show user-created events AND user-saved discovered events
      // Saved events are discovered events (serpapi/serper) that user saved with their userId
      const baseConditions = [
        { source: 'user_created', userId: userId }, // User-created events
        { userId: userId, source: { $in: ['serpapi', 'serper'] } } // User-saved discovered events
      ];
      
      // Build query with additional filters
      const additionalFilters = {};
      if (type) {
        additionalFilters.category = new RegExp(type, 'i');
      }
      if (location) {
        additionalFilters.location = new RegExp(location, 'i');
      }
      if (search) {
        additionalFilters.title = new RegExp(search, 'i');
      }
      
      // Combine base conditions with additional filters
      if (Object.keys(additionalFilters).length > 0) {
        query = {
          $and: [
            { $or: baseConditions },
            ...Object.entries(additionalFilters).map(([key, value]) => ({ [key]: value }))
          ]
        };
      } else {
        query = { $or: baseConditions };
      }
    } else if (filter === 'remind_later' || filter === 'remind-me-later') {
      // Show ONLY events where user explicitly clicked "Remind Me Later" button
      // This means events with reminderType: 'remind_later' (not other reminder types)
      const remindLaterReminders = await Reminder.find({
        userId,
        reminderType: 'remind_later' // Only "remind me later" reminders, not regular reminders
      }).select('eventId');
      
      const remindLaterEventIds = remindLaterReminders.map(r => r.eventId.toString());
      
      if (remindLaterEventIds.length === 0) {
        return res.json({
          success: true,
          events: [],
          total: 0,
        });
      }
      
      query = {
        _id: { $in: remindLaterEventIds.map(id => new mongoose.Types.ObjectId(id)) }
      };
      
      // Apply additional filters if provided
      if (type) {
        query.category = new RegExp(type, 'i');
      }
      if (location) {
        query.location = new RegExp(location, 'i');
      }
      if (search) {
        query.title = new RegExp(search, 'i');
      }
    } else {
      // Default: show user's events (registered + created + discovered)
      const userEventConditions = [
        { userId: userId }, // User created events
        { _id: { $in: registeredEventIds.map(id => new mongoose.Types.ObjectId(id)) } }, // User registered events
        { userId: userId, source: { $in: ['serpapi', 'serper'] } }, // User discovered events
      ];
      
      query = { $or: userEventConditions };
      
      // Apply additional filters if provided
      if (type) {
        query.category = new RegExp(type, 'i');
      }
      if (location) {
        query.location = new RegExp(location, 'i');
      }
      if (search) {
        query.title = new RegExp(search, 'i');
      }
    }

    // Log query for debugging
    if (filter === 'past') {
      logger.info(`[PAST FILTER] Executing query for past attended events`);
    }
    
    let events = await Event.find(query)
      .sort(getSortOption(sort))
      .limit(parseInt(limit) * 2) // Get more to filter duplicates
      .skip(parseInt(skip))
      .lean();
    
    // For past filter, ensure we only return events that are actually in the past
    if (filter === 'past') {
      events = events.filter(event => {
        if (!event.startDate) return false; // Skip events without date
        const eventDate = new Date(event.startDate);
        return eventDate < now;
      });
      logger.info(`[PAST FILTER] Found ${events.length} past attended events after date filtering`);
    }

    // Remove duplicates before enriching
    const uniqueEvents = [];
    const seenTitles = new Set();
    const seenUrls = new Set();

    for (const event of events) {
      const titleKey = event.title ? event.title.toLowerCase().trim() : '';
      const urlKey = event.sourceUrl ? event.sourceUrl.toLowerCase().trim() : null;

      // Skip if we've seen this exact title or URL before
      if (seenTitles.has(titleKey) || (urlKey && seenUrls.has(urlKey))) {
        continue;
      }

      // Check for very similar titles (exact match after normalization)
      let isDuplicate = false;
      for (const seenTitle of seenTitles) {
        // Normalize both titles (remove extra spaces, special chars)
        const normalizedTitle = titleKey.replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
        const normalizedSeen = seenTitle.replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
        if (normalizedTitle === normalizedSeen) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        seenTitles.add(titleKey);
        if (urlKey) seenUrls.add(urlKey);
        uniqueEvents.push(event);
      }
    }

    // Limit to requested amount after deduplication
    events = uniqueEvents.slice(0, parseInt(limit));

    // Enrich events with user-specific data
    events = events.map(event => {
      const eventObj = event;
      eventObj.isRegistered = registeredEventIds.includes(event._id.toString());
      eventObj.hasReminder = remindedEventIds.includes(event._id.toString());
      eventObj.attendeesCount = 0; // Will be calculated
      return eventObj;
    });

    // Get attendees count for each event
    for (const event of events) {
      const count = await Registration.countDocuments({ eventId: event._id });
      event.attendeesCount = count;
    }

    // Sort by attendees if requested (after getting counts)
    if (sort === 'attendees') {
      events.sort((a, b) => (b.attendeesCount || 0) - (a.attendeesCount || 0));
    }

    res.json({
      success: true,
      events,
      total: events.length,
    });
  } catch (error) {
    logger.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
};

export const getEventStats = async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();

    const upcomingCount = await Event.countDocuments({ startDate: { $gte: now } });
    const pastCount = await Event.countDocuments({ startDate: { $lt: now } });

    const userRegistrations = await Registration.find({ userId });
    const todayRegistrations = userRegistrations.filter(r => {
      const regDate = new Date(r.createdAt);
      return regDate.toDateString() === now.toDateString();
    });

    const pendingTasks = await Reminder.countDocuments({
      userId,
      reminderDate: { $gte: now }
    });

    res.json({
      success: true,
      stats: {
        upcomingEvents: upcomingCount,
        pastEvents: pastCount,
        rsvpsToday: todayRegistrations.length,
        pendingTasks,
        totalRegistrations: userRegistrations.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
};

export const getEventById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const event = await Event.findById(id).lean();
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Get registration status
    const registration = await Registration.findOne({ userId, eventId: id });
    const reminder = await Reminder.findOne({ userId, eventId: id });
    const attendeesCount = await Registration.countDocuments({ eventId: id });

    res.json({
      success: true,
      event: {
        ...event,
        isRegistered: !!registration,
        hasReminder: !!reminder,
        attendeesCount,
      },
    });
  } catch (error) {
    logger.error('Error fetching event:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch event' });
  }
};

export const createEvent = async (req, res) => {
  try {
    const eventData = req.body;
    const event = new Event(eventData);
    await event.save();

    res.status(201).json({
      success: true,
      event,
    });
  } catch (error) {
    logger.error('Error creating event:', error);
    res.status(500).json({ success: false, error: 'Failed to create event' });
  }
};

export const updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const event = await Event.findByIdAndUpdate(id, updateData, { new: true });
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    res.json({
      success: true,
      event,
    });
  } catch (error) {
    logger.error('Error updating event:', error);
    res.status(500).json({ success: false, error: 'Failed to update event' });
  }
};

export const deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findByIdAndDelete(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Also delete related registrations, reminders
    await Registration.deleteMany({ eventId: id });
    await Reminder.deleteMany({ eventId: id });

    res.json({
      success: true,
      message: 'Event deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting event:', error);
    res.status(500).json({ success: false, error: 'Failed to delete event' });
  }
};

// Save event for user (adds to saved events)
export const saveEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // If event doesn't have userId, update it to mark as saved by this user
    // If it's a discovered event, ensure userId is set
    if (!event.userId || event.userId.toString() !== userId.toString()) {
      // Check if this is a discovered event (serpapi/serper source)
      if (event.source === 'serpapi' || event.source === 'serper') {
        // Create a copy for this user or update existing
        const existingUserEvent = await Event.findOne({
          title: event.title,
          userId: userId,
          source: { $in: ['serpapi', 'serper'] }
        });

        if (!existingUserEvent) {
          // Create new event entry for this user
          const savedEvent = new Event({
            ...event.toObject(),
            _id: undefined, // Let MongoDB create new ID
            userId: userId,
          });
          await savedEvent.save();
          
          // Send email notification in background
          const user = await User.findById(userId);
          if (user && user.email) {
            sendEventSavedEmail(user.email, user.username, savedEvent)
              .then(result => {
                if (result && result.success) {
                  logger.info(`✅ Event saved email sent successfully to ${user.email}`);
                } else {
                  logger.error(`❌ Failed to send saved event email to ${user.email}:`, result?.error || 'Unknown error');
                }
              })
              .catch(err => {
                logger.error('❌ Error sending saved event email:', err);
              });
          }
          
          return res.json({
            success: true,
            message: 'Event saved successfully',
            event: savedEvent
          });
        } else {
          return res.json({
            success: true,
            message: 'Event already saved',
            event: existingUserEvent
          });
        }
      } else {
        // For user-created events, just ensure userId matches
        event.userId = userId;
        await event.save();
      }
    }

    // Send email notification in background
    const user = await User.findById(userId);
    if (user && user.email) {
      sendEventSavedEmail(user.email, user.username, event)
        .then(result => {
          if (result && result.success) {
            logger.info(`✅ Event saved email sent successfully to ${user.email}`);
          } else {
            logger.error(`❌ Failed to send saved event email to ${user.email}:`, result?.error || 'Unknown error');
          }
        })
        .catch(err => {
          logger.error('❌ Error sending saved event email:', err);
        });
    }

    res.json({
      success: true,
      message: 'Event saved successfully',
      event
    });
  } catch (error) {
    logger.error('Error saving event:', error);
    res.status(500).json({ success: false, error: 'Failed to save event' });
  }
};

// Set remind me later for an event
export const setRemindLater = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Check if reminder already exists
    const existingReminder = await Reminder.findOne({
      userId,
      eventId: id,
      reminderType: 'remind_later'
    });

    if (existingReminder) {
      return res.json({
        success: true,
        message: 'Reminder already set',
        reminder: existingReminder
      });
    }

    // Set reminder for 24 hours from now (remind me later)
    const remindLaterDate = new Date();
    remindLaterDate.setHours(remindLaterDate.getHours() + 24);

    const reminder = new Reminder({
      userId,
      eventId: id,
      reminderDate: remindLaterDate,
      reminderType: 'remind_later',
      message: `Remind me about ${event.title}`,
      status: 'pending'
    });

    await reminder.save();

    // Send email notification in background
    const user = await User.findById(userId);
    if (user && user.email) {
      sendRemindLaterEmail(user.email, user.username, event)
        .then(result => {
          if (result && result.success) {
            logger.info(`✅ Remind later email sent successfully to ${user.email}`);
          } else {
            logger.error(`❌ Failed to send remind later email to ${user.email}:`, result?.error || 'Unknown error');
          }
        })
        .catch(err => {
          logger.error('❌ Error sending remind later email:', err);
        });
    }

    res.json({
      success: true,
      message: 'Reminder set successfully',
      reminder
    });
  } catch (error) {
    logger.error('Error setting remind later:', error);
    res.status(500).json({ success: false, error: 'Failed to set reminder' });
  }
};

function getSortOption(sort) {
  switch (sort) {
    case 'date':
      return { startDate: 1 };
    case 'date-desc':
      return { startDate: -1 };
    case 'priority':
      return { createdAt: -1 };
    case 'recent':
      return { updatedAt: -1 };
    case 'title':
      return { title: 1 };
    default:
      return { startDate: 1 };
  }
}
