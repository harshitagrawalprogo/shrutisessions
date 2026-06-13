'use strict';
const { google } = require('googleapis');
const crypto = require('crypto');

let _auth;

function getAuth() {
  if (!_auth) {
    _auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    _auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return _auth;
}

/**
 * Creates a Google Calendar event with a unique Meet room.
 * Returns the hangoutLink (e.g. https://meet.google.com/abc-defg-hij).
 * Falls back to a Jitsi room if Google credentials are not set.
 */
async function createMeetLink(summary, startAt, endAt) {
  // Fixed link takes priority
  if (process.env.MEET_LINK) return process.env.MEET_LINK;

  // Auto-create unique room via Calendar API if OAuth is configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    return `https://meet.jit.si/ShrutiSession-${crypto.randomBytes(5).toString('hex')}`;
  }

  const calendar = google.calendar({ version: 'v3', auth: getAuth() });

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary,
      start: { dateTime: startAt.toISOString() },
      end:   { dateTime: endAt.toISOString() },
      conferenceData: {
        createRequest: {
          requestId: `shruti-${crypto.randomBytes(8).toString('hex')}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  if (!data.hangoutLink) throw new Error('Google Calendar returned no Meet link');
  return data.hangoutLink;
}

module.exports = { createMeetLink };
