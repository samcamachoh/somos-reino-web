# Guest form → Google Sheet

1. Create a Google Sheet (any name) with this header row in row 1:
   `Timestamp | Name | Phone | Email | Adults | Children | Heard about us | Wants follow-up | Message`
2. In the sheet: Extensions → Apps Script. Replace the code with:

```js
const SECRET = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false });
    SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([
      new Date(), d.name, d.phone, d.email, d.adults, d.kids,
      d.source, d.followUp, d.message,
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
4. In Vercel add env vars `GUEST_SHEET_WEBHOOK_URL` (that URL) and `GUEST_SHEET_SECRET` (same value as `SECRET`), then redeploy.
