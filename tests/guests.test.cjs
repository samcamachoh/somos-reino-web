const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/guests.js');

const ENV = { GUEST_DASHBOARD_KEY: 'k'.repeat(48), GUEST_SHEET_WEBHOOK_URL: 'https://example.test/exec', GUEST_SHEET_SECRET: 's3cret' };
const realFetch = global.fetch;
let saved, calls;

function call(body, method = 'POST') {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method, body }, res).then(() => res);
}

beforeEach(() => {
  saved = {};
  for (const k of Object.keys(ENV)) { saved[k] = process.env[k]; process.env[k] = ENV[k]; }
  calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ ok: true, rows: [
      ['2026-10-01T14:08:36.000Z', 'Sam', 4079290320, 's@x.co', '1 Main St', 2, 0, '', 'Returning', 'Yes', 'No', 'Serving', 'Call', '', '2001-08-13', 'Instagram', '', 'Yes'],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ['2026-10-02T10:00:00.000Z', 'Ana', '', 'a@x.co'],
    ] }) };
  };
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

test('wrong or missing key gets 404 and never reaches the sheet', async () => {
  for (const body of [{ key: 'nope' }, {}, { key: ['x'] }, undefined]) {
    const res = await call(body);
    assert.equal(res.code, 404);
    assert.equal(res.body.guests, undefined);
  }
  assert.equal(calls.length, 0);
});

test('non-POST is rejected', async () => {
  assert.equal((await call({ key: ENV.GUEST_DASHBOARD_KEY }, 'GET')).code, 405);
});

test('without a configured dashboard key nothing is served', async () => {
  delete process.env.GUEST_DASHBOARD_KEY;
  assert.equal((await call({ key: '' })).code, 404);
});

test('valid key returns non-empty guests newest first as strings', async () => {
  const res = await call(JSON.stringify({ key: ENV.GUEST_DASHBOARD_KEY }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.guests.map(g => g.name), ['Ana', 'Sam']);
  assert.equal(res.body.guests[1].phone, '4079290320');
  assert.equal(res.body.guests[1].followUp, 'Yes');
  assert.equal(res.body.guests[0].message, '');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.parse(calls[0].opts.body).action, 'list');
  assert.equal(JSON.parse(calls[0].opts.body).secret, 's3cret');
});

test('sheet failure returns 502', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: false }) });
  assert.equal((await call({ key: ENV.GUEST_DASHBOARD_KEY })).code, 502);
});
