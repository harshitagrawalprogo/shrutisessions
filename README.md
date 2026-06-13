# Shruti Sessions

A privacy-first session booking web app for **Shruti Agrawal — Mental Health Advocate**.

Clients pick an open time slot, enter their details, and get a branded confirmation email with a `.ics` calendar invite. A reminder fires ~1 hour before each session. The admin dashboard lets the owner manage her schedule, block days off, view bookings with client notes, and cancel with an automatic apology email.

**Privacy guarantee:** The owner's phone number does not exist anywhere in this codebase, emails, or UI. Email is the only contact channel — by design.

---

## 15-Minute Setup

### 1. MongoDB Atlas (free)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → Create a free M0 cluster (any region).
2. Under **Database Access**, create a user with password.
3. Under **Network Access**, add `0.0.0.0/0` (allow from anywhere) for Render deployment.
4. Click **Connect → Drivers** and copy the connection string.  
   It looks like: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/shruti-sessions`

### 2. Gmail App Password

Your Gmail password won't work here — you need an **App Password**:

1. Go to your Google Account → **Security**
2. Make sure **2-Step Verification is ON** (required)
3. Search for "App passwords" → Create one → Name it "Shruti Sessions"
4. Copy the 16-character code (no spaces needed)

### 3. Google Meet link (optional but recommended)

For a fixed, reusable meeting room:

1. Go to [meet.google.com](https://meet.google.com)
2. Click **"New meeting" → "Create a meeting for later"**
3. Copy the link (e.g. `https://meet.google.com/abc-defg-hij`)
4. Set it as `MEET_LINK` in your `.env`

If you leave `MEET_LINK` empty, each booking automatically gets a unique Jitsi room (`https://meet.jit.si/ShrutiSession-<random>`).

### 4. Local setup

```bash
git clone <repo>
cd shruti-sessions
npm install
cp .env.example .env
# Edit .env with your values (see .env.example for documentation)
npm start
```

Open [http://localhost:3000](http://localhost:3000) — the booking page.  
Admin dashboard: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

---

## Deploy on Render (free tier)

1. Push the repo to GitHub.
2. On [render.com](https://render.com) → **New → Web Service** → connect your repo.
3. Set:
   - **Build command:** `npm install`
   - **Start command:** `node server/index.js`
   - **Environment:** Node
4. Add all environment variables from `.env.example` under **Environment**.
5. Deploy.

**Free-tier sleep note:** Render's free plan spins down after 15 minutes of inactivity. The first request after sleep takes ~30 seconds.  
**Fix:** Sign up for a free [UptimeRobot](https://uptimerobot.com) account → New monitor → HTTP(S) → your Render URL + `/healthz` → every 5 minutes. This keeps the server awake 24/7.

---

## Admin Dashboard Guide

Navigate to `/admin.html` and enter your `ADMIN_PASSWORD`.

### Bookings tab
- See all upcoming confirmed sessions with client name, email, and any notes they shared.
- Click **Join link** to open the video call.
- Click **Cancel** → confirm → the client receives a gentle apology email with a `CANCEL` calendar update (removes the session from their calendar).
- Tick **show past & cancelled** to see the full history.

### Weekly Hours tab
- Toggle each day on/off.
- Set **From / To** times (IST) and **Session Length** (30/45/60/90 min).
- Click **Save Weekly Hours**.
- Changes apply only to future bookings — existing confirmed sessions are unaffected.

### Days Off tab
- Pick a date → leave the time blank to block the entire day, or pick a specific time to block just that slot.
- Click **Block it** → that date/slot disappears from the public booking page immediately.
- Click **Unblock** to restore it.

---

## Privacy guarantees

- The owner's phone number is absent from all code, UI, emails, and API responses.
- Client notes (`concern` field) are shown **only** in the owner notification email and admin dashboard — never on the public page.
- All contact between client and owner routes through email reply.
- The admin dashboard requires a JWT (7-day expiry) and a constant-time password comparison to prevent timing attacks.

---

## Customisation

| What to change | Where |
|---|---|
| Fee amount | `FIRST_SESSION_FEE` in `.env` |
| Session days/hours | Admin → Weekly Hours tab |
| UPI ID shown in email | `UPI_ID` in `.env` |
| Video meeting room | `MEET_LINK` in `.env` (leave blank for auto-Jitsi) |
| Booking window | `BOOKING_DAYS_AHEAD` in `.env` (1–60 days) |
| Lead time | `BOOKING_LEAD_MINUTES` in `.env` |
| Owner name in emails | `OWNER_NAME` in `.env` |

---

## Running tests

```bash
npm test
```

41 unit tests covering: IST time helpers, date math, 12-hour formatting, ICS generation (line folding, escaping, TZID stamps, METHOD, VTIMEZONE), and validators.
