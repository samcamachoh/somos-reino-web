// Serverless function: returns the guest list for the staff dashboard
// (dashboard.html, served at /d/<key>). The dashboard URL carries a secret
// key; this function only answers when that key matches GUEST_DASHBOARD_KEY,
// so guest details are never exposed just because someone found the page.
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   GUEST_DASHBOARD_KEY       long random string that forms the dashboard URL
//   GUEST_SHEET_WEBHOOK_URL   same Apps Script web app URL as api/guest.js
//   GUEST_SHEET_SECRET        same shared secret as api/guest.js

const crypto = require('node:crypto');

// Column order of the sheet (see docs/guest-sheet.md).
const FIELDS = [
  'timestamp', 'name', 'phone', 'email', 'address', 'adults', 'kids', 'kidsAges',
  'visit', 'churchHome', 'otherChurch', 'interests', 'contactMethod', 'bestTime',
  'birthday', 'source', 'invitedBy', 'followUp', 'message',
];

function sameKey(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { GUEST_DASHBOARD_KEY, GUEST_SHEET_WEBHOOK_URL, GUEST_SHEET_SECRET } = process.env;
  if (!GUEST_DASHBOARD_KEY || !GUEST_SHEET_WEBHOOK_URL || !GUEST_SHEET_SECRET) {
    return res.status(404).json({ error: 'Not found' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (typeof body.key !== 'string' || !sameKey(body.key, GUEST_DASHBOARD_KEY)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const r = await fetch(GUEST_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: GUEST_SHEET_SECRET, action: 'list' }),
      redirect: 'follow',
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.ok || !Array.isArray(out.rows)) {
      return res.status(502).json({ error: 'Could not load guests.' });
    }
    const guests = out.rows
      .filter(row => Array.isArray(row) && row.some(v => v !== '' && v != null))
      .map(row => Object.fromEntries(FIELDS.map((f, i) => [f, row[i] == null ? '' : String(row[i])])))
      .reverse();
    return res.status(200).json({ guests });
  } catch (e) {
    return res.status(502).json({ error: 'Could not load guests.' });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
