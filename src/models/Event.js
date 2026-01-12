import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    trim: true,
  },
  startDate: {
    type: Date,
  },
  endDate: {
    type: Date,
  },
  location: {
    type: String,
    trim: true,
  },
  lat: {
    type: Number,
    // For map visualization
  },
  lng: {
    type: Number,
    // For map visualization
  },
  mode: {
    type: String,
    enum: ['online', 'offline', 'hybrid'],
    // NO default - AI will extract from web search or user input
  },
  price: {
    type: String,
    // NO default - AI will extract from web search or user input
  },
  snippet: {
    type: String,
    // For storing search result snippets
  },
  description: {
    type: String,
    // Full event description
  },
  attendeesCount: {
    type: Number,
    default: 0,
  },
  source: {
    type: String,
    enum: ['user_created', 'serpapi', 'serper', 'discovery'],
    default: 'user_created',
  },
  sourceUrl: {
    type: String,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true, // Required for user-specific events
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

// Indexes for efficient queries
eventSchema.index({ title: 1, startDate: 1, source: 1 });
eventSchema.index({ userId: 1, source: 1 }); // For user-specific queries
eventSchema.index({ lat: 1, lng: 1 }); // For geospatial queries
eventSchema.index({ startDate: 1 }); // For date-based queries
eventSchema.index({ createdAt: -1 }); // For recent events

// Update updatedAt on save
eventSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const Event = mongoose.model('Event', eventSchema);

export default Event;
