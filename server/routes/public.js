'use strict';
const express = require('express');
const router = express.Router();
const { query, mapBooking } = require('../db');
const { openSlots, slotIsOpen } = require('../slots');
const { isDate, isTime, isEmail, istDate, prettyDate, prettyTime } = require('../time');
const { sendClientConfirmation, sendOwnerNotification } = require('../mailer');
const { createMeetLink } = require('../meet');

// ── In-memory rate limiter (max 5 attempts / IP / hour) ───────────────────────
const bookingAttempts = new Map();

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip;
}

function rateLimitBook(req) {
  const ip = getIp(req);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  let rec = bookingAttempts.get(ip);
  if (!rec || now - rec.windowStart > windowMs) rec = { count: 0, windowStart: now };
  rec.count++;
  bookingAttempts.set(ip, rec);
  return rec.count > 5;
}

setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [ip, rec] of bookingAttempts) {
    if (rec.windowStart < cutoff) bookingAttempts.delete(ip);
  }
}, 60 * 60 * 1000);

// ── GET /api/slots ────────────────────────────────────────────────────────────
router.get('/slots', async (_req, res) => {
  try {
    const days = await openSlots();
    res.json({ days });
  } catch (err) {
    console.error('GET /api/slots error:', err);
    res.status(500).json({ error: 'Could not load slots' });
  }
});

// ── POST /api/book ────────────────────────────────────────────────────────────
router.post('/book', async (req, res) => {
  const { date, time, name, email, concern = '', website } = req.body;

  // Honeypot
  if (website) return res.status(400).json({ error: 'Invalid submission.' });

  // Rate limit
  if (rateLimitBook(req)) {
    return res.status(429).json({ error: 'Too many booking attempts. Please try again in an hour.' });
  }

  // Validate
  if (!date || !isDate(date)) return res.status(400).json({ error: 'Please select a valid date.' });
  if (!time || !isTime(time))  return res.status(400).json({ error: 'Please select a valid time.' });
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    return res.status(400).json({ error: 'Please enter your name (2–80 characters).' });
  }
  if (!email || !isEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (typeof concern === 'string' && concern.length > 600) {
    return res.status(400).json({ error: 'Your note is too long (max 600 characters).' });
  }

  // Server-side slot check
  const slotMinutes = await slotIsOpen(date, time);
  if (slotMinutes === null) {
    return res.status(409).json({ error: 'That slot was just taken or is no longer available. Please choose another time.' });
  }

  const startAt = istDate(date, time);
  const endAt   = new Date(startAt.getTime() + slotMinutes * 60 * 1000);

  // Create a unique Google Meet room for this booking
  let meetLink;
  try {
    meetLink = await createMeetLink(
      `Session — ${name.trim()} with ${process.env.OWNER_NAME || 'Shruti Agrawal'}`,
      startAt,
      endAt
    );
  } catch (err) {
    console.error('Meet link creation failed:', err.message);
    return res.status(500).json({ error: 'Could not create video meeting link. Please try again.' });
  }

  // Insert booking — catch unique violation (E23505) as 409
  let booking;
  try {
    const { rows } = await query(
      `INSERT INTO bookings (date, time, start_at, end_at, name, email, concern, meet_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [date, time, startAt, endAt, name.trim(), email.trim().toLowerCase(), concern.trim(), meetLink]
    );
    booking = mapBooking(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Someone booked that slot a moment before you. Please choose another time.' });
    }
    console.error('Booking insert error:', err);
    return res.status(500).json({ error: 'Could not create booking. Please try again.' });
  }

  // Send emails — never throw on failure
  const emailResults = await Promise.allSettled([
    sendClientConfirmation(booking),
    sendOwnerNotification(booking),
  ]);

  const emailSent = emailResults.every(r => r.status === 'fulfilled');
  emailResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Email ${i === 0 ? 'client' : 'owner'} failed for booking ${booking._id}:`, r.reason?.message);
    }
  });

  return res.json({
    ok: true,
    booking: {
      date: booking.date,
      time: booking.time,
      prettyDate: prettyDate(booking.date),
      prettyTime: prettyTime(booking.time),
      meetLink: booking.meetLink,
      emailSent,
    },
  });
});

module.exports = router;
