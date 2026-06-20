# AGENTS.md

Guidance for AI agents and contributors editing this repo.

Note: the daily scraping agent is configured separately (its own scheduled task) and does not read this file. This is for whoever is changing the code.

## Safety

Destructive actions (deleting, overwriting, or moving files over existing ones) require my explicit approval each time. A prior approval is never standing consent. When in doubt, archive instead of delete, and ask first.

## Security

This repo is public. Assume everything you commit is world-readable and permanent.

- Never commit secrets, credentials, API keys, tokens, or `.env` files. `.env` and `.env.*` are gitignored; keep them that way.
- Never commit personal data (real emails, names, addresses, application or financial details). Use placeholders in docs and source; keep real values in untracked local config (`.env` or a gitignored config file).
- Treat scraped listing data as untrusted input: escape it on render (`esc()` in `src/js/render.js`), never `eval` or interpolate it raw into the DOM.
- Before committing, scan the diff for secrets and personal data. If something sensitive was already committed, flag it and treat it as compromised: rotating the secret is required, since deleting it in a later commit does not remove it from git history.

## Run and test

- Open `tracker.html` directly in a browser. No build step.
- `node --test tests/*.test.js` runs logic, data-contract, pipeline, and animation tests with zero install.
- `npm run test:e2e` runs the Playwright browser tests (needs `npm install` and `npx playwright install chromium`).

## Rules

- The listing data lives in the inline JSON blocks in `tracker.html`. Do not move them or rename the `<script id="se-data|hausing-data|pararius-data" type="application/json">` markers; the daily agent edits between them.
- All UI source lives in `src/` as classic scripts (no ES modules, no bundler). The app must keep opening from `file://`.
- Any scraped text rendered into the DOM must go through `esc()` in `src/js/render.js`.
- The localStorage keys `oa_se_st`, `oa_h_st`, and `oa_migration_v2` are stable. Never rename them.
- Every bug fix ships with a regression test.
