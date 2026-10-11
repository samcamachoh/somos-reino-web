# Prayer request form → Google Sheet

The form at `/prayer.html` posts to `/api/prayer`, which appends a row to a Google Sheet.
This is a separate sheet from the guest form, so prayer requests stay out of the guest dashboard.

1. Create a Google Sheet (any name, e.g. "Prayer requests") with this header row in row 1:
   `Timestamp | Name | Phone | Email | Confidential | Wants follow-up | Request`
2. In the sheet: Extensions → Apps Script. Replace the code with:

```js
const SECRET = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false });
    SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([
      new Date(), d.name, d.phone, d.email, d.confidential, d.followUp, d.message,
    ].map(v => typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v));
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. Deploy → New deployment → type **Web app** → Execute as **Me**, Who has access **Anyone** → Deploy, and authorize. Copy the `/exec` URL.
4. In Vercel add env vars `PRAYER_SHEET_WEBHOOK_URL` (that URL) and `PRAYER_SHEET_SECRET` (same value as `SECRET`), then redeploy.

Until those two variables are set, the form shows its "could not send" message and nothing is saved.

Optional: to get an email for each request, add `MailApp.sendEmail('you@example.com', 'New prayer request', d.message);` inside `doPost` after the `appendRow` call (skip it when `d.confidential === 'Yes'` if the request should stay out of email).
