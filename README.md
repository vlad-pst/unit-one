<div align="center">

# Amsterdam Housing Tracker

#### Hunt Amsterdam rentals from a single page.

A scheduled agent scrapes the listing sites every day and writes the results straight into the dashboard. You triage what lands through a simple status pipeline: starred, queued, referenced, sent, pass.

### &nbsp;[**→ Open the live dashboard**](https://unit001.vercel.app)&nbsp;

[![live](https://img.shields.io/badge/live-unit001.vercel.app-c2410c?style=for-the-badge&logo=vercel&logoColor=white)](https://unit001.vercel.app)
&nbsp;&nbsp;
[![license](https://img.shields.io/badge/license-AGPL--3.0-2b2420?style=for-the-badge)](LICENSE)
&nbsp;&nbsp;
[![tests](https://img.shields.io/badge/tests-45%20passing-7c7f5a?style=for-the-badge)](tests)

</div>

---

## Run it

Open `tracker.html` in any browser. No build, no server, no install.

## How it works

- `tracker.html` holds the page markup and the listing data, stored as inline JSON blocks.
- `src/styles.css` and `src/js/` hold the styling and logic (plain classic scripts, no build step).
- A daily scheduled agent updates only the JSON blocks in `tracker.html`.
- Your per-listing statuses are saved locally in the browser (localStorage).

## Sources

- Student Experience NDSM (studios)
- Hausing Amsterdam (apartments)
- Pararius (planned, not yet wired in)

## Layout

```
tracker.html        page + inline listing data (the daily agent edits this)
src/styles.css      styles
src/js/             data, status, render, hero, main
tests/              logic, data, pipeline, animation, and browser tests
docs/               plans and notes
pararius-worker/    Cloudflare Worker for auto-applying (separate subproject)
pararius-mac-react/ local Mac auto-react script (separate subproject)
archive/            old versions kept for reference
```

## Tests

```
node --test tests/*.test.js     # logic, data, pipeline (no install)
npm install && npx playwright install chromium && npm run test:e2e   # browser
```

See `tests/README.md` for what each suite covers.

## License

AGPL-3.0. You may use, modify, and self-host this, but anything you run as a
network service built on it must publish its full source. See `LICENSE`.
