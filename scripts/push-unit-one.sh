#!/bin/bash
# Mac-side deploy. Commits tracker.html and pushes to GitHub (-> Vercel redeploy).
#
# Why this exists: the scheduled agent runs in a sandbox VM with no git
# credentials, so it can write tracker.html but cannot push. This script runs
# on the Mac (which has the keychain credentials) on a launchd timer.
#
# It fires ONLY when the agent signals a new run by writing .deploy-request.
# That file is the only trigger — so your own manual edits to tracker.html are
# NOT auto-committed. You push manual changes yourself, as yourself.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
REQ_FILE="$SCRIPT_DIR/.deploy-request"
DONE_FILE="$SCRIPT_DIR/.deploy-done"
cd "$REPO" || exit 1

# Single-instance guard (macOS has no flock). mkdir is atomic.
LOCK="/tmp/unit-one-push.lock"
mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK"' EXIT

# Only act when the agent has signalled a new run (content differs from last handled).
REQ="$(cat "$REQ_FILE" 2>/dev/null)"
DONE="$(cat "$DONE_FILE" 2>/dev/null)"
[ -n "$REQ" ] && [ "$REQ" != "$DONE" ] || exit 0

# Clear stale git locks from any interrupted run (the Mac has permission to).
rm -f .git/index.lock .git/HEAD.lock

ok=1

# Commit tracker.html only if it actually changed.
if [ -n "$(git status --porcelain -- tracker.html)" ]; then
  git add tracker.html
  git -c user.name="unit-one-agent" -c user.email="agent@unit-one.local" \
      commit -m "chore(data): daily refresh $(date +%F)" \
    && echo "$(date '+%F %T') committed tracker.html"
fi

# Push only if local main is ahead of origin (new commit, or a prior failed push).
if [ -n "$(git rev-list origin/main..main 2>/dev/null)" ]; then
  if git pull --rebase origin main && git push origin main; then
    echo "$(date '+%F %T') pushed to origin/main"
  else
    echo "$(date '+%F %T') push FAILED (will retry next poll)"
    ok=0
  fi
fi

# Mark this request handled only if everything succeeded, so failures retry.
[ "$ok" = 1 ] && echo "$REQ" > "$DONE_FILE"
