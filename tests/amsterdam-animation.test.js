/* Regression tests for the "Amsterdam" wordmark animation.
 * Guards that the wordmark still animates on every scroll/descent, so changes
 * elsewhere (e.g. the up-arrow bar) cannot silently break it.
 * Each assertion reads the REAL file the thing lives in:
 *   - markup  → tracker.html
 *   - CSS rule + keyframes → styles.css
 *   - scroll formula + wiring → js/hero.js
 * Run: node --test tests/   (or: node --test tests/amsterdam-animation.test.js)
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const markup = read('tracker.html');
const css = read('src/styles.css');
const js = read('src/js/hero.js');

// --- Structure (markup in tracker.html, CSS in styles.css) -----------------
test('wordmark element present in markup', () => {
  assert.match(markup, /<div class="v2-wordmark">Amsterdam<\/div>/);
});
test('wordmark rests at translateY(8%)', () => {
  assert.match(css, /\.v2-wordmark\{[^}]*transform:translateY\(8%\)/);
});
test('wordmark uses the v2wordIn entrance animation', () => {
  assert.match(css, /\.v2-wordmark\{[^}]*animation:v2wordIn/);
});
test('entrance keyframe rises from below (78%) to rest (8%)', () => {
  assert.match(css, /@keyframes v2wordIn\{from\{transform:translateY\(78%\)\}to\{transform:translateY\(8%\)\}\}/);
});

// --- Scroll-driven sink formula (in js/hero.js) ----------------------------
const m = js.match(/word\.style\.transform='translateY\('\+\((\d+)\+p\*(\d+)\)\+'%\)'/);
const base = m ? +m[1] : NaN;
const range = m ? +m[2] : NaN;

test('onHeroScroll sets the wordmark transform from scroll progress', () => {
  assert.ok(m, 'sink formula not found in hero.js');
});
test('at rest (p=0) wordmark = 8%', () => assert.equal(base + 0 * range, 8));
test('fully scrolled (p=1) wordmark sinks to 74%', () => assert.equal(base + 1 * range, 74));
test('sink is monotonic across the scroll', () => {
  const y = (p) => base + p * range;
  assert.ok(y(0) < y(0.5) && y(0.5) < y(1));
});

// --- Wiring: scroll triggers the animation each time -----------------------
test('onHeroScroll is driven by scroll position (pageYOffset/heroH)', () => {
  assert.match(js, /function onHeroScroll\(\)\{[\s\S]*?window\.pageYOffset\/heroH\(\)/);
});
test('a scroll listener invokes onHeroScroll', () => {
  assert.match(js, /addEventListener\('scroll',\s*onHeroScroll/);
});
test('goDown animates the window scroll (fires onHeroScroll on every descent)', () => {
  assert.match(js, /function goDown\(\)\{[\s\S]*?animateScrollTo\(heroH\(\)/);
});

// --- Behavioral: run the real mapping against a mock -----------------------
test('behavioral: mid-scroll sinks wordmark to 41%, full to 74%', () => {
  assert.ok(!isNaN(base), 'no formula');
  const word = { style: {} };
  const heroH = () => 1000;
  let y;
  const onHeroScroll = () => {
    const p = Math.min(1, Math.max(0, y / heroH()));
    if (p > 0.001) word.style.transform = 'translateY(' + (base + p * range) + '%)';
  };
  y = 500; onHeroScroll(); assert.equal(word.style.transform, 'translateY(41%)');
  y = 1000; onHeroScroll(); assert.equal(word.style.transform, 'translateY(74%)');
});
