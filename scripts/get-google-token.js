/**
 * Run this ONCE to get your Google refresh token.
 *
 *   node scripts/get-google-token.js
 *
 * Then open the printed URL in your browser, sign in with harshitagra8092@gmail.com,
 * allow Calendar access, and the refresh token will be printed here.
 * Paste it into .env as GOOGLE_REFRESH_TOKEN=...
 */
'use strict';
require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('\nMissing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env\n');
  process.exit(1);
}

const REDIRECT = 'http://localhost:3001/oauth2callback';

const client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT
);

const authUrl = client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',         // forces refresh_token to be returned every time
  scope: ['https://www.googleapis.com/auth/calendar'],
});

console.log('\n──────────────────────────────────────────────────');
console.log('  Open this URL in your browser (use harshitagra8092@gmail.com):');
console.log('\n' + authUrl + '\n');
console.log('  Waiting on http://localhost:3001 ...');
console.log('──────────────────────────────────────────────────\n');

const server = http.createServer(async (req, res) => {
  const { query } = url.parse(req.url, true);
  if (!query.code) {
    res.writeHead(400); res.end('No code received.'); return;
  }
  try {
    const { tokens } = await client.getToken(query.code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Done! Check your terminal and close this tab.</h2>');
    console.log('\n✅  Paste this line into your .env:\n');
    console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token + '\n');
  } catch (err) {
    res.writeHead(500); res.end('Error: ' + err.message);
    console.error('Token exchange failed:', err.message);
  } finally {
    server.close();
  }
});

server.listen(3001);
