# ARCHITECTURE.md

> Read this fully before working in this repo. It holds the cross-component context and hard-won decisions the code itself can't show.
>
> Treat it as a map, not ground truth — verify specifics against the code before acting. If it is merely stale (says X, code does Y), correct it as part of your work; no approval needed. If a mismatch looks substantive (a bug, broken pipeline, or design conflict), do not silently change anything: tell Vlad in 1-2 lines and wait.
>
> Last updated: 2026-06-21 · against commit b25d575

## What this is
A personal Amsterdam rental-hunting dashboard. A scheduled AI agent scrapes listing sites once a day, writes them into one HTML page, and the page is published publicly. Vlad triages listings through a status pipeline. Public repo, AGPL, live at https://unit001.vercel.app.

## How it runs (the pipeline — the part code can't show)
The daily agent's prompt lives OUTSIDE this repo, in a Cowork scheduled task. Each run:
1. Scrapes Student Experience NDSM + Hausing via real Chrome. (Cloudflare blocks datacenter IPs, so scraping must use a real browser on a residential IP — never a cloud runner.)
2. Writes listing data inline into `tracker.html` (two `<script type="application/json">` blocks: se-data, hausing-data).
3. Writes `scripts/.deploy-request` (a timestamp) as its LAST step — the deploy signal.
4. Runs no git — its sandbox has no git credentials.

A launchd job on Vlad's Mac (`scripts/push-unit-one.sh`, every 2 min):
5. Fires only when `.deploy-request` differs from `.deploy-done`, so Vlad's manual edits to `tracker.html` are never auto-committed.
6. Commits `tracker.html` as `unit-one-agent`, pushes to `main`.
7. Push to `main` auto-deploys to Vercel.

Net: agent writes file + signal → Mac pushes → Vercel deploys, ≤2 min. Both halves only run while the Mac is awake AND logged in.

## The app
- One page: `tracker.html` (root) = markup + inline JSON data. Opens from `file://`; no build, no server.
- Source in `src/styles.css` + `src/js/*` — classic `<script src>`, no modules, no bundler.
- Three sources: Student Experience NDSM, Hausing, Pararius (Pararius is a stub, not wired).
- Per-listing statuses (starred/queued/referenced/sent/pass) live in browser localStorage, NOT in the file.

## Decisions that look wrong but are intentional
- Data lives inline in `tracker.html`, not separate JSON files — keeps the agent's daily write a single-file edit at a fixed path. Splitting was considered and rejected.
- No build; classic scripts — so the page opens from `file://` and the agent never runs a build.
- `tracker.html` not renamed to `index.html` — the agent and Vercel depend on the name; `vercel.json` rewrites `/` → `/tracker.html`.
- Tests use Node's built-in runner (`node:test`), not Vitest/Jest — npm is blocked in the build sandbox; built-in needs zero install.
- Push happens from the Mac, not the agent — the sandbox has no git credentials, permanently. See Dead ends.
- Deploy gates on a separate `.deploy-request` file, not on `tracker.html` changes — so manual edits don't trigger deploys.
- NEW/GONE are pure set math vs the previous check (NEW = scraped − prev, GONE = prev − scraped). An empty Hausing scrape = failed scrape, not "everything gone."
- AGPL-3.0 (not MIT/Apache) — possible future paid service; AGPL blocks a competitor closing it into a SaaS.

## Gotchas / constraints (non-obvious; will bite you)
- Statuses are localStorage, per browser+origin: they don't sync between your local file, the live site, other devices, or visitors — each store is independent. Setting a status on the live site saves only to that one browser. Sharing/persisting them needs a backend (see Parked: Supabase).
- Scheduled agent + Mac push only run when the Mac is awake AND logged in; sleep/logout stops both; a missed daily run does not reliably catch up.
- Sandbox network egress is allowlisted to `github.com` only — and even so the agent can't push (no creds). Push is the Mac's job.
- Interrupted runs can leave `.git/*.lock`; `push-unit-one.sh` clears them before committing.

## Dead ends — don't retry (tried, failed)
- Pushing from the agent/sandbox: no credentials/keychain/token; `gh`/PyGithub/SSH all blocked or unconfigured. Confirmed over a 17-step attempt. Push is the Mac's job, full stop.
- GitHub MCP connector for the push: auth doesn't work in the scheduled context.
- Vercel deploy hook to publish data: it redeploys the last GitHub commit, so without the push it deploys stale state.
- Cloud Claude Code routine for the whole job: fixes the push but breaks scraping (datacenter IP → Cloudflare).

## Tests
Tests live in `tests/` (logic, data-contract, pipeline, animation) plus a Playwright e2e suite. Run the zero-install set with `node --test tests/*.test.js`; Playwright with `npm run test:e2e`. Never assume they pass — always run them.

## Parked / open (not done)
- Run the Playwright e2e suite locally to bank browser coverage (`npm run test:e2e`; needs `npx playwright install chromium`).
- Supabase status sync: move statuses out of localStorage into a backend so they persist on the live site and across devices. Bigger change (schema + read/write layer; breaks the localStorage-only model).

## Subprojects (separate runtimes)
- `pararius-worker/` — Cloudflare Worker that auto-applies to Pararius via Browser Rendering. Separate deploy.
- `pararius-mac-react/` — local Mac Python script (stdlib only) that opens Pararius "react" links over IMAP. Config in its own gitignored `config.json`.
