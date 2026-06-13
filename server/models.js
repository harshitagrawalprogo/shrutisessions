'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── Availability ──────────────────────────────────────────────────────────────
const availabilitySchema = new Schema({
  day: { type: Number, min: 0, max: 6, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  start: { type: String, required: true },   // "HH:MM"
  end: { type: String, required: true },     // "HH:MM"
  slotMinutes: { type: Number, required: true },
});

// ── Block ─────────────────────────────────────────────────────────────────────
const blockSchema = new Schema({
  date: { type: String, required: true },    // "YYYY-MM-DD"
  time: { type: String, default: null },     // "HH:MM" or null (whole day)
});
blockSchema.index({ date: 1, time: 1 }, { unique: true });

// ── Booking ───────────────────────────────────────────────────────────────────
const bookingSchema = new Schema({
  date: { type: String, required: true },    // "YYYY-MM-DD"
  time: { type: String, required: true },    // "HH:MM"
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
  concern: { type: String, default: '', maxlength: 600 },
  status: { type: String, enum: ['confirmed', 'cancelled'], default: 'confirmed' },
  meetLink: { type: String, required: true },
  reminded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Double-booking guarantee: unique confirmed (date, time)
bookingSchema.index(
  { date: 1, time: 1 },
  { unique: true, partialFilterExpression: { status: 'confirmed' } }
);

// Cron index for reminders
bookingSchema.index({ startAt: 1, status: 1, reminded: 1 });

module.exports = {
  Availability: mongoose.model('Availability', availabilitySchema),
  Block: mongoose.model('Block', blockSchema),
  Booking: mongoose.model('Booking', bookingSchema),
};
