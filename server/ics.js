'use strict';

/**
 * Pure RFC-5545 iCalendar builder.
 * Folds lines > 75 octets, escapes \ ; , \n, includes a VTIMEZONE for Asia/Kolkata.
 */

function escIcs(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/** RFC 5545 §3.1 line folding: lines > 75 octets get wrapped with CRLF + SPACE. */
function fold(line) {
  const encoded = Buffer.from(line, 'utf8');
  if (encoded.length <= 75) return line + '\r\n';

  const chunks = [];
  let offset = 0;
  let first = true;

  while (offset < encoded.length) {
    const limit = first ? 75 : 74; // continuation lines have leading space (1 byte)
    chunks.push(encoded.slice(offset, offset + limit).toString('utf8'));
    offset += limit;
    first = false;
  }

  return chunks.join('\r\n ') + '\r\n';
}

/** Format a Date as "YYYYMMDD" */
function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Format an IST (date, "HH:MM") pair as "YYYYMMDDTHHMMSS" for Asia/Kolkata TZID stamps. */
function istStamp(dateStr, hhmm) {
  const [y, m, d] = dateStr.split('-');
  const [h, mn] = hhmm.split(':');
  return `${y}${m}${d}T${h}${mn}00`;
}

/**
 * Build an ICS string.
 *
 * @param {object} opts
 * @param {string} opts.uid         - e.g. "booking-<mongoId>@shruti-sessions"
 * @param {string} opts.method      - "REQUEST" or "CANCEL"
 * @param {number} opts.sequence    - 0 for new, 1 for cancel
 * @param {string} opts.status      - "CONFIRMED" or "CANCELLED"
 * @param {string} opts.date        - "YYYY-MM-DD"
 * @param {string} opts.time        - "HH:MM" (IST, start)
 * @param {number} opts.durationMin - duration in minutes
 * @param {string} opts.summary     - event title
 * @param {string} opts.description
 * @param {string} opts.meetLink    - used as LOCATION and URL
 * @param {string} opts.organizerEmail
 * @param {string} opts.organizerName
 * @param {string} opts.attendeeEmail
 * @param {string} opts.attendeeName
 * @param {Date}   opts.dtstamp     - when the ICS was created (UTC)
 */
function buildIcs(opts) {
  const {
    uid, method, sequence = 0, status = 'CONFIRMED',
    date, time, durationMin,
    summary, description, meetLink,
    organizerEmail, organizerName,
    attendeeEmail, attendeeName,
    dtstamp,
  } = opts;

  const startStamp = istStamp(date, time);
  const endMinutes = parseInt(time.split(':')[1]) + parseInt(time.split(':')[0]) * 60 + durationMin;
  const endHH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endMM = String(endMinutes % 60).padStart(2, '0');
  const endStamp = istStamp(date, `${endHH}:${endMM}`);

  const dtStampStr = dtstamp.toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shruti Sessions//EN',
    `METHOD:${method}`,
    'CALSCALE:GREGORIAN',

    // Minimal VTIMEZONE for Asia/Kolkata (no DST — single STANDARD component)
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Kolkata',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0530',
    'TZOFFSETTO:+0530',
    'TZNAME:IST',
    'END:STANDARD',
    'END:VTIMEZONE',

    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStampStr}`,
    `DTSTART;TZID=Asia/Kolkata:${startStamp}`,
    `DTEND;TZID=Asia/Kolkata:${endStamp}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${status}`,
    `SUMMARY:${escIcs(summary)}`,
    `DESCRIPTION:${escIcs(description)}`,
    `LOCATION:${escIcs(meetLink)}`,
    `URL:${meetLink}`,
    `ORGANIZER;CN=${escIcs(organizerName)}:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${escIcs(attendeeName)};RSVP=TRUE:mailto:${attendeeEmail}`,

    // 30-minute alarm
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Session reminder',
    'TRIGGER:-PT30M',
    'END:VALARM',

    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(fold).join('');
}

module.exports = { buildIcs };
