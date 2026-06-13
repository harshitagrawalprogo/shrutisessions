'use strict';
const { query, mapBooking, mapAvailability } = require('./db');
const {
  istNow, istNowMinutes, addDays, weekdayOf,
  hmToMinutes, minutesToHm,
} = require('./time');

/** Seed default availability if the table is empty. */
async function seedAvailability() {
  const { rows } = await query('SELECT COUNT(*) AS cnt FROM availability');
  if (parseInt(rows[0].cnt) >= 7) return;

  const defaults = [
    { day: 0, enabled: false, start: '18:00', end: '21:00', slotMinutes: 45 }, // Sun
    { day: 1, enabled: true,  start: '18:00', end: '21:00', slotMinutes: 45 }, // Mon
    { day: 2, enabled: true,  start: '18:00', end: '21:00', slotMinutes: 45 }, // Tue
    { day: 3, enabled: true,  start: '18:00', end: '21:00', slotMinutes: 45 }, // Wed
    { day: 4, enabled: true,  start: '18:00', end: '21:00', slotMinutes: 45 }, // Thu
    { day: 5, enabled: true,  start: '18:00', end: '21:00', slotMinutes: 45 }, // Fri
    { day: 6, enabled: true,  start: '18:00', end: '21:00', slotMinutes: 45 }, // Sat
  ];

  for (const d of defaults) {
    await query(
      `INSERT INTO availability (day, enabled, start_time, end_time, slot_minutes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (day) DO NOTHING`,
      [d.day, d.enabled, d.start, d.end, d.slotMinutes]
    );
  }
  console.log('  Default availability seeded');
}

/** Build open slots for the next BOOKING_DAYS_AHEAD days. */
async function openSlots() {
  const daysAhead = parseInt(process.env.BOOKING_DAYS_AHEAD) || 14;
  const leadMinutes = parseInt(process.env.BOOKING_LEAD_MINUTES) || 120;

  const today = istNow();
  const dates = Array.from({ length: daysAhead }, (_, i) => addDays(today, i));
  const maxDate = dates[dates.length - 1];

  // One parallel batch — no per-day queries
  const [templatesRes, blocksRes, bookingsRes] = await Promise.all([
    query('SELECT * FROM availability ORDER BY day'),
    query('SELECT date, time FROM blocks WHERE date >= $1 AND date <= $2', [today, maxDate]),
    query(
      `SELECT date, time FROM bookings
       WHERE date >= $1 AND date <= $2 AND status = 'confirmed'`,
      [today, maxDate]
    ),
  ]);

  const templateByDay = Object.fromEntries(
    templatesRes.rows.map(r => [r.day, mapAvailability(r)])
  );

  const wholeDayBlocks = new Set(
    blocksRes.rows.filter(b => b.time == null).map(b => b.date)
  );
  const slotBlocks = new Set(
    blocksRes.rows.filter(b => b.time != null).map(b => `${b.date}|${b.time}`)
  );
  const bookedSlots = new Set(
    bookingsRes.rows.map(b => `${b.date}|${b.time}`)
  );

  const todayMinutes = istNowMinutes();
  const result = [];

  for (const date of dates) {
    const dow = weekdayOf(date);
    const tmpl = templateByDay[dow];
    if (!tmpl || !tmpl.enabled) continue;
    if (wholeDayBlocks.has(date)) continue;

    const startM = hmToMinutes(tmpl.start);
    const endM   = hmToMinutes(tmpl.end);
    const step   = tmpl.slotMinutes;

    const slots = [];
    for (let m = startM; m + step <= endM; m += step) {
      const hhmm = minutesToHm(m);
      if (date === today && m < todayMinutes + leadMinutes) continue;
      if (slotBlocks.has(`${date}|${hhmm}`)) continue;
      if (bookedSlots.has(`${date}|${hhmm}`)) continue;
      slots.push(hhmm);
    }

    if (slots.length) result.push({ date, weekday: dow, slots });
  }

  return result;
}

/**
 * Re-validates a single slot at booking time.
 * Returns slotMinutes if open, null otherwise.
 */
async function slotIsOpen(date, time) {
  const dow = weekdayOf(date);

  const [tmplRes, wholeDayRes, slotBlockRes, existingRes] = await Promise.all([
    query('SELECT * FROM availability WHERE day = $1', [dow]),
    query('SELECT id FROM blocks WHERE date = $1 AND time IS NULL', [date]),
    query('SELECT id FROM blocks WHERE date = $1 AND time = $2', [date, time]),
    query(`SELECT id FROM bookings WHERE date = $1 AND time = $2 AND status = 'confirmed'`, [date, time]),
  ]);

  const tmpl = tmplRes.rows[0] ? mapAvailability(tmplRes.rows[0]) : null;
  if (!tmpl || !tmpl.enabled) return null;
  if (wholeDayRes.rows.length > 0) return null;
  if (slotBlockRes.rows.length > 0) return null;
  if (existingRes.rows.length > 0) return null;

  const startM = hmToMinutes(tmpl.start);
  const endM   = hmToMinutes(tmpl.end);
  const slotM  = hmToMinutes(time);
  const step   = tmpl.slotMinutes;

  if ((slotM - startM) % step !== 0) return null;
  if (slotM < startM || slotM + step > endM) return null;

  const today = istNow();
  const leadMinutes = parseInt(process.env.BOOKING_LEAD_MINUTES) || 120;
  if (date === today) {
    if (slotM < istNowMinutes() + leadMinutes) return null;
  }

  return step;
}

/** Send reminder emails for sessions starting in 50–70 minutes. */
async function sendReminders() {
  const { sendReminder } = require('./mailer');

  const now = new Date();
  const from = new Date(now.getTime() + 50 * 60 * 1000);
  const to   = new Date(now.getTime() + 70 * 60 * 1000);

  const { rows } = await query(
    `SELECT * FROM bookings
     WHERE status = 'confirmed' AND reminded = false
       AND start_at >= $1 AND start_at <= $2`,
    [from, to]
  );

  for (const row of rows) {
    const booking = mapBooking(row);
    try {
      await sendReminder(booking);
      await query('UPDATE bookings SET reminded = true WHERE id = $1', [row.id]);
    } catch (err) {
      console.error(`Reminder failed for booking ${row.id}:`, err.message);
    }
  }
}

module.exports = { seedAvailability, openSlots, slotIsOpen, sendReminders };
