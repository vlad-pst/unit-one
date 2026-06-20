/* Zero-dependency app loader for tests.
 *
 * The app ships as classic <script> files that share one global scope in the
 * browser. To test the real logic without a browser or jsdom (npm is offline),
 * we concatenate the JS files in load order and run them in one vm context over
 * a minimal captured-DOM shim. Table bodies capture their assigned innerHTML as
 * a string, which is enough to assert what got rendered.
 *
 * Usage:
 *   const { loadApp } = require('./helpers/load-app');
 *   const app = loadApp();              // fresh data from tracker.html
 *   app.window.drawH();
 *   app.html('h-body');                 // captured innerHTML string
 *   app.rows('h-body');                 // <tr> count
 *   const app2 = loadApp({ mutate(d){ d.hD.listings.x.address = '...'; } });
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const JS_FILES = ['src/js/data.js', 'src/js/status.js', 'src/js/render.js', 'src/js/hero.js', 'src/js/main.js'];

function readHtml() { return fs.readFileSync(path.join(ROOT, 'tracker.html'), 'utf8'); }

function jsonBlock(html, id) {
  const m = html.match(new RegExp('<script id="' + id + '" type="application/json">([\\s\\S]*?)</script>'));
  return m ? m[1] : null;
}

function loadApp(opts = {}) {
  const html = readHtml();
  const blocks = {
    'se-data': jsonBlock(html, 'se-data'),
    'hausing-data': jsonBlock(html, 'hausing-data'),
    'pararius-data': jsonBlock(html, 'pararius-data'),
  };
  const captured = {};
  const noop = () => {};
  const Obs = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };

  const makeEl = (id) => ({
    _id: id,
    set innerHTML(v) { captured[id] = v; },
    get innerHTML() { return captured[id] || ''; },
    textContent: '', value: '', style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    closest: () => null, addEventListener: noop, removeEventListener: noop,
    appendChild: noop, querySelector: () => null, querySelectorAll: () => [],
    getAttribute: () => null, setAttribute: noop, focus: noop,
    getBoundingClientRect: () => ({ top: 0, height: 0, bottom: 0 }),
  });

  const elCache = {};
  const document = {
    getElementById(id) {
      if (id in blocks && blocks[id] != null) return { textContent: blocks[id] };
      return elCache[id] || (elCache[id] = makeEl(id));
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (t) => makeEl('new-' + t),
    addEventListener: noop, removeEventListener: noop,
    documentElement: makeEl('html'), body: makeEl('body'),
    readyState: 'complete',
  };

  const store = new Map();
  if (opts.seed) for (const [k, v] of Object.entries(opts.seed)) store.set(k, String(v));
  const sb = {
    console, Date, Math, JSON, Set, Map, Array, Object, String, Number,
    parseInt, parseFloat, isNaN, RegExp, setTimeout: noop, clearTimeout: noop,
    document,
    history: { replaceState: noop, pushState: noop },
    location: { href: 'file://', hash: '' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    scrollTo: noop, scrollY: 0, pageYOffset: 0, innerHeight: 800,
    addEventListener: noop, removeEventListener: noop,
    getComputedStyle: () => ({}), matchMedia: () => ({ matches: false, addEventListener: noop }),
    performance: { now: () => 0 },
    IntersectionObserver: Obs, MutationObserver: Obs, ResizeObserver: Obs,
  };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);

  let code = JS_FILES.map((f) => '\n//=== ' + f + ' ===\n' + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  // expose hooks to reach in-scope globals (const declarations don't attach to the context object)
  code += '\n;globalThis.__app = { get seD(){return seD;}, get hD(){return hD;}, get pD(){return pD;},'
        + ' getStatus, setStatus, STATUS_ORDER, parsePrice, isHiddenExpired, computeStats,'
        + ' drawSE, drawH, drawP, drawGlobal, esc, fmtD,'
        + ' togglePriceSort, toggleStatusSort,'
        + ' get sortPrice(){return _sortPrice;}, get sortStatus(){return _sortStatus;} };';

  vm.runInContext(code, sb, { filename: 'app-concat.js' });

  if (opts.mutate) opts.mutate(sb.__app);

  return {
    window: sb.__app,
    raw: sb,
    localStore: store,
    html: (id) => captured[id] || '',
    rows: (id) => (String(captured[id] || '').match(/<tr/g) || []).length,
    captured,
    blocks,
    parsed: {
      se: JSON.parse(blocks['se-data']),
      h: JSON.parse(blocks['hausing-data']),
      p: JSON.parse(blocks['pararius-data']),
    },
  };
}

module.exports = { loadApp, jsonBlock, readHtml, ROOT };
