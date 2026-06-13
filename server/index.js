'use strict';
require('dotenv').config();

// ── Env guard ────────────────────────────────────────────────────────────────
const REQUIRED_KEYS = ['DATABASE_URL', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'ADMIN_PASSWORD', 'JWT_SECRET'];
const missing = REQUIRED_KEYS.filter(k => !process.env[k]);
if (missing.length) {
  console.error('\n  SHRUTI SESSIONS — startup aborted.\n  Missing required environment variables:\n');
  missing.forEach(k => console.error(`    • ${k}`));
  console.error('\n  Copy .env.example → .env and fill in each value.\n');
  process.exit(1);
}

// ── Defaults ──────────────────────────────────────────────────────────────────
process.env.OWNER_NAME           = process.env.OWNER_NAME || 'Shruti Agrawal';
process.env.FIRST_SESSION_FEE    = process.env.FIRST_SESSION_FEE || '299';
process.env.BOOKING_DAYS_AHEAD   = String(Math.min(60, Math.max(1, parseInt(process.env.BOOKING_DAYS_AHEAD) || 14)));
process.env.BOOKING_LEAD_MINUTES = String(Math.max(0, parseInt(process.env.BOOKING_LEAD_MINUTES) || 120));
process.env.PORT                 = process.env.PORT || '3000';

const express = require('express');
const path    = require('path');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ── Cron endpoint (used by Vercel Cron or cron-job.org) ───────────────────────
app.post('/api/cron/reminders', async (req, res) => {
  const secret = (req.headers.authorization || '').replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { sendReminders } = require('./slots');
    await sendReminders();
    res.json({ ok: true });
  } catch (err) {
    console.error('Cron endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Lazy DB init (no-op after first call; keeps Vercel cold starts safe) ──────
const { ensureReady } = require('./db');
app.use(async (_req, _res, next) => {
  try { await ensureReady(); next(); }
  catch (err) { next(err); }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', require('./routes/public'));
app.use('/api/admin', require('./routes/admin'));

// ── Render / local: start server + cron ──────────────────────────────────────
if (require.main === module) {
  const cron = require('node-cron');
  const { initDb, ensureReady } = require('./db');

  async function start() {
    await initDb();
    console.log('  PostgreSQL schema ready');

    const { seedAvailability } = require('./slots');
    await seedAvailability();

    cron.schedule('*/10 * * * *', async () => {
      try {
        const { sendReminders } = require('./slots');
        await sendReminders();
      } catch (err) {
        console.error('Cron error:', err.message);
      }
    });

    const port = parseInt(process.env.PORT);
    app.listen(port, () => {
      console.log(`  Shruti Sessions running → http://localhost:${port}`);
    });
  }

  start().catch(err => {
    console.error('Startup error:', err.message);
    process.exit(1);
  });
}

// ── Vercel: export app (DB init happens lazily via ensureReady middleware) ────
module.exports = app;
