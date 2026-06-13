'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  addDays, weekdayOf, prettyTime, prettyDate,
  istDate, isDate, isTime, isEmail,
  hmToMinutes, minutesToHm,
} = require('../server/time');

const { buildIcs } = require('../server/ics');

// ── time.js ───────────────────────────────────────────────────────────────────

describe('addDays', () => {
  test('adds days within same month', () => {
    assert.equal(addDays('2026-06-10', 5), '2026-06-15');
  });
  test('rolls over month', () => {
    assert.equal(addDays('2026-06-28', 5), '2026-07-03');
  });
  test('rolls over year', () => {
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  });
  test('zero days', () => {
    assert.equal(addDays('2026-06-15', 0), '2026-06-15');
  });
  test('negative days', () => {
    assert.equal(addDays('2026-06-05', -5), '2026-05-31');
  });
});

describe('weekdayOf', () => {
  test('2026-06-15 is Monday (1)', () => {
    assert.equal(weekdayOf('2026-06-15'), 1);
  });
  test('2026-06-21 is Sunday (0)', () => {
    assert.equal(weekdayOf('2026-06-21'), 0);
  });
  test('2026-06-20 is Saturday (6)', () => {
    assert.equal(weekdayOf('2026-06-20'), 6);
  });
});

describe('prettyTime', () => {
  test('18:00 → 6:00 PM', () => {
    assert.equal(prettyTime('18:00'), '6:00 PM');
  });
  test('00:05 → 12:05 AM', () => {
    assert.equal(prettyTime('00:05'), '12:05 AM');
  });
  test('12:00 → 12:00 PM', () => {
    assert.equal(prettyTime('12:00'), '12:00 PM');
  });
  test('23:45 → 11:45 PM', () => {
    assert.equal(prettyTime('23:45'), '11:45 PM');
  });
  test('06:30 → 6:30 AM', () => {
    assert.equal(prettyTime('06:30'), '6:30 AM');
  });
});

describe('istDate', () => {
  test('18:00 IST = 12:30 UTC', () => {
    const d = istDate('2026-06-15', '18:00');
    assert.equal(d.toISOString(), '2026-06-15T12:30:00.000Z');
  });
  test('00:00 IST = 18:30 UTC previous day', () => {
    const d = istDate('2026-06-15', '00:00');
    assert.equal(d.toISOString(), '2026-06-14T18:30:00.000Z');
  });
});

describe('validators', () => {
  test('isDate valid', () => assert.ok(isDate('2026-06-15')));
  test('isDate invalid month', () => assert.ok(!isDate('2026-13-01')));
  test('isDate wrong format', () => assert.ok(!isDate('15-06-2026')));
  test('isDate non-string', () => assert.ok(!isDate(20260615)));

  test('isTime valid', () => assert.ok(isTime('18:00')));
  test('isTime midnight', () => assert.ok(isTime('00:00')));
  test('isTime invalid hour', () => assert.ok(!isTime('25:00')));
  test('isTime non-padded', () => assert.ok(!isTime('8:00')));

  test('isEmail valid', () => assert.ok(isEmail('test@example.com')));
  test('isEmail no at', () => assert.ok(!isEmail('testexample.com')));
  test('isEmail too long', () => assert.ok(!isEmail('a@b.c' + 'x'.repeat(120))));
});

describe('hmToMinutes / minutesToHm', () => {
  test('18:00 → 1080', () => assert.equal(hmToMinutes('18:00'), 1080));
  test('18:45 → 1125', () => assert.equal(hmToMinutes('18:45'), 1125));
  test('1080 → 18:00', () => assert.equal(minutesToHm(1080), '18:00'));
  test('1125 → 18:45', () => assert.equal(minutesToHm(1125), '18:45'));
  test('roundtrip', () => assert.equal(minutesToHm(hmToMinutes('21:00')), '21:00'));
});

// ── ics.js ────────────────────────────────────────────────────────────────────

describe('buildIcs', () => {
  const baseOpts = {
    uid: 'booking-abc123@shruti-sessions',
    method: 'REQUEST',
    sequence: 0,
    status: 'CONFIRMED',
    date: '2026-06-15',
    time: '18:00',
    durationMin: 45,
    summary: 'Session with Shruti Agrawal',
    description: 'Online session',
    meetLink: 'https://meet.jit.si/test',
    organizerEmail: 'shruti@example.com',
    organizerName: 'Shruti Agrawal',
    attendeeEmail: 'client@example.com',
    attendeeName: 'Test Client',
    dtstamp: new Date('2026-06-13T10:00:00Z'),
  };

  test('contains METHOD:REQUEST', () => {
    const ics = buildIcs(baseOpts);
    assert.ok(ics.includes('METHOD:REQUEST'));
  });

  test('contains VTIMEZONE for Asia/Kolkata', () => {
    const ics = buildIcs(baseOpts);
    assert.ok(ics.includes('BEGIN:VTIMEZONE'));
    assert.ok(ics.includes('TZID:Asia/Kolkata'));
  });

  test('DTSTART has TZID=Asia/Kolkata stamp', () => {
    const ics = buildIcs(baseOpts);
    assert.ok(ics.includes('DTSTART;TZID=Asia/Kolkata:20260615T180000'));
  });

  test('DTEND is 45 min later', () => {
    const ics = buildIcs(baseOpts);
    assert.ok(ics.includes('DTEND;TZID=Asia/Kolkata:20260615T184500'));
  });

  test('METHOD:CANCEL for cancellation', () => {
    const ics = buildIcs({ ...baseOpts, method: 'CANCEL', sequence: 1, status: 'CANCELLED' });
    assert.ok(ics.includes('METHOD:CANCEL'));
    assert.ok(ics.includes('SEQUENCE:1'));
    assert.ok(ics.includes('STATUS:CANCELLED'));
  });

  test('escapes semicolons in description', () => {
    const ics = buildIcs({ ...baseOpts, description: 'a;b' });
    assert.ok(ics.includes('a\\;b'));
  });

  test('escapes commas in summary', () => {
    const ics = buildIcs({ ...baseOpts, summary: 'Session, online' });
    assert.ok(ics.includes('Session\\, online'));
  });

  test('no line exceeds 75 octets', () => {
    const ics = buildIcs(baseOpts);
    const lines = ics.split('\r\n');
    for (const line of lines) {
      const len = Buffer.byteLength(line, 'utf8');
      assert.ok(len <= 75, `Line too long (${len}): ${line.slice(0, 80)}`);
    }
  });

  test('contains VALARM trigger', () => {
    const ics = buildIcs(baseOpts);
    assert.ok(ics.includes('TRIGGER:-PT30M'));
  });

  test('contains UID', () => {
    const ics = buildIcs(baseOpts);
    assert.ok(ics.includes('UID:booking-abc123@shruti-sessions'));
  });
});
