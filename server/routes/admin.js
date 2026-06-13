'use strict';
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, mapBooking, mapAvailability } = require('../db');
const { isDate, isTime, istNow } = require('../time');
const { sendCancellation } = require('../mailer');

// ── Rate limiter for login (10 attempts / IP / 15 min) ────────────────────────
const loginAttempts = new Map();

function getIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip;
}

function rateLimitLogin(req) {
  const ip = getIp(req);
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  let rec = loginAttempts.get(ip);
  if (!rec || now - rec.windowStart > windowMs) rec = { count: 0, windowStart: now };
  rec.count++;
  loginAttempts.set(ip, rec);
  return rec.count > 10;
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

// ── POST /api/admin/login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  if (rateLimitLogin(req)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  }
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required.' });

  const provided = crypto.createHash('sha256').update(String(password)).digest();
  const expected = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();

  if (!crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

router.use(requireAuth);

// ── GET /api/admin/availability ───────────────────────────────────────────────
router.get('/availability', async (_req, res) => {
  const { rows } = await query('SELECT * FROM availability ORDER BY day');
  res.json({ availability: rows.map(mapAvailability) });
});

// ── PUT /api/admin/availability ───────────────────────────────────────────────
router.put('/availability', async (req, res) => {
  const { availability } = req.body;
  if (!Array.isArray(availability) || availability.length !== 7) {
    return res.status(400).json({ error: 'Must provide exactly 7 days.' });
  }

  const VALID_SLOT_MINS = [30, 45, 60, 90];
  const errors = [];

  for (const d of availability) {
    const { day, start, end, slotMinutes } = d;
    if (typeof day !== 'number' || day < 0 || day > 6) { errors.push(`Invalid day: ${day}`); continue; }
    if (!isTime(start)) errors.push(`Day ${day}: invalid start time`);
    if (!isTime(end))   errors.push(`Day ${day}: invalid end time`);
    if (start && end && start >= end) errors.push(`Day ${day}: end must be after start`);
    if (!VALID_SLOT_MINS.includes(slotMinutes)) errors.push(`Day ${day}: slotMinutes must be 30, 45, 60, or 90`);
  }

  if (errors.length) return res.status(400).json({ errors });

  for (const d of availability) {
    await query(
      `INSERT INTO availability (day, enabled, start_time, end_time, slot_minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (day) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         slot_minutes = EXCLUDED.slot_minutes`,
      [d.day, !!d.enabled, d.start, d.end, d.slotMinutes]
    );
  }

  res.json({ ok: true });
});

// ── GET /api/admin/blocks ─────────────────────────────────────────────────────
router.get('/blocks', async (_req, res) => {
  const today = istNow();
  const { rows } = await query(
    'SELECT * FROM blocks WHERE date >= $1 ORDER BY date ASC, time ASC NULLS FIRST',
    [today]
  );
  res.json({ blocks: rows });
});

// ── POST /api/admin/blocks ────────────────────────────────────────────────────
router.post('/blocks', async (req, res) => {
  const { date, time = null } = req.body;
  if (!date || !isDate(date)) return res.status(400).json({ error: 'Invalid date.' });
  if (time !== null && time !== '' && !isTime(time)) return res.status(400).json({ error: 'Invalid time.' });

  const normalizedTime = (time === '' || time == null) ? null : time;

  try {
    const { rows } = await query(
      'INSERT INTO blocks (date, time) VALUES ($1, $2) RETURNING *',
      [date, normalizedTime]
    );
    res.json({ ok: true, block: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That block already exists.' });
    console.error('Block insert error:', err);
    res.status(500).json({ error: 'Could not create block.' });
  }
});

// ── DELETE /api/admin/blocks/:id ──────────────────────────────────────────────
router.delete('/blocks/:id', async (req, res) => {
  const { rowCount } = await query('DELETE FROM blocks WHERE id = $1', [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: 'Block not found.' });
  res.json({ ok: true });
});

// ── GET /api/admin/bookings ───────────────────────────────────────────────────
router.get('/bookings', async (req, res) => {
  const today = istNow();
  const all = req.query.all === '1';

  const { rows } = all
    ? await query('SELECT * FROM bookings ORDER BY start_at ASC LIMIT 300')
    : await query(
        `SELECT * FROM bookings WHERE status = 'confirmed' AND date >= $1 ORDER BY start_at ASC LIMIT 300`,
        [today]
      );

  res.json({ bookings: rows.map(mapBooking) });
});

// ── POST /api/admin/bookings/:id/cancel ───────────────────────────────────────
router.post('/bookings/:id/cancel', async (req, res) => {
  const { rows } = await query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Booking not found.' });

  const booking = mapBooking(rows[0]);
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });

  await query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [req.params.id]);

  const note = req.body.note || '';
  let emailSent = false;
  try {
    await sendCancellation(booking, note);
    emailSent = true;
  } catch (err) {
    console.error(`Cancellation email failed for booking ${booking._id}:`, err.message);
  }

  res.json({ ok: true, emailSent });
});

module.exports = router;
