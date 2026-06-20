#!/bin/bash
# Installs the Pararius auto-react LaunchAgent so it runs whenever you are logged in
# and your Mac is awake. Re-run this after editing config to reload.
set -e

APPDIR="$(cd "$(dirname "$0")" && pwd)"
PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "python3 not found. Install Command Line Tools first:  xcode-select --install"
  exit 1
fi

LABEL="com.pararius.react"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"

sed -e "s#__PY__#$PY#g" -e "s#__APPDIR__#$APPDIR#g" \
    "$APPDIR/com.pararius.react.plist" > "$PLIST"

# Reload cleanly
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load "$PLIST"

echo "Installed and loaded: $PLIST"
echo "Python:  $PY"
echo "App dir: $APPDIR"
echo "Logs:    $APPDIR/pararius_react.log"
echo
echo "Check it is running:  launchctl list | grep pararius"
echo "Stop it:              launchctl bootout gui/$(id -u)/$LABEL"
