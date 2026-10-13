const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

function setup(opts = {}) {
  const videos = opts.videos || [{ videoId: 'abcdefghijk', title: '<img src=x onerror=alert(1)> "Faith"', date: '<b>Today</b>' }];
  const live = opts.live === undefined ? { live: false } : opts.live;
  const upcoming = opts.upcoming === undefined ? { upcoming: null } : opts.upcoming;
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        style: {},
        dataset: {},
        hidden: false,
        innerHTML: '',
        textContent: '',
        classList: {
          _c: new Set(),
          add(c) { this._c.add(c); },
          remove(c) { this._c.delete(c); },
          toggle(c, force) {
            if (force === undefined) { this._c.has(c) ? this._c.delete(c) : this._c.add(c); }
            else if (force) this._c.add(c); else this._c.delete(c);
          },
          contains(c) { return this._c.has(c); },
        },
        addEventListener() {},
        setAttribute(k, v) { if (k === 'aria-label') this.ariaLabel = v; if (k === 'aria-hidden') this.ariaHidden = v; },
        removeAttribute(k) {
          if (k === 'target') delete this.target;
          if (k === 'rel') delete this.rel;
          if (k === 'aria-hidden') delete this.ariaHidden;
          if (k === 'data-es') delete this.dataset.es;
          if (k === 'data-en') delete this.dataset.en;
        },
        querySelector(sel) {
          if (sel === '.hero-live-label') return element(id + '-label');
          return null;
        },
        querySelectorAll() { return []; },
      });
    }
    return elements.get(id);
  }
  // Seed the live badge label child used by setLiveBadge
  element('live-badge-label');
  element('live-badge-meta');

  const requests = [];
  const document = {
    documentElement: { scrollHeight: 2000, lang: 'es' },
    body: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
    head: { appendChild(tag) { elements.set(tag.id, tag); } },
    getElementById(id) { return id === 'youtube-api' ? elements.get(id) : element(id); },
    querySelectorAll() { return []; },
    querySelector() { return element('query'); },
    addEventListener() {},
    createElement() { return {}; },
  };
  const location = {
    hostname: opts.hostname || 'example.test',
    search: opts.search || '',
    href: 'https://example.test/',
    pathname: '/',
  };
  const context = vm.createContext({
    document,
    window: {
      scrollY: 0,
      innerHeight: 800,
      matchMedia() { return { matches: false }; },
      addEventListener() {},
      location,
      YT: undefined,
    },
    location,
    localStorage: {
      getItem() { throw Error('Storage blocked'); },
      setItem() { throw Error('Storage blocked'); },
    },
    AbortController,
    setTimeout,
    clearTimeout,
    requestAnimationFrame() {},
    fetch: async (url) => {
      requests.push(String(url));
      const u = String(url);
      if (u.includes('/api/videos')) return { ok: true, json: async () => ({ videos }) };
      if (u.includes('/upcoming')) return { ok: true, json: async () => upcoming };
      if (u.includes('/live')) return { ok: true, json: async () => live };
      return { ok: true, json: async () => ({}) };
    },
  });
  // point window at the same location object after context creation
  context.window.location = location;
  vm.runInContext(source, context);
  return { context, elements, requests };
}

test('blocked storage and unavailable IntersectionObserver do not stop initialization', async () => {
  const { context, elements, requests } = setup();
  await new Promise(setImmediate);
  assert.equal(vm.runInContext('currentLang', context), 'es');
  assert.equal(elements.get('sermons-grid').style.display, 'grid');
  assert.ok(requests.includes('/api/live'));
  assert.ok(!elements.has('youtube-api'));
});

test('sermon text is escaped before entering HTML', async () => {
  const { elements } = setup();
  await new Promise(setImmediate);
  const html = elements.get('sermons-grid').innerHTML;
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &quot;Faith&quot;'));
  assert.ok(html.includes('&lt;b&gt;Today&lt;/b&gt;'));
  assert.ok(!html.includes('<img src=x'));
});

test('invalid video IDs fall through to a visible error state', async () => {
  const { elements } = setup({ videos: [{ videoId: 'bad" onclick="alert(1)', title: 'Bad' }] });
  await new Promise(setImmediate);
  assert.equal(elements.get('sermons-error').style.display, 'block');
  assert.equal(elements.get('sermons-loading').style.display, 'none');
});

test('YouTube API is requested only when a live player is needed', () => {
  const { context, elements } = setup();
  assert.ok(!elements.has('youtube-api'));
  vm.runInContext("startHeroLiveVideo('abcdefghijk')", context);
  assert.equal(elements.get('youtube-api').src, 'https://www.youtube.com/iframe_api');
});

test('live badge stays hidden when the channel is not live and nothing is upcoming', async () => {
  const { elements, requests } = setup({ live: { live: false }, upcoming: { upcoming: null } });
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.ok(requests.includes('/api/live'));
  assert.ok(requests.some((u) => u.includes('/upcoming')));
  const badge = elements.get('live-badge');
  assert.equal(badge.style.display, 'none');
  assert.equal(badge.hidden, true);
});

test('live badge shows EN VIVO and links to the stream when /api/live reports live', async () => {
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  const { elements, requests } = setup({ live: { live: true, url } });
  await new Promise(setImmediate);
  assert.ok(requests.includes('/api/live'));
  assert.ok(!requests.some((u) => u.includes('/upcoming')));
  const badge = elements.get('live-badge');
  const label = elements.get('live-badge-label');
  assert.equal(badge.style.display, 'inline-flex');
  assert.equal(badge.hidden, false);
  assert.equal(badge.href, url);
  assert.equal(badge.target, '_blank');
  assert.equal(label.textContent, 'En vivo');
  assert.equal(label.dataset.en, 'Live');
  assert.ok(!badge.classList.contains('is-soon'));
});

test('going-live uses the same pill with Pronto / Soon from /api/upcoming', async () => {
  const when = '2026-10-13T23:00:00.000Z';
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  const { elements, requests } = setup({
    live: { live: false },
    upcoming: { upcoming: { url, scheduledStartTime: when, title: 'Culto' } },
  });
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.ok(requests.some((u) => u.includes('/upcoming')));
  const badge = elements.get('live-badge');
  const label = elements.get('live-badge-label');
  const meta = elements.get('live-badge-meta');
  assert.equal(badge.style.display, 'inline-flex');
  assert.equal(badge.href, url);
  assert.equal(label.textContent, 'Pronto');
  assert.equal(label.dataset.en, 'Soon');
  assert.ok(badge.classList.contains('is-soon'));
  assert.ok(meta.textContent.length > 0);
});
