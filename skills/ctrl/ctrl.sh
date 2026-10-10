#!/bin/sh
# Runs the ctrl CLI that ships with the ctrl app, even when another `ctrl` comes first in PATH.
# ctrl writes its CLI's path to .ctrl-cli on install.
dir=$(cd "$(dirname "$0")" && pwd)
for cli in "$(cat "$dir/.ctrl-cli" 2>/dev/null)" /Applications/ctrl.app/Contents/Resources/cli/ctrl; do
  if [ -n "$cli" ] && [ -x "$cli" ]; then
    exec "$cli" "$@"
  fi
done
echo '{"ok":false,"error":{"code":"APP_NOT_RUNNING","message":"ctrl.app isn'"'"'t installed","hint":"Install it: curl -fsSL https://raw.githubusercontent.com/lucleray/ctrl/main/install.sh | sh"}}'
exit 5
