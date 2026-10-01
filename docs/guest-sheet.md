# Guest form → Google Sheet

1. Create a Google Sheet (any name) with this header row in row 1:
   `Timestamp | Name | Phone | Email | Address / ZIP | Adults | Children | Children ages | Visit status | Looking for a church home | Attends another church | Interests | Preferred contact | Best time | Birthday | Heard about us | Invited by | Wants follow-up | Message`
2. In the sheet: Extensions → Apps Script. Replace the code with:

```js
const SECRET = 'CHANGE-ME-TO-A-LONG-RANDOM-STRING';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false });
    if (d.action === 'list') {
      const rows = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
        .getDataRange().getValues().slice(1)
        .map(r => r.map(v => v instanceof Date ? v.toISOString() : v));
      return out({ ok: true, rows });
    }
    // The guest form sends no action; anything else is not a new guest.
    if (d.action !== undefined) return out({ ok: false });
    SpreadsheetApp.getActiveSpreadsheet().getSheets()[0].appendRow([
      new Date(), d.name, d.phone, d.email, d.address, d.adults, d.kids,
      d.kidsAges, d.visit, d.churchHome, d.otherChurch, d.interests,
      d.contactMethod, d.bestTime, d.birthday, d.source, d.invitedBy,
      d.followUp, d.message,
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

## Staff dashboard

The dashboard lists the sheet's entries at `/d/<GUEST_DASHBOARD_KEY>`. Set `GUEST_DASHBOARD_KEY` in Vercel to a long random string (for example `openssl rand -hex 24`) and redeploy. Only people who have the full link can open it, and `/api/guests` refuses any request that doesn't carry the key. The key is not stored in the repo. To revoke access, change the env var and share the new link.

If you set up the Apps Script before the dashboard existed, replace it with the version above (it adds the `list` action), then Deploy → Manage deployments → edit → New version.
