const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/videos.js');

const entries = Array.from({ length: 15 }, (_, i) =>
  `<entry><yt:videoId>vid${String(i).padStart(8, '0')}</yt:videoId><title>T${i}</title><published>2026-10-01T00:00:00+00:00</published></entry>`).join('');

async function count(query) {
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => `<feed>${entries}</feed>` });
  try {
    let body;
    await handler({ query }, { setHeader() {}, status() { return { json: o => { body = o; } }; } });
    return body.videos.length;
  } finally { global.fetch = realFetch; }
}

test('returns 3 videos by default so the home page is unchanged', async () => {
  assert.equal(await count({}), 3);
});
test('?limit raises the count up to the 15 the feed holds', async () => {
  assert.equal(await count({ limit: '15' }), 15);
  assert.equal(await count({ limit: '99' }), 15);
});
test('a bad ?limit falls back to the default', async () => {
  assert.equal(await count({ limit: 'abc' }), 3);
  assert.equal(await count({ limit: '0' }), 3);
});
