import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getEvents, getEventStats, getEventById, updateEvent, deleteEvent, createEvent, saveEvent, setRemindLater } from '../controllers/eventController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get events with filters
router.get('/', getEvents);

// Get event statistics
router.get('/stats', getEventStats);

// Get single event
router.get('/:id', getEventById);

// Create new event
router.post('/', createEvent);

// Save event (for user's saved events)
router.post('/:id/save', saveEvent);

// Set remind me later
router.post('/:id/remind-later', setRemindLater);

// Update event
router.put('/:id', updateEvent);

// Delete event
router.delete('/:id', deleteEvent);

export default router;
