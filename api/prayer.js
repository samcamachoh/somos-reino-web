// Serverless function: receives the prayer-request form from prayer.html and
// appends it as a row to a Google Sheet through a Google Apps Script web app
// (see docs/prayer-sheet.md for setup).
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   PRAYER_SHEET_WEBHOOK_URL   the Apps Script web app URL (ends in /exec)
//   PRAYER_SHEET_SECRET        shared secret; must match SECRET in the script

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
    name: clean(body.name, 120),
    phone: clean(body.phone, 40),
    email: clean(body.email, 200),
    confidential: body.confidential ? 'Yes' : 'No',
    followUp: body.followUp ? 'Yes' : 'No',
    message: String(body.message || '').trim().slice(0, 2000),
  };

  if (!data.message) {
    return res.status(400).json({ error: 'A prayer request is required.' });
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  if (data.followUp === 'Yes' && !data.phone && !data.email) {
    return res.status(400).json({ error: 'A phone or email is needed for follow-up.' });
  }

  const { PRAYER_SHEET_WEBHOOK_URL, PRAYER_SHEET_SECRET } = process.env;
  if (!PRAYER_SHEET_WEBHOOK_URL || !PRAYER_SHEET_SECRET) {
    return res.status(500).json({ error: 'Form is not configured.' });
  }

  try {
    const r = await fetch(PRAYER_SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: PRAYER_SHEET_SECRET, ...data }),
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
