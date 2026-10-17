const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const eventsHtml = fs.readFileSync(path.join(root, 'events.html'), 'utf8');

const NOV6_ROW_HOME = `        <div class="event-row reveal" data-end="2026-11-06">
          <div class="event-date-box">
            <span class="event-date-num">6</span>
            <span class="event-date-month">NOV</span>
          </div>
          <div class="event-info">
            <h3 class="event-title">Eikon Men</h3>
            <p class="event-details" data-en="Friday · Men's Event · 7:30 PM">Viernes · Evento de Hombres · 7:30 PM</p>
          </div>
        </div>`;

const NOV6_ROW_EVENTS = `        <div class="event-row" data-end="2026-11-06" data-date="2026-11-06">
          <div class="event-date-box">
            <span class="event-date-num">6</span>
            <span class="event-date-month">NOV</span>
          </div>
          <div class="event-info">
            <h3 class="event-title">Eikon Men</h3>
            <p class="event-details" data-en="Friday · Men's Event · 7:30 PM">Viernes · Evento de Hombres · 7:30 PM</p>
          </div>
        </div>`;

function between(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, startMarker);
  assert.notEqual(end, -1, endMarker);
  return html.slice(start, end);
}

function walk(dir, hits, skipNames) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'tests') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full, hits, skipNames);
      continue;
    }
    if (skipNames.has(name)) continue;
    if (/\.(png|jpe?g|webp|ico|gif)$/i.test(name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (/eikon/i.test(text)) hits.push(path.relative(root, full));
  }
}

test('October 16 Eikon Men is calendar-only', () => {
  const archive = between(eventsHtml, 'id="calendar-only-events"', 'id="events-list-view"');
  assert.match(archive, /data-date="2026-10-16"/);
  assert.match(archive, /data-end="2026-10-16"/);
  assert.match(archive, />Eikon Men</);
  assert.equal((archive.match(/Eikon Men/g) || []).length, 1);
  assert.doesNotMatch(archive, /2026-11-06/);

  const homeUpcoming = between(indexHtml, 'id="events-upcoming"', 'id="events-empty"');
  const list = between(eventsHtml, 'id="events-list-view"', '</main>');
  assert.doesNotMatch(homeUpcoming, /2026-10-16/);
  assert.doesNotMatch(list, /2026-10-16/);
  assert.match(eventsHtml, /closest\('#calendar-only-events'\)/);
  assert.match(eventsHtml, /#calendar-only-events \[data-date\]/);
});

test('November 6 Eikon Men is back on both upcoming lists and the calendar', () => {
  const homeUpcoming = between(indexHtml, 'id="events-upcoming"', 'id="events-empty"');
  const list = between(eventsHtml, 'id="events-upcoming"', 'id="events-empty"');
  assert.ok(homeUpcoming.includes(NOV6_ROW_HOME));
  assert.ok(list.includes(NOV6_ROW_EVENTS));
  assert.equal((homeUpcoming.match(/Eikon Men/g) || []).length, 1);
  assert.equal((list.match(/Eikon Men/g) || []).length, 1);
  // The list row carries data-date, which is what the calendar reads.
  assert.match(list, /data-date="2026-11-06"/);
});

test('other pages and the hero do not mention Eikon Men', () => {
  const hits = [];
  walk(root, hits, new Set(['events.html', 'index.html']));
  assert.deepEqual(hits, []);
  const head = eventsHtml.slice(0, eventsHtml.indexOf('<body'));
  assert.doesNotMatch(head, /eikon/i);
  assert.doesNotMatch(between(indexHtml, 'id="hero"', 'id="eventos"'), /eikon/i);
});

test('other events stay on the upcoming list', () => {
  const list = between(eventsHtml, 'id="events-upcoming"', 'id="events-empty"');
  for (const title of [
    'Respuesta De Gracia',
    'Reunión Empresarial',
    'Ayuno Congregacional',
    'Gracias Por Servir',
    'Frutos',
    'Ensanchamiento 2027',
  ]) {
    assert.ok(list.includes(title), title);
  }
  for (const date of ['2026-11-13', '2026-10-23', '2026-11-06', '2026-11-08', '2026-11-25', '2026-12-23', '2026-12-27']) {
    assert.ok(list.includes(`data-date="${date}"`), date);
  }
  assert.match(between(eventsHtml, 'id="events-recurring"', '</main>'), /data-dow="1"/);
  assert.match(indexHtml, /Reunión Empresarial/);
  assert.match(indexHtml, /Respuesta De Gracia/);
});
