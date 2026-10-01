// Serverless function: receives the new-guest form from welcome.html and
// emails it to the pastoral team via Resend (https://resend.com).
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY      API key from Resend
//   GUEST_TO_EMAIL      where submissions go (comma-separated for several)
//   GUEST_FROM_EMAIL    verified sender, e.g. "Somos Reino <welcome@yourdomain.org>"

const MAX = { name: 120, phone: 40, email: 200, source: 60, message: 2000 };

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  const { RESEND_API_KEY, GUEST_TO_EMAIL, GUEST_FROM_EMAIL } = process.env;
  if (!RESEND_API_KEY || !GUEST_TO_EMAIL || !GUEST_FROM_EMAIL) {
    return res.status(500).json({ error: 'Form is not configured.' });
  }

  const rows = [
    ['Name', data.name], ['Phone', data.phone], ['Email', data.email],
    ['Adults', data.adults], ['Children', data.kids],
    ['How they heard about us', data.source], ['Wants a follow-up', data.followUp],
    ['Message / prayer request', data.message],
  ].filter(([, v]) => v);

  const html = '<table cellpadding="6">' + rows.map(([k, v]) =>
    `<tr><td><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v).replace(/\n/g, '<br>')}</td></tr>`).join('') + '</table>';
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: GUEST_FROM_EMAIL,
        to: GUEST_TO_EMAIL.split(',').map(s => s.trim()).filter(Boolean),
        reply_to: data.email || undefined,
        subject: `New guest: ${data.name}`,
        html, text,
      }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Could not send.' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Could not send.' });
  }
};

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}
