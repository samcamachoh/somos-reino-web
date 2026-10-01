// Serverless function: receives the new-guest form from welcome.html and
// appends it as a row to a Google Sheet through a Google Apps Script web app
// (see docs/guest-sheet.md for setup).
//
// Required env var (Vercel → Project → Settings → Environment Variables):
//   GUEST_SHEET_WEBHOOK_URL   the Apps Script web app URL (ends in /exec)
//   GUEST_SHEET_SECRET        shared secret; must match SECRET in the script

const MAX = { name: 120, phone: 40, email: 200, source: 60, message: 2000 };

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});

  // Honeypot: real visitors never fill this hidden field. Pretend success.
  if (body.website) return res.status(200).json({ ok: true });

  const data = {
    name: clean(body.name, MAX.name),
    phone: clean(body.phone, MAX.phone),
    email: clean(body.email, MAX.email),
    adults: clean(body.adults, 3),
    kids: clean(body.kids, 3),
    source: clean(body.source, MAX.source),
    followUp: body.followUp ? 'Yes' : 'No',
    message: String(body.message || '').trim().slice(0, MAX.message),
  };

  if (!data.name || (!data.phone && !data.email)) {
    return res.status(400).json({ error: 'Name and a phone or email are required.' });
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }

  const { GUEST_SHEET_WEBHOOK_URL, GUEST_SHEET_SECRET } = process.env;
  if (!GUEST_SHEET_WEBHOOK_URL || !GUEST_SHEET_SECRET) {
    return res.status(500).json({ error: 'Form is not configured.' });
  }

  try {
    const r = await fetch(GUEST_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: GUEST_SHEET_SECRET, ...data }),
      redirect: 'follow',
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out.ok) return res.status(502).json({ error: 'Could not save.' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Could not save.' });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
