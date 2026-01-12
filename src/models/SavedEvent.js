import mongoose from 'mongoose';

const savedEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  savedAt: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
    trim: true,
    // User can add personal notes about saved event
  },
});

// Prevent duplicate saves
savedEventSchema.index({ userId: 1, eventId: 1 }, { unique: true });
savedEventSchema.index({ userId: 1, savedAt: -1 }); // For user's saved events list

const SavedEvent = mongoose.model('SavedEvent', savedEventSchema);

export default SavedEvent;
