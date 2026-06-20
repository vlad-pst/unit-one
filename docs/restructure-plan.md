# Structure Plan — simple split, no build, scheduled-agent untouched

> Status: PROPOSAL v2 (simplified). Supersedes the Vite/dist/multi-data-file version.
> Driving constraint: the daily scheduled agent must keep working with zero changes.

## 1. The constraint that decides everything

The `se-ndsm-daily-check` agent (`~/Claude/Scheduled/se-ndsm-daily-check/SKILL.md`) runs autonomously every day and:

- Reads `tracker.html` at the **hardcoded path** `~/CodingProjects/unit-one/tracker.html`.
- Replaces the content between `<script id="se-data" type="application/json">` … `</script>` and the `hausing-data` equivalent with **single-line JSON**, via the **Edit tool**.
- Reports `file:///…/tracker.html`. Touches nothing else.

Therefore the structure must preserve, exactly: the file path, the two `<script id="…-data">` markers, the single-line-JSON-inline convention, and the ability to open from `file://`. Anything that adds a step (build) or splits data across files multiplies the chance an unattended agent run fails or corrupts state. **We don't do that.**

## 2. Target structure (no build step)

```
unit-one/                          # repo root
├── tracker.html                   # markup + the TWO inline JSON data blocks
│                                  #   ← scheduled agent edits ONLY these blocks, same as today
├── styles.css                     # the <style> block, lifted out
├── js/
│   ├── data.js                    # read + parse the inline JSON blocks
│   ├── status.js                  # _ST, localStorage (oa_se_st/oa_h_st), migrations, STATUS_ORDER
│   ├── render.js                  # drawSE/H/P, computeStats, esc() escaping helper
│   ├── hero.js                    # wordmark animation + scroll dock/undock
│   └── main.js                    # init + wire filters/sorts (runs last)
├── tests/                         # vitest (unit/dom) + playwright (e2e/visual/a11y)
├── docs/                          # PRD.md, DESIGN.md, this plan, adr/
├── scripts/                       # optional dev helpers (NOT needed to run the app)
├── archive/                       # tracker-v1.html, tracker-v2.html (already here)
├── pararius-worker/               # unchanged sub-project (+ its own AGENTS.md)
├── pararius-mac-react/            # unchanged sub-project
├── AGENTS.md
└── README.md
```

What changed from the blob: CSS and JS leave the HTML; **data stays inline**. That's the whole idea.

## 3. How it loads (why no build is needed)

- `tracker.html` references siblings with **classic** tags: `<link rel="stylesheet" href="styles.css">` and ordered `<script src="js/data.js"></script> … <script src="js/main.js"></script>`.
- Classic `<script src>` and `<link>` **work from `file://`** (unlike ES-module `import`/`fetch`, which the browser blocks on `file://`). So the app still opens by double-clicking the file. No server, no bundler, no `dist/`.
- Load order is explicit in the HTML: `data → status → render → hero → main`. Each file is a small classic script that attaches its exports to one namespace (e.g. `window.App.status`), and `main.js` initialises on `DOMContentLoaded`.

## 4. Keeping it unit-testable without a build (UMD shim)

Each `js/*.js` ends with:
```js
if (typeof module !== 'undefined') module.exports = { /* public fns */ };
```
So the **browser** uses it as a global classic script, and **Vitest (Node)** `require()`s the same file to unit-test pure functions. One file, two consumers, zero build. (Playwright tests the real rendered page regardless.)

## 5. Scheduled agent: what changes → nothing

- Path: same. Markers: same. Inline single-line JSON: same. Edit tool: same. `file://` link: same.
- The only side effect of the split is that `tracker.html` gets **smaller**, so the agent's Read/Edit of the JSON blocks is actually easier and less error-prone.
- `AGENTS.md` adds one guardrail line: *"Automated data runs edit ONLY the two `<script id=…-data>` blocks in `tracker.html`. Never hand-edit `styles.css` or `js/*` during a data run."*

## 6. Free win folded into the split

`render.js` introduces an `esc()` helper and routes all scraped fields (`address`, `neighborhood`, `href`) through it, closing the `innerHTML` XSS vector during the move instead of as a separate task.

## 7. Migration (each step verified, reversible)

Originals are safe in `archive/`. After every step: animation test green, all JSON blocks `JSON.parse`, Playwright smoke + visual snapshot unchanged.

1. **Lift CSS** → `styles.css`, link it; confirm visual snapshot identical.
2. **Lift JS** → `js/*` by concern (`data → status → render → hero → main`), classic `<script src>` in order; confirm app behaves identically; repoint the animation test to `js/hero.js`.
3. **Add `esc()`** in `render.js` during step 2; add the hostile-fixture XSS test.
4. **Confirm scheduled agent** by dry-running its Part C edit against the new `tracker.html` (markers still match) — no SKILL.md change required.

Rollback at any step = restore `tracker.html` from `archive/` (or git, once initialised).

## 8. Fit with the starter structure

This is the `project-structure-starter.md` kit, minus what we don't need yet: `src/ → tracker.html + styles.css + js/`, plus `tests/ docs/ scripts/ AGENTS.md README.md`. No `infra/`, no `migrations/`, no `dist/`, no data-file fan-out. Add `AGENTS.md` (run/test commands + the data-run guardrail), `PRD.md`, `DESIGN.md` (data contract + module boundaries). Second `AGENTS.md` lives in `pararius-worker/`.

## 9. Why this structure (2 sentences)
Lifting CSS and JS out of the 106 KB file gives clean, independently testable units while the two JSON data blocks stay inline in `tracker.html`, so the daily scheduled agent keeps editing the exact same markers at the exact same path with zero new steps. No build and classic `<script src>` mean the app still opens straight from `file://`, so we gain maintainability and testability without adding a single moving part to the autonomous pipeline.
