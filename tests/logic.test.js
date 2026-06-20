/* P0 behavioral tests — run the REAL render/status code over controlled data.
 * Zero dependencies: node --test tests/logic.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const today = new Date().toISOString().slice(0, 10);

// Return the <tr>…</tr> chunk that contains a given href, so we can inspect one row.
function rowFor(html, href) {
  const i = html.indexOf(href);
  if (i < 0) return '';
  const start = html.lastIndexOf('<tr', i);
  const end = html.indexOf('</tr>', i);
  return html.slice(start, end + 5);
}
// Render order = order hrefs appear in the table body.
function hrefIndex(html, href) { return html.indexOf(href); }

// ── STATUS_ORDER ────────────────────────────────────────────────────────────
test('STATUS_ORDER ranks starred < queued < referenced < sent < pass < blank', () => {
  const o = loadApp().window.STATUS_ORDER;
  assert.ok(o.starred < o.queued && o.queued < o.referenced && o.referenced < o.sent && o.sent < o.pass && o.pass < o['']);
});

// ── parsePrice ──────────────────────────────────────────────────────────────
test('parsePrice extracts numeric magnitude and orders correctly', () => {
  const { parsePrice } = loadApp().window;
  assert.equal(parsePrice('€2600'), 2600);
  assert.equal(parsePrice('€ 1,046*'), 1046);
  assert.ok(parsePrice('€2600') > parsePrice('€2500'));
});

// ── isHiddenExpired (2-day rule) ─────────────────────────────────────────────
test('isHiddenExpired hides rows expired 2+ days, keeps recent/active', () => {
  const { isHiddenExpired } = loadApp().window;
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  assert.equal(isHiddenExpired({ expired: true, expired_since: d(3) }), true);
  assert.equal(isHiddenExpired({ expired: true, expired_since: d(0) }), false);
  assert.equal(isHiddenExpired({ expired: false }), false);
});

// ── localStorage migration ───────────────────────────────────────────────────
test('legacy status names migrate (interested→starred, applied→sent)', () => {
  const app = loadApp({ seed: { oa_h_st: JSON.stringify({ a: 'interested', b: 'applied' }) } });
  assert.equal(app.window.getStatus('h', 'a'), 'starred');
  assert.equal(app.window.getStatus('h', 'b'), 'sent');
});

// ── THE REGRESSION: "new" is driven by newS (latest check), not by today ─────
test('new-detection uses newS, not first_seen===today', () => {
  // pick two student-friendly listings
  const probe = loadApp();
  const ids = Object.keys(probe.window.hD.listings).filter((id) => probe.window.hD.listings[id].studentsAllowed === 'yes');
  const [idNew, idFakeNew] = ids;

  const app = loadApp({
    mutate(d) {
      const h = d.hD;
      h.checks[h.checks.length - 1].new_ids = [idNew];   // only idNew is "new" per the data
      h.listings[idNew].available_listing = true;
      h.listings[idNew].expired = false;
      // idFakeNew: first_seen is literally today but NOT in new_ids
      h.listings[idFakeNew].first_seen = today;
      h.listings[idFakeNew].available_listing = true;
      h.listings[idFakeNew].expired = false;
    },
  });
  app.window.drawH();
  const html = app.html('h-body');
  assert.match(rowFor(html, app.window.hD.listings[idNew].href), /b-new/, 'listing in new_ids must carry the New badge');
  assert.doesNotMatch(rowFor(html, app.window.hD.listings[idFakeNew].href), /b-new/, 'first_seen===today but not in new_ids must NOT be New');
});

// ── new floats to the top of its group ───────────────────────────────────────
test('a new, unassigned listing floats to the top of its students-Yes group', () => {
  const probe = loadApp();
  const studentIds = Object.keys(probe.window.hD.listings).filter((id) => probe.window.hD.listings[id].studentsAllowed === 'yes' && !probe.window.isHiddenExpired(probe.window.hD.listings[id]));
  const pick = studentIds[studentIds.length - 1]; // pick one that isn't already first

  const app = loadApp({
    mutate(d) {
      const h = d.hD;
      h.checks[h.checks.length - 1].new_ids = [pick];
      h.listings[pick].available_listing = true;
      h.listings[pick].expired = false;
    },
  });
  app.window.drawH();
  const html = app.html('h-body');
  const pickIdx = hrefIndex(html, app.window.hD.listings[pick].href);
  // no other student listing should render before it
  const earlier = studentIds
    .filter((id) => id !== pick)
    .some((id) => { const i = hrefIndex(html, app.window.hD.listings[id].href); return i >= 0 && i < pickIdx; });
  assert.equal(earlier, false, 'the new listing should be first in the student group');
});

// ── students Yes/No split + divider ──────────────────────────────────────────
test('student listings render before the divider, non-student after', () => {
  const app = loadApp();
  app.window.drawH();
  const html = app.html('h-body');
  assert.match(html, /no-student-divider/, 'a divider row should exist');
  const divIdx = html.indexOf('no-student-divider');
  const L = app.window.hD.listings;
  const visible = Object.keys(L).filter((id) => !app.window.isHiddenExpired(L[id]));
  const aYes = visible.find((id) => L[id].studentsAllowed === 'yes' && html.includes(L[id].href));
  const aNo = visible.find((id) => L[id].studentsAllowed !== 'yes' && html.includes(L[id].href));
  if (aYes) assert.ok(hrefIndex(html, L[aYes].href) < divIdx, 'student listing before divider');
  if (aNo) assert.ok(hrefIndex(html, L[aNo].href) > divIdx, 'non-student listing after divider');
});

// ── expired 2+ days are hidden from the table ────────────────────────────────
test('a listing expired 3 days ago is not rendered', () => {
  const probe = loadApp();
  const id = Object.keys(probe.window.hD.listings)[0];
  const d3 = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const app = loadApp({ mutate(dd) { const l = dd.hD.listings[id]; l.expired = true; l.expired_since = d3; l.available_listing = false; } });
  app.window.drawH();
  assert.equal(app.html('h-body').includes(app.window.hD.listings[id].href), false);
});

// ── XSS: scraped fields are escaped ──────────────────────────────────────────
test('hostile scraped address is HTML-escaped, not injected', () => {
  const probe = loadApp();
  const id = Object.keys(probe.window.hD.listings).find((x) => !probe.window.isHiddenExpired(probe.window.hD.listings[x]));
  const app = loadApp({ mutate(d) { d.hD.listings[id].address = '<img src=x onerror=alert(1)>'; } });
  app.window.drawH();
  const html = app.html('h-body');
  assert.equal(html.includes('<img src=x onerror'), false, 'raw markup must not appear');
  assert.ok(html.includes('&lt;img'), 'escaped form must appear');
});

// ── price sort ⇄ status sort are mutually exclusive ──────────────────────────
test('toggling price sort disables status sort and vice-versa', () => {
  const app = loadApp();
  app.window.togglePriceSort('h');
  assert.equal(app.window.sortStatus.h, 'none', 'status sort off after price toggle');
  app.window.toggleStatusSort('h');
  assert.equal(app.window.sortPrice.h, 'none', 'price sort off after status toggle');
});

// ── computeStats reflects a 'sent' status ────────────────────────────────────
test('computeStats counts a sent listing under app', () => {
  const probe = loadApp();
  const id = Object.keys(probe.window.hD.listings)[0];
  const app = loadApp();
  const before = app.window.computeStats('h', app.window.hD, true).app;
  app.window.setStatus('h', id, { value: 'sent', className: '', closest: () => null });
  const after = app.window.computeStats('h', app.window.hD, true).app;
  assert.equal(after, before + 1);
});

// ── fmtD handles ISO, worded dates, and never shows "Invalid Date" ───────────
test('fmtD formats ISO and worded dates, falls back to raw on garbage', () => {
  const { fmtD } = loadApp().window;
  assert.match(fmtD('2026-06-14'), /14 Jun 2026/);     // ISO
  assert.match(fmtD('14 June 2026'), /14 Jun 2026/);   // worded (the 2202 bug)
  assert.equal(fmtD(''), '—');                          // empty
  assert.equal(fmtD('not a date'), 'not a date');       // unparseable -> raw, not "Invalid Date"
});
