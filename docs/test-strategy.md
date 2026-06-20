# Test Strategy — Housing Dashboard

> Status: PROPOSAL (iterate before adopting). Project name TBD (see naming task).
> Scope: the whole system, not just frontend logic.

## 1. Why this exists

The app is not "a webpage." It is four cooperating parts, each with its own failure mode:

1. **Browser UI** — tables, hero animation, filters, status dropdowns (what the user sees).
2. **Frontend logic** — sort / filter / status / stats / new-detection / migrations (pure-ish JS).
3. **Data layer** — the three embedded JSON blocks the pipeline writes (`se-data`, `hausing-data`, `pararius-data`). This is the contract everything else depends on.
4. **Backends** — the scraper/diff pipeline (scheduled task), the `pararius-worker` (Cloudflare auto-apply), and `pararius-mac-react` (local IMAP → open react link).

A test suite that only covers #2 leaves the most expensive bugs (corrupted data write-back, silent UI regressions, an auto-apply that stops applying) completely unguarded. This plan covers all four.

## 2. Principles

- **Test the contract, not the implementation.** Lock the JSON schema and the public API of each module; refactors should not require rewriting tests.
- **Pyramid, not ice-cream cone.** Many fast unit tests, a focused DOM/component layer, a thin E2E layer for the things only a real browser can prove (animation, scroll, paint, a11y).
- **Every fixed bug becomes a regression test.** The `newS`-vs-`today` sort bug and the wordmark animation are the first two entries.
- **Fixtures are first-class.** One canonical set of listing fixtures (normal, new, gone, expired, malformed, empty) drives every layer.
- **CI is the gate.** Nothing is "tested" until it runs in GitHub Actions on every push.

## 3. Layers & tooling

| Layer | Tool | Runs against | Speed |
|---|---|---|---|
| Unit (pure logic) | **Vitest** | extracted `src/js/*` modules | ms |
| Component / DOM | **Vitest + jsdom** (or `@testing-library/dom`) | render functions into a jsdom DOM | ms |
| Data contract | **Vitest + Zod** schema | live JSON blocks + pipeline output fixtures | ms |
| E2E / UI / UX | **Playwright** | real Chromium, the built `dist/tracker.html` | sec |
| Visual regression | **Playwright snapshots** | hero states, tables, status colors | sec |
| Accessibility | **axe-core** (via Playwright) | rendered page | sec |
| Worker | **Vitest + workerd/Miniflare**, mocked puppeteer | `pararius-worker/src` | ms–sec |
| Python script | **pytest** + sample `.eml` fixtures | `pararius-mac-react` | ms |

Single source of truth for the JS schema = the same Zod model imported by the data-contract tests, the pipeline write-back, and (optionally) a runtime dev-only guard.

## 4. Coverage map (component → risk → layer → priority)

### Frontend logic — P0
- New-detection: item in latest check's `new_ids` floats to top of its group; clears on next check. *(regression: the bug we just fixed)*
- Status: set/get, `STATUS_ORDER` ranking, price-sort ⇄ status-sort mutual exclusivity.
- Migrations: `interested→starred` etc. map; `oa_migration_v2` one-time `queued` wipe; idempotent on re-run.
- Stats: `computeStats` totals (new/applied/active/expired) per source and combined.
- Hausing students Yes/No split: correct grouping and divider index at the boundary.
- Expired: `isHiddenExpired` 2-day hide rule; cumulative expired counter still counts hidden rows.

### DOM rendering — P0
- Each `drawX` renders the right rows, badges (New/Gone), and status `<select>` reflecting stored value.
- Empty states render (no match; Pararius "not connected" stub).
- Divider row appears only when both groups non-empty.
- Counters/alert banners render with correct numbers.

### UI/UX interaction — P1
- Clicking a status persists to `localStorage` under the **exact** keys `oa_se_st` / `oa_h_st` and survives reload.
- Filter buttons (all / available / new / students-ok) change the visible set.
- Sort toggles flip arrows and order; selecting price clears status sort and vice-versa.
- Hero dock/undock on scroll; back-to-top arrow; skeleton → staggered enter → stat count-up fire once.

### Visual regression — P1
- Wordmark animation invariants *(existing `amsterdam-animation.test.js`, keep + extend)*.
- Hero docked vs undocked snapshot; table snapshot; semantic status colors per state.

### Accessibility — P2
- axe: color-contrast, table semantics, the status `<select>` is labeled, keyboard reach for filters/sort and the back-to-top control.

