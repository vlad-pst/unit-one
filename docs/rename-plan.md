# Rename Plan — `cowork-housing-tracker` → `unit-one`

> Scope: the **project/folder** was renamed. This is a path/repo-name change, not a product rebrand.
> Old: `~/CodingProjects/cowork-housing-tracker`  →  New: `~/CodingProjects/unit-one`

## 0. The one that actually matters (lives OUTSIDE this repo)

The daily scheduled agent `se-ndsm-daily-check` (`~/Claude/Scheduled/se-ndsm-daily-check/SKILL.md`)
reads `tracker.html` at the **hardcoded path** `~/CodingProjects/cowork-housing-tracker/tracker.html`
and edits the inline JSON blocks via the Edit tool (per `docs/restructure-plan.md` §1).

After the folder rename that path no longer exists, so the agent **silently fails or writes
nowhere every day** until its SKILL.md is updated. This file is not in the repo, so it can't be
fixed from here — it must be edited on the machine. This is the highest-priority item.

Also verify the new absolute path. The environment shows `~/CodingProjects/unit-one`, but the
request said `~/unit-one`. Confirm the real location and use it everywhere below.

## 1. Mapping — must change (repo-path references to the old name)

| # | File:line | Current text | Change to | Why |
|---|-----------|--------------|-----------|-----|
| 1 | `docs/restructure-plan.md:10` | `~/CodingProjects/cowork-housing-tracker/tracker.html` | `~/CodingProjects/unit-one/tracker.html` | Documents the agent's hardcoded path; must match reality |
| 2 | `docs/restructure-plan.md:19` | `cowork-housing-tracker/   # repo root (rename later)` | `unit-one/   # repo root` | This is the "rename later" the doc anticipated; drop the parenthetical |
| 3 | `pararius-worker/PLAN.md:39` | `cd ~/CodingProjects/cowork-housing-tracker/pararius-worker` | `cd ~/CodingProjects/unit-one/pararius-worker` | Copy-paste deploy step; wrong path breaks the instruction |
| 4 | **external** `~/Claude/Scheduled/se-ndsm-daily-check/SKILL.md` | `~/CodingProjects/cowork-housing-tracker/tracker.html` | `~/CodingProjects/unit-one/tracker.html` | See §0. Edit on the machine, not in this repo |

These are the only literal `cowork-housing-tracker` occurrences. (`grep -rn cowork-housing-tracker` = lines 1–3 above.)

## 2. Mapping — judgment call (app branding "Housing Tracker")

These are the **product's display name**, not the folder name. A folder rename does not imply a UI
rebrand. Default recommendation: **leave as-is** unless you actually want to rename the product.

| File:line | Text | Recommendation |
|-----------|------|----------------|
| `README.md:1` | `# Amsterdam Housing Tracker` | Keep (product name) |
| `tracker.html:6,16,39` | `<title>` + two `<h1>` "Housing Tracker" | Keep (user-facing UI) |
| `package.json:5` | `"description": "Amsterdam housing tracker dashboard…"` | Keep |
| `pararius-worker/TICKET.md:30` | "…in the housing tracker repo." | Optional: "…in the unit-one repo" for clarity |
| `docs/test-strategy.md:1` | `# Test Strategy — Housing Dashboard` | Keep |
| `archive/tracker-v1/v2/v3.html` | "Housing Tracker" titles/headings | **Never touch** — frozen historical snapshots |

If you *do* want a rebrand, that's a separate, larger task (new title, README, possibly the
localStorage-key prefixes — see §4) and should be decided explicitly, not folded into a path rename.

## 3. Mapping — package identifiers (do not contain the old name; leave unless rebranding)

| File | Field | Value | Note |
|------|-------|-------|------|
| `package.json:2` | `name` | `housing-dashboard` | Internal npm name; no old-repo-name reference. Optional align to `unit-one`. |
| `pararius-worker/package.json:2` | `name` | `pararius-apply-worker` | Sub-project name; unrelated to rename. Leave. |
| `pararius-worker/wrangler.toml` | `name` | `pararius-apply` | **Deployed Cloudflare Worker name. DO NOT change** — renaming creates a new Worker and orphans the live one. |

## 4. Must NOT change (would break runtime/automation)

- `tracker.html` filename — the scheduled agent and tests depend on it.
- `<script id="se-data|hausing-data|pararius-data">` JSON markers (note: `hausing-data` is an
  intentional historical spelling — leave it).
- localStorage keys `oa_se_st`, `oa_h_st`, `oa_migration_v2` (per AGENTS.md: "Never rename").
- Cloudflare Worker name `pararius-apply`.

## 5. Execution order

1. **Confirm the real new path** (`~/CodingProjects/unit-one` vs `~/unit-one`).
2. **Fix the external SKILL.md** (§0 / row 4) first and run the agent once (or dry-run its
   Part C edit) to confirm it finds `tracker.html` at the new path.
3. Edit the 3 in-repo path references (rows 1–3) — pure find/replace, no logic impact.
4. Decide branding (§2) and package names (§3) — default is leave-as-is.
5. Verify: `node --test tests/*.test.js` green, `grep -rn "cowork-housing-tracker"` returns
   nothing in-repo, and the daily agent's next run succeeds.

## 6. One-liner for the in-repo path edits (rows 1–3)

```bash
cd ~/CodingProjects/unit-one
grep -rl 'cowork-housing-tracker' --exclude-dir=node_modules . \
  | xargs sed -i '' 's#CodingProjects/cowork-housing-tracker#CodingProjects/unit-one#g'
# then hand-fix docs/restructure-plan.md:19 (the bare "cowork-housing-tracker/  # repo root")
```
