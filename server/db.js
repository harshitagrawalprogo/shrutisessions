'use strict';
const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.on('error', err => console.error('Idle PG client error:', err.message));
  }
  return pool;
}

/** Thin wrapper — always returns pg's result object {rows, rowCount}. */
async function query(sql, params = []) {
  return getPool().query(sql, params);
}

// ── Schema migration (idempotent) ─────────────────────────────────────────────
async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS availability (
      id SERIAL PRIMARY KEY,
      day INTEGER UNIQUE NOT NULL CHECK (day >= 0 AND day <= 6),
      enabled BOOLEAN NOT NULL DEFAULT false,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_minutes INTEGER NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS blocks (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT
    )
  `);

  // NULL != NULL in SQL, so two separate partial indexes are needed
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS blocks_whole_day_idx
    ON blocks (date) WHERE time IS NULL
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS blocks_slot_idx
    ON blocks (date, time) WHERE time IS NOT NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      start_at TIMESTAMPTZ NOT NULL,
      end_at TIMESTAMPTZ NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      concern TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
      meet_link TEXT NOT NULL,
      reminded BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Double-booking guarantee at the DB level — unique confirmed (date, time)
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_confirmed_slot_idx
    ON bookings (date, time) WHERE status = 'confirmed'
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS bookings_reminder_idx
    ON bookings (start_at, status, reminded)
  `);
}

// ── Row mappers ───────────────────────────────────────────────────────────────

/** Map a bookings row (snake_case) to camelCase for mailer/ics compatibility. */
function mapBooking(row) {
  if (!row) return null;
  return {
    _id: String(row.id),
    id: String(row.id),
    date: row.date,
    time: row.time,
    startAt: row.start_at,
    endAt: row.end_at,
    name: row.name,
    email: row.email,
    concern: row.concern || '',
    status: row.status,
    meetLink: row.meet_link,
    reminded: row.reminded,
    createdAt: row.created_at,
  };
}

/** Map an availability row to the shape used by slot engine + admin API. */
function mapAvailability(row) {
  return {
    day: row.day,
    enabled: row.enabled,
    start: row.start_time,
    end: row.end_time,
    slotMinutes: row.slot_minutes,
  };
}

// ── Lazy ready (for Vercel serverless — idempotent on Render) ─────────────────
let _ready = false;
async function ensureReady() {
  if (_ready) return;
  await initDb();
  const { seedAvailability } = require('./slots');
  await seedAvailability();
  _ready = true;
}

module.exports = { query, initDb, ensureReady, mapBooking, mapAvailability };
