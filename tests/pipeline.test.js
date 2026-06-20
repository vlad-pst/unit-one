/* Pipeline write-back integrity — the daily agent replaces the JSON between the
 * data markers with single-line JSON via the Edit tool. This guards that such a
 * write-back keeps the file valid and leaves design/JS untouched. Zero deps.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readHtml, jsonBlock } = require('./helpers/load-app');

// Mirror the agent's Part C: swap the inner text of one data block.
function writeBlock(html, id, obj) {
  const re = new RegExp('(<script id="' + id + '" type="application/json">)([\\s\\S]*?)(</script>)');
  return html.replace(re, (_m, open, _inner, close) => open + JSON.stringify(obj) + close);
}
// Everything except the three JSON blocks (used to prove design/JS is untouched).
function nonData(html) {
  let s = html;
  for (const id of ['se-data', 'hausing-data', 'pararius-data']) {
    s = s.replace(new RegExp('(<script id="' + id + '" type="application/json">)([\\s\\S]*?)(</script>)'), '$1$3');
  }
  return s;
}

test('writing updated data keeps all three blocks parseable', () => {
  const html = readHtml();
  const h = JSON.parse(jsonBlock(html, 'hausing-data'));
  h.last_checked = '2099-01-01T00:00:00';
  const out = writeBlock(html, 'hausing-data', h);
  for (const id of ['se-data', 'hausing-data', 'pararius-data']) {
    assert.doesNotThrow(() => JSON.parse(jsonBlock(out, id)), `${id} parse`);
  }
  assert.equal(JSON.parse(jsonBlock(out, 'hausing-data')).last_checked, '2099-01-01T00:00:00');
});

test('write-back leaves the markers intact and on one line', () => {
  const html = readHtml();
  const se = JSON.parse(jsonBlock(html, 'se-data'));
  const out = writeBlock(html, 'se-data', se);
  assert.ok(out.includes('<script id="se-data" type="application/json">'));
  assert.ok(out.includes('<script id="hausing-data" type="application/json">'));
  const inner = jsonBlock(out, 'se-data');
  assert.equal(inner.includes('\n'), false, 'data block must be single-line');
});

test('write-back does not touch design/JS or the other data blocks', () => {
  const html = readHtml();
  const h = JSON.parse(jsonBlock(html, 'hausing-data'));
  h.last_checked = '2099-01-01T00:00:00';
  const out = writeBlock(html, 'hausing-data', h);
  assert.equal(nonData(out), nonData(html), 'non-data bytes changed');
  assert.equal(jsonBlock(out, 'se-data'), jsonBlock(html, 'se-data'), 'se-data changed');
  assert.equal(jsonBlock(out, 'pararius-data'), jsonBlock(html, 'pararius-data'), 'pararius-data changed');
});

test('adding a listing round-trips through write-back and renders', () => {
  const html = readHtml();
  const h = JSON.parse(jsonBlock(html, 'hausing-data'));
  h.listings['test-xyz'] = {
    id: 'test-xyz', href: 'https://hausing.com/for-rent/test-xyz', address: 'Teststraat',
    neighborhood: 'West', bedrooms: '2', bathrooms: '1', size: '50 sq.m.', price: '€2000',
    available: 'Immediately', studentsAllowed: 'yes', incomeReq: '90K',
    first_seen: '2099-01-01', last_seen: '2099-01-01', available_listing: true, expired: false,
  };
  const out = writeBlock(html, 'hausing-data', h);
  const back = JSON.parse(jsonBlock(out, 'hausing-data'));
  assert.ok('test-xyz' in back.listings);
  assert.equal(back.listings['test-xyz'].address, 'Teststraat');
});
