#!/bin/sh
# Installs (or reinstalls) the latest ctrl release into /Applications.
#   curl -fsSL https://raw.githubusercontent.com/lucleray/ctrl/main/install.sh | sh
# curl doesn't quarantine what it downloads (browsers do), so the self-signed app opens
# without a Gatekeeper prompt.
set -e

REPO=lucleray/ctrl
APP=${CTRL_APP:-/Applications/ctrl.app}

case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  *) ARCH=x64 ;;
esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading the latest ctrl ($ARCH)…"
curl -fL --progress-bar -o "$TMP/ctrl.zip" "https://github.com/$REPO/releases/latest/download/ctrl-mac-$ARCH.zip"
ditto -x -k "$TMP/ctrl.zip" "$TMP/unpacked"

if pgrep -f "^$APP/Contents/MacOS/" >/dev/null 2>&1; then
  echo "Quitting the running ctrl…"
  osascript -e 'tell application id "im.luc.ctrl" to quit' || true
  i=0
  while pgrep -f "^$APP/Contents/MacOS/" >/dev/null 2>&1 && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
fi

rm -rf "$APP"
ditto "$TMP/unpacked/ctrl.app" "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
echo "Installed $APP"

# The ctrl command line, for agents (docs/CLI.md). The link points into the app, so updates keep it current.
BIN=${CTRL_BIN_DIR:-$HOME/.local/bin}
CLI="$APP/Contents/Resources/cli/ctrl"
if [ -x "$CLI" ]; then
  current=$(readlink "$BIN/ctrl" 2>/dev/null || true)
  case "$current" in
    "$CLI") ;;
    */Contents/Resources/cli/ctrl | */dist/cli/ctrl | "")
      if [ -e "$BIN/ctrl" ] && [ -z "$current" ]; then
        echo "$BIN/ctrl exists and isn't ctrl's: leaving it alone (agents still reach ctrl through its skill)"
      else
        mkdir -p "$BIN"
        ln -sfn "$CLI" "$BIN/ctrl"
        echo "Linked the ctrl command: $BIN/ctrl"
      fi
      ;;
    *) echo "$BIN/ctrl links to something else: leaving it alone (agents still reach ctrl through its skill)" ;;
  esac
  case ":$PATH:" in
    *":$BIN:"*)
      found=$(command -v ctrl 2>/dev/null || true)
      if [ -n "$found" ] && [ "$found" != "$BIN/ctrl" ]; then
        echo "Note: $found comes before $BIN/ctrl in your PATH"
      fi
      ;;
    *) echo "Note: $BIN isn't in your PATH. Add it to run ctrl outside ctrl's terminals" ;;
  esac
fi

if ! command -v opencode >/dev/null 2>&1 && [ ! -x "$HOME/.opencode/bin/opencode" ]; then
  echo "ctrl needs opencode V2: curl -fsSL https://opencode.ai/v2/install | bash"
fi

[ -n "$CTRL_NO_OPEN" ] || open "$APP"
