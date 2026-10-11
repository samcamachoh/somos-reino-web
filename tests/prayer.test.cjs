const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/prayer.js');

const ENV = { PRAYER_SHEET_WEBHOOK_URL: 'https://example.test/exec', PRAYER_SHEET_SECRET: 's3cret' };
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
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };
});
afterEach(() => {
  global.fetch = realFetch;
  for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

test('only POST is accepted', async () => {
  const res = await call({}, 'GET');
  assert.equal(res.code, 405);
  assert.equal(calls.length, 0);
});

test('a request with no message is rejected', async () => {
  const res = await call({ name: 'Ana', message: '   ' });
  assert.equal(res.code, 400);
  assert.equal(calls.length, 0);
});

test('anonymous requests (no name or contact) are accepted', async () => {
  const res = await call({ message: 'Please pray for my family.' });
  assert.equal(res.code, 200);
  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].opts.body);
  assert.equal(sent.secret, 's3cret');
  assert.equal(sent.message, 'Please pray for my family.');
  assert.equal(sent.confidential, 'No');
  assert.equal(sent.followUp, 'No');
});

test('follow-up needs a phone or email', async () => {
  assert.equal((await call({ message: 'x', followUp: true })).code, 400);
  assert.equal((await call({ message: 'x', followUp: true, phone: '407-555-0100' })).code, 200);
});

test('a bad email is rejected', async () => {
  assert.equal((await call({ message: 'x', email: 'nope' })).code, 400);
});

test('the honeypot pretends success without saving', async () => {
  const res = await call({ message: 'spam', website: 'http://spam.test' });
  assert.equal(res.code, 200);
  assert.equal(calls.length, 0);
});

test('reports not configured when env vars are missing', async () => {
  delete process.env.PRAYER_SHEET_WEBHOOK_URL;
  assert.equal((await call({ message: 'x' })).code, 500);
});

test('a failed save surfaces as 502', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ ok: false }) });
  assert.equal((await call({ message: 'x' })).code, 502);
});