### Data / JSON contract (listing logging) — P0
- Schema validation of all three blocks: required keys, types, enums (`studentsAllowed ∈ {yes,no,unknown}`).
- **Referential integrity**: every id in `checks[].listing_ids/new_ids/gone_ids` exists in `listings{}`.
- **Temporal integrity**: `checks` dates non-decreasing; `last_seen ≥ first_seen`; `expired ⇒ expired_since` present and ≥ `last_seen`.
- **Diff correctness**: `new_ids`/`gone_ids` match the set delta vs the previous check.
- ID uniqueness; no orphan listings (present in `listings{}` but never in any check).

### Backend — data pipeline — P0
- Diff function unit tests (new, gone, unchanged, re-appeared).
- **Write-back integrity** (highest value): given a fixture HTML, writing new data (a) produces valid HTML, (b) all three blocks still `JSON.parse`, (c) the design/JS bytes are untouched, (d) `last_checked` updated, (e) `expired_since` set on newly-gone. *(This is exactly the merge-verification we did, promoted to an automated test.)*
- Idempotency: running the pipeline twice with identical scrape input is a no-op.

### Backend — pararius-worker — P1
- `/apply` rejects without the shared secret; accepts with it.
- Success detection ("Uw reactie is doorgestuurd") → `{success:true}`; failure/challenge path → `{success:false}` with reason.
- Redirect chain (SendGrid → pararius reageer) handled; puppeteer mocked so tests are hermetic.

### Backend — pararius-mac-react — P1
- Link selection picks the **react** link, never the "view listing" link (the `reaction_keywords` / `exclude_keywords` logic) — table-driven over `.eml` fixtures.
- Dedupe state prevents re-reacting to the same listing.
- `dry_run` opens nothing.

### Cross-cutting — P0/P1
- **Security (P0):** scraped strings (`address`, `neighborhood`, `href`) are injected via `innerHTML` template literals in the render functions — an XSS vector if a listing field contains markup. Add a test that a hostile fixture (`<img onerror>`, `javascript:` href) is escaped/neutralized, and sanitize at render. **This is a real finding in the current code.**
- **Error handling (P1):** malformed JSON block, missing optional fields (`incomeReq:""`), empty `checks` → app degrades gracefully, no thrown render.
- **Performance (P2):** render time stays acceptable at 10× current listing count; localStorage near quota doesn't crash status writes.

## 5. P0 "must ship first" set (the dozen that catch the scary bugs)
1. New-floats-to-top + clears next check.
2. Migration map + idempotency.
3. Price/status sort mutual exclusivity.
4. Students Yes/No split + divider index.
5. Expired hide rule + cumulative counter.
6. JSON schema valid (all three blocks).
7. Referential + temporal integrity.
8. Diff correctness.
9. Pipeline write-back integrity.
10. Status persists under `oa_se_st`/`oa_h_st` and survives reload.
11. XSS escape on rendered scraped fields.
12. Wordmark animation (existing).

## 6. Fixtures
`tests/fixtures/` — one canonical dataset with a listing in every state: normal-available, brand-new (in latest `new_ids`), gone, expired-recent, expired-2d+ (hidden), student-yes, student-no, missing-fields, and a **hostile** one for XSS. Plus 2–3 `.eml` fixtures for the Mac script and a small HTML fixture for write-back tests. Every layer consumes these, so behavior is described once.

## 7. CI (GitHub Actions)
One workflow, parallel jobs: `unit+dom+contract` (Node), `e2e+visual+a11y` (Playwright, Chromium), `worker` (workerd), `python` (pytest). Block merge on red. Visual snapshots stored in-repo; updates are explicit PR diffs.

## 8. Rollout order
1. Extract pure logic to `src/js/*` (depends on the restructure plan) → unit + contract layer + the P0 dozen.
2. Add Playwright smoke (loads, renders, one status click persists) → wire CI.
3. Backfill visual + a11y, worker, python.
4. From then: no bug is closed without its regression test.

## 9. Decisions (locked)
- **Playwright: ADOPTED.** Real-browser E2E + visual snapshots + axe a11y are in scope.
- **Full pipeline: TESTED END-TO-END.** Not just the pure diff/write-back — the scrape→diff→write-back→render loop is exercised with the network/Chrome-MCP layer mocked by recorded fixtures (captured DOM from the two sites), so the test is deterministic and offline but covers the whole path. Live-site smoke can run separately/manually, off the blocking CI path.

Implementer agents MUST respect both decisions.
