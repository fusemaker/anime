import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
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
  reminderDate: {
    type: Date,
    required: true,
  },
  reminderType: {
    type: String,
    enum: ['before_event', 'day_of', 'custom', 'remind_later'],
    default: 'before_event',
  },
  message: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'cancelled'],
    default: 'pending',
  },
  sentAt: {
    type: Date,
    // When reminder was actually sent
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update updatedAt on save
reminderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

reminderSchema.index({ userId: 1, eventId: 1 });
reminderSchema.index({ reminderDate: 1, status: 1 });

const Reminder = mongoose.model('Reminder', reminderSchema);

export default Reminder;
