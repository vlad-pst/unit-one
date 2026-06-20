/* Data-contract tests — the three inline JSON blocks are the pipeline's output
 * and every other layer depends on them. Zero deps: node --test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readHtml, jsonBlock } = require('./helpers/load-app');

const html = readHtml();
const se = JSON.parse(jsonBlock(html, 'se-data'));
const h = JSON.parse(jsonBlock(html, 'hausing-data'));
const p = JSON.parse(jsonBlock(html, 'pararius-data'));

// Known, frozen historical glitch (append-only history, will not recur):
// 2026-06-05 logged `krommertstraat` in new_ids without it being in listing_ids.
const KNOWN_NEWID_GLITCHES = 1;

test('all three blocks parse and have the expected top-level shape', () => {
  assert.deepEqual(Object.keys(se).sort(), ['checks', 'last_checked', 'studios']);
  assert.deepEqual(Object.keys(h).sort(), ['checks', 'last_checked', 'listings']);
  assert.ok('listings' in p && 'checks' in p); // stub
});

test('SE studios carry required fields', () => {
  for (const [id, s] of Object.entries(se.studios)) {
    for (const k of ['id', 'href', 'name', 'price', 'first_seen', 'last_seen', 'available', 'expired']) {
      assert.ok(k in s, `studio ${id} missing ${k}`);
    }
  }
});

test('Hausing listings carry required fields and a valid studentsAllowed enum', () => {
  for (const [id, l] of Object.entries(h.listings)) {
    for (const k of ['id', 'href', 'address', 'neighborhood', 'price', 'studentsAllowed', 'first_seen', 'last_seen', 'available_listing', 'expired']) {
      assert.ok(k in l, `listing ${id} missing ${k}`);
    }
    assert.ok(['yes', 'no', 'unknown'].includes(l.studentsAllowed), `listing ${id} bad studentsAllowed: ${l.studentsAllowed}`);
  }
});

// availability is the exact inverse of expired (they must never diverge)
test('SE: available === !expired for every studio', () => {
  for (const [id, s] of Object.entries(se.studios)) {
    assert.equal(s.available, !s.expired, `studio ${id}: available=${s.available} expired=${s.expired}`);
  }
});
test('Hausing: available_listing === !expired for every listing', () => {
  for (const [id, l] of Object.entries(h.listings)) {
    assert.equal(l.available_listing, !l.expired, `listing ${id}: available_listing=${l.available_listing} expired=${l.expired}`);
  }
});

// referential + temporal integrity, both datasets
for (const [name, d, key, idkey] of [['se', se, 'studios', 'studio_ids'], ['hausing', h, 'listings', 'listing_ids']]) {
  test(`${name}: every id referenced in checks exists in ${key}{}`, () => {
    const ids = new Set(Object.keys(d[key]));
    for (const c of d.checks) {
      for (const x of [...(c[idkey] || []), ...(c.new_ids || []), ...(c.gone_ids || [])]) {
        assert.ok(ids.has(x), `check ${c.date} references unknown id ${x}`);
      }
    }
  });

  test(`${name}: check dates are non-decreasing`, () => {
    let prev = '0000-00-00';
    for (const c of d.checks) { assert.ok(c.date >= prev, `date regressed at ${c.date}`); prev = c.date; }
  });

  test(`${name}: gone_ids are disjoint from that check's id list`, () => {
    for (const c of d.checks) {
      const cur = new Set(c[idkey] || []);
      for (const x of (c.gone_ids || [])) assert.ok(!cur.has(x), `${c.date}: gone id ${x} also listed present`);
    }
  });

  test(`${name}: expired items have an expired_since date`, () => {
    for (const [id, it] of Object.entries(d[key])) {
      if (it.expired === true) assert.ok(it.expired_since, `${id} expired without expired_since`);
    }
  });

  test(`${name}: no orphan items (every item appears in some check)`, () => {
    const seen = new Set();
    d.checks.forEach((c) => (c[idkey] || []).forEach((x) => seen.add(x)));
    const orphans = Object.keys(d[key]).filter((x) => !seen.has(x));
    assert.equal(orphans.length, 0, `orphans: ${orphans.join(', ')}`);
  });
}

test('Hausing new_ids ⊆ listing_ids, except the one frozen historical glitch', () => {
  let violations = 0;
  for (const c of h.checks) {
    const cur = new Set(c.listing_ids || []);
    for (const x of (c.new_ids || [])) if (!cur.has(x)) violations++;
  }
  assert.equal(violations, KNOWN_NEWID_GLITCHES, 'a NEW new_ids/listing_ids inconsistency appeared — investigate the latest pipeline run');
});

test('latest Hausing check is internally consistent (new_ids ⊆ listing_ids)', () => {
  const c = h.checks[h.checks.length - 1];
  const cur = new Set(c.listing_ids || []);
  for (const x of (c.new_ids || [])) assert.ok(cur.has(x), `latest check new id ${x} not in listing_ids`);
});
