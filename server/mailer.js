'use strict';
const nodemailer = require('nodemailer');
const { buildIcs } = require('./ics');
const { prettyDate, prettyTime } = require('./time');

let _transport = null;

function getTransport() {
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return _transport;
}

// ── Branded HTML shell ────────────────────────────────────────────────────────
function shell(bodyHtml) {
  const owner = process.env.OWNER_NAME || 'Shruti Agrawal';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${owner}</title></head>
<body style="margin:0;padding:0;background:#FBF3EE;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3EE;padding:32px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#ffffff;border:1px solid #ECD8D1;border-radius:8px;overflow:hidden;">
  <!-- Header -->
  <tr><td style="background:#ffffff;padding:32px 32px 16px;border-bottom:1px solid #ECD8D1;text-align:center;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#43373A;letter-spacing:0.02em;">${owner}</div>
    <div style="font-family:Arial,sans-serif;font-size:10px;color:#3E4A33;letter-spacing:0.18em;text-transform:uppercase;margin-top:4px;">MENTAL HEALTH ADVOCATE</div>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:32px;">
    ${bodyHtml}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#FBF3EE;padding:20px 32px;border-top:1px solid #ECD8D1;text-align:center;">
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#8A7378;line-height:1.7;">
      Your space. Your time. Your healing.<br>
      <span style="letter-spacing:0.1em;">Confidential &nbsp;·&nbsp; Supportive &nbsp;·&nbsp; Non-judgmental</span>
    </div>
    <div style="font-family:Arial,sans-serif;font-size:11px;color:#8A7378;margin-top:8px;">
      Need to reschedule? Just reply to this email.
    </div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function detailRow(label, value) {
  return `<tr>
    <td style="padding:8px 0;font-family:Arial,sans-serif;font-size:11px;color:#8A7378;letter-spacing:0.12em;text-transform:uppercase;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:8px 0;font-family:Georgia,serif;font-size:14px;color:#43373A;vertical-align:top;">${value}</td>
  </tr>`;
}

// ── ICS helpers ───────────────────────────────────────────────────────────────
function makeIcs(booking, method, sequence) {
  const owner = process.env.OWNER_NAME || 'Shruti Agrawal';
  return buildIcs({
    uid: `booking-${booking._id}@shruti-sessions`,
    method,
    sequence,
    status: method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED',
    date: booking.date,
    time: booking.time,
    durationMin: Math.round((booking.endAt - booking.startAt) / 60000),
    summary: `Session with ${owner}`,
    description: `Online session with ${owner}.\\nJoin: ${booking.meetLink}`,
    meetLink: booking.meetLink,
    organizerEmail: process.env.GMAIL_USER,
    organizerName: owner,
    attendeeEmail: booking.email,
    attendeeName: booking.name,
    dtstamp: new Date(),
  });
}

// ── 1. Client confirmation ────────────────────────────────────────────────────
async function sendClientConfirmation(booking) {
  const owner = process.env.OWNER_NAME || 'Shruti Agrawal';
  const fee = process.env.FIRST_SESSION_FEE || '299';
  const upiId = process.env.UPI_ID;
  const firstName = booking.name.split(' ')[0];
  const pd = prettyDate(booking.date);
  const pt = prettyTime(booking.time);

  const upiLine = upiId
    ? `payable via UPI to <strong>${escHtml(upiId)}</strong> during the session itself`
    : 'payable via UPI during the session itself';

  const body = `
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#43373A;margin:0 0 8px;">Your session is booked, ${escHtml(firstName)} &#9825;</h2>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#8A7378;margin:0 0 24px;">We're looking forward to seeing you.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ECD8D1;margin-bottom:24px;">
      ${detailRow('DATE', escHtml(pd))}
      ${detailRow('TIME (IST)', escHtml(pt))}
      ${detailRow('MODE', 'Google Meet (online)')}
    </table>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${escAttr(booking.meetLink)}" style="display:inline-block;background:#8E4549;color:#ffffff;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:13px 28px;border-radius:24px;">Join your session</a>
      <div style="margin-top:8px;font-family:Arial,sans-serif;font-size:11px;color:#8A7378;">${escHtml(booking.meetLink)}</div>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7E4DD;border-radius:6px;padding:16px;border:1px solid #ECD8D1;">
      <tr><td style="padding:16px;">
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#43373A;">
          <strong>Session fee: &#8377;${escHtml(fee)}</strong> &mdash; ${upiLine} itself. Nothing to pay right now.
        </div>
      </td></tr>
    </table>
  `;

  const icsContent = makeIcs(booking, 'REQUEST', 0);

  await getTransport().sendMail({
    from: `"${owner}" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: `Your session is booked, ${firstName} ♥`,
    html: shell(body),
    attachments: [{ filename: 'session-invite.ics', content: icsContent, contentType: 'text/calendar; method=REQUEST' }],
    icalEvent: { method: 'REQUEST', content: icsContent },
  });
}

// ── 2. Owner notification ─────────────────────────────────────────────────────
async function sendOwnerNotification(booking) {
  const owner = process.env.OWNER_NAME || 'Shruti Agrawal';
  const pd = prettyDate(booking.date);
  const pt = prettyTime(booking.time);

  const body = `
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#43373A;margin:0 0 8px;">New session booked</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ECD8D1;margin-bottom:24px;">
      ${detailRow('CLIENT', escHtml(booking.name))}
      ${detailRow('EMAIL', `<a href="mailto:${escAttr(booking.email)}" style="color:#8E4549;">${escHtml(booking.email)}</a>`)}
      ${detailRow('DATE', escHtml(pd))}
      ${detailRow('TIME (IST)', escHtml(pt))}
    </table>
    ${booking.concern ? `
    <div style="background:#F7E4DD;border-radius:6px;padding:16px;margin-bottom:24px;border-left:3px solid #D89FA4;">
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#8A7378;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">THEY SHARED</div>
      <div style="font-family:Georgia,serif;font-size:14px;color:#43373A;font-style:italic;">"${escHtml(booking.concern)}"</div>
    </div>` : ''}
    <div style="text-align:center;margin-bottom:16px;">
      <a href="${escAttr(booking.meetLink)}" style="display:inline-block;background:#8E4549;color:#ffffff;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:13px 28px;border-radius:24px;">Join session</a>
    </div>
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#8A7378;text-align:center;">The client never sees your phone number &mdash; all contact stays on email.</p>
  `;

  const icsContent = makeIcs(booking, 'REQUEST', 0);

  await getTransport().sendMail({
    from: `"${owner}" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: `New booking: ${booking.name} — ${prettyDate(booking.date)} ${prettyTime(booking.time)}`,
    html: shell(body),
    attachments: [{ filename: 'session-invite.ics', content: icsContent, contentType: 'text/calendar; method=REQUEST' }],
  });
}

// ── 3. Reminder ───────────────────────────────────────────────────────────────
async function sendReminder(booking) {
  const owner = process.env.OWNER_NAME || 'Shruti Agrawal';
  const firstName = booking.name.split(' ')[0];
  const pd = prettyDate(booking.date);
  const pt = prettyTime(booking.time);

  const clientBody = `
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#43373A;margin:0 0 8px;">Your session is in about an hour &#9825;</h2>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#8A7378;margin:0 0 24px;">Hi ${escHtml(firstName)}, just a gentle reminder — see you soon.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ECD8D1;margin-bottom:24px;">
      ${detailRow('DATE', escHtml(pd))}
      ${detailRow('TIME (IST)', escHtml(pt))}
    </table>
    <div style="text-align:center;">
      <a href="${escAttr(booking.meetLink)}" style="display:inline-block;background:#8E4549;color:#ffffff;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:13px 28px;border-radius:24px;">Join your session</a>
    </div>
  `;

  const ownerBody = `
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#43373A;margin:0 0 8px;">Session reminder: ${escHtml(booking.name)}</h2>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#8A7378;margin:0 0 24px;">Your session starts in about an hour.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ECD8D1;margin-bottom:24px;">
      ${detailRow('CLIENT', escHtml(booking.name))}
      ${detailRow('DATE', escHtml(pd))}
      ${detailRow('TIME (IST)', escHtml(pt))}
    </table>
    <div style="text-align:center;">
      <a href="${escAttr(booking.meetLink)}" style="display:inline-block;background:#8E4549;color:#ffffff;font-family:Arial,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:13px 28px;border-radius:24px;">Join session</a>
    </div>
  `;

  await Promise.all([
    getTransport().sendMail({
      from: `"${owner}" <${process.env.GMAIL_USER}>`,
      to: booking.email,
      subject: `Reminder: your session is in about an hour`,
      html: shell(clientBody),
    }),
    getTransport().sendMail({
      from: `"${owner}" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `Reminder: session with ${booking.name} in ~1 hour`,
      html: shell(ownerBody),
    }),
  ]);
}

// ── 4. Cancellation ───────────────────────────────────────────────────────────
async function sendCancellation(booking, note) {
  const owner = process.env.OWNER_NAME || 'Shruti Agrawal';
  const firstName = booking.name.split(' ')[0];
  const pd = prettyDate(booking.date);
  const pt = prettyTime(booking.time);

  const body = `
    <h2 style="font-family:Georgia,serif;font-size:20px;color:#43373A;margin:0 0 8px;">Your session has been cancelled</h2>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#8A7378;margin:0 0 16px;">Hi ${escHtml(firstName)}, I'm sorry to let you know that our session has been cancelled.</p>
    ${note ? `<div style="background:#F7E4DD;border-radius:6px;padding:16px;margin-bottom:16px;"><p style="font-family:Georgia,serif;font-size:14px;color:#43373A;margin:0;font-style:italic;">"${escHtml(note)}"</p></div>` : ''}
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ECD8D1;margin-bottom:24px;">
      ${detailRow('DATE', escHtml(pd))}
      ${detailRow('TIME (IST)', escHtml(pt))}
    </table>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#8A7378;">Please reply to this email to reschedule at a time that works for you. I look forward to speaking with you.</p>
    <p style="font-family:Georgia,serif;font-size:14px;color:#43373A;margin-top:24px;">With care,<br>${escHtml(owner)}</p>
  `;

  const icsContent = makeIcs(booking, 'CANCEL', 1);

  await getTransport().sendMail({
    from: `"${owner}" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: `Session cancelled — ${pd} at ${pt}`,
    html: shell(body),
    attachments: [{ filename: 'session-cancelled.ics', content: icsContent, contentType: 'text/calendar; method=CANCEL' }],
    icalEvent: { method: 'CANCEL', content: icsContent },
  });
}

// ── HTML escaping for template values ────────────────────────────────────────
function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

module.exports = {
  sendClientConfirmation,
  sendOwnerNotification,
  sendReminder,
  sendCancellation,
};
