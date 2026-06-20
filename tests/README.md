# Tests

Two tracks. Track A needs nothing but Node and runs anywhere. Track B needs a real browser.

## Track A — logic / data / pipeline (zero dependencies)

Runs on Node's built-in test runner, no `npm install` required.

```bash
node --test tests/*.test.js
```

- `tests/helpers/load-app.js` — loads the real `js/*` files into one scope over a captured-DOM shim, so tests exercise the actual render/status code without a browser.
- `tests/logic.test.js` — P0 behavior: the newS regression (new = latest check, not calendar date), students Yes/No split, expired-2-day hide, XSS escaping, status migrations, price/status sort exclusivity, computeStats.
- `tests/data-contract.test.js` — schema, referential + temporal integrity, gone/new id rules, no orphans. One frozen historical glitch is baselined (krommertstraat, 2026-06-05); a *new* violation turns the test red.
- `tests/pipeline.test.js` — write-back integrity: replacing a data block keeps the file valid, single-line, and leaves design/JS + other blocks untouched (mirrors what the daily agent does).
- `tests/amsterdam-animation.test.js` — wordmark animation regression, asserted against the real `tracker.html` / `styles.css` / `js/hero.js`.

## Track B — end-to-end + accessibility (Playwright)

Needs a one-time install (the build sandbox can't reach npm; run this on your machine):

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

`tests/e2e/app.spec.js` drives a real Chromium against a local static server: renders all three tables, wordmark present, status persists across reload, the "new" filter narrows, price-sort activates, scrolling sinks the wordmark, and an axe scan finds no serious/critical a11y violations.

## Everything

```bash
npm run test:all   # Track A then Track B
```
