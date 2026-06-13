'use strict';

// All IST helpers. Pure functions — no side effects, no DB calls.
// IST = UTC+05:30 (no DST ever).

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Current IST wall-clock fields via Intl. Returns { year, month, day, hour, minute }. */
function istFields() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());

  const get = t => parts.find(p => p.type === t).value;
  let hour = get('hour');
  // ICU quirk: midnight can appear as "24" → normalise to "00"
  if (hour === '24') hour = '00';

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')),
    day: parseInt(get('day')),
    hour: parseInt(hour),
    minute: parseInt(get('minute')),
  };
}

/** Current IST date string "YYYY-MM-DD". */
function istNow() {
  const f = istFields();
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
}

/** Current IST time as total minutes from midnight. */
function istNowMinutes() {
  const f = istFields();
  return f.hour * 60 + f.minute;
}

/** Add `n` days to a "YYYY-MM-DD" string. Pure UTC calendar math. */
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 0=Sun 1=Mon … 6=Sat for a "YYYY-MM-DD" string (UTC calendar). */
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Parse "HH:MM" → total minutes from midnight. */
function hmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes → "HH:MM" */
function minutesToHm(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Convert an IST (date, "HH:MM") pair to a UTC Date.
 * e.g. istDate("2026-06-15", "18:00") === new Date("2026-06-15T12:30:00.000Z")
 */
function istDate(dateStr, hhmm) {
  return new Date(`${dateStr}T${hhmm}:00+05:30`);
}

/** "Monday, 15 Jun 2026" */
function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** "6:00 PM" — handles midnight / 12-noon edge cases. */
function prettyTime(hhmm) {
  let [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Strict "YYYY-MM-DD" validator. */
function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s + 'T00:00:00Z'));
}

/** Strict "HH:MM" 24-h validator. */
function isTime(s) {
  if (typeof s !== 'string') return false;
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const h = parseInt(m[1]), mn = parseInt(m[2]);
  return h >= 0 && h <= 23 && mn >= 0 && mn <= 59;
}

/** Simple email validator. */
function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120;
}

module.exports = {
  istNow, istNowMinutes, addDays, weekdayOf,
  hmToMinutes, minutesToHm, istDate,
  prettyDate, prettyTime, isDate, isTime, isEmail,
};
