const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const eventsHtml = fs.readFileSync(path.join(root, 'events.html'), 'utf8');

function between(html, startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, startMarker);
  assert.notEqual(end, -1, endMarker);
  return html.slice(start, end);
}

function walk(dir, hits) {
  for (const name of fs.readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === 'tests') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full, hits);
      continue;
    }
    if (name === 'events.html') continue;
    if (/\.(png|jpe?g|webp|ico|gif)$/i.test(name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (/eikon/i.test(text)) hits.push(path.relative(root, full));
  }
}

test('non-calendar pages do not mention Eikon Men', () => {
  const hits = [];
  walk(root, hits);
  assert.deepEqual(hits, []);
});

test('the events list, hero, and page metadata do not mention Eikon Men', () => {
  const withoutCalendarOnly =
    eventsHtml.slice(0, eventsHtml.indexOf('id="calendar-only-events"')) +
    eventsHtml.slice(eventsHtml.indexOf('id="events-list-view"'));
  assert.doesNotMatch(withoutCalendarOnly, /eikon/i);
  assert.doesNotMatch(between(eventsHtml, 'id="events-list-view"', '</main>'), /eikon/i);
  assert.doesNotMatch(indexHtml, /eikon/i);
});

test('the calendar keeps the October 16 Eikon Men entry', () => {
  const archive = between(eventsHtml, 'id="calendar-only-events"', 'id="events-list-view"');
  assert.match(archive, /data-date="2026-10-16"/);
  assert.match(archive, /data-end="2026-10-16"/);
  assert.match(archive, />Eikon Men</);
  assert.match(archive, /Friday · Men's Event · 7:30 PM/);
  assert.match(archive, /Viernes · Evento de Hombres · 7:30 PM/);
  // November 6 is the same program and lives only in this calendar source.
  assert.match(archive, /data-date="2026-11-06"/);
  assert.match(eventsHtml, /closest\('#calendar-only-events'\)/);
  assert.match(eventsHtml, /#calendar-only-events \[data-date\]/);
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
  for (const date of ['2026-11-13', '2026-10-23', '2026-11-08', '2026-11-25', '2026-12-23', '2026-12-27']) {
    assert.ok(list.includes(`data-date="${date}"`), date);
  }
  assert.match(between(eventsHtml, 'id="events-recurring"', '</main>'), /data-dow="1"/);
  assert.match(indexHtml, /Reunión Empresarial/);
  assert.match(indexHtml, /Respuesta De Gracia/);
  assert.doesNotMatch(between(indexHtml, 'id="events-upcoming"', 'id="events-empty"'), /eikon/i);
});
