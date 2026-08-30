#!/usr/bin/env bash
# Install pi-chat-gateway as a user-level systemd service on VPS.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SRC="$HERE/pi-chat-gateway.service"
DEST_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
DEST="$DEST_DIR/pi-chat-gateway.service"

PORT="3000"
AUTH_TOKEN=""
RESTART_NOW="no"

for arg in "$@"; do
  case "$arg" in
    --restart|--now) RESTART_NOW="yes" ;;
    --token=*) AUTH_TOKEN="${arg#*=}" ;;
    [0-9]*) PORT="$arg" ;;
  esac
done

if [[ ! -f "$SRC" ]]; then
  echo "ERR: unit file not found at $SRC" >&2; exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERR: 'node' not on PATH" >&2; exit 1
fi

mkdir -p "$DEST_DIR"

USER_HOME="$HOME"
PROJECT_DIR="$ROOT"
NODE_BIN="$(command -v node)"

sed \
  -e "s|^WorkingDirectory=.*|WorkingDirectory=$PROJECT_DIR|" \
  -e "s|^ExecStart=.*|ExecStart=$NODE_BIN $PROJECT_DIR/src/index.js|" \
  -e "s|^Environment=PORT=.*|Environment=PORT=$PORT|" \
  -e "s|%h/|$USER_HOME/|g" \
  "$SRC" > "$DEST"

if [[ -n "$AUTH_TOKEN" ]]; then
  sed -i "s|# Environment=AUTH_TOKEN=.*|Environment=AUTH_TOKEN=$AUTH_TOKEN|" "$DEST"
fi

chmod 644 "$DEST"
echo "✔ wrote $DEST"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user enable pi-chat-gateway.service
  if [[ "$RESTART_NOW" == "yes" ]] || systemctl --user is-active --quiet pi-chat-gateway.service; then
    systemctl --user restart pi-chat-gateway.service
  else
    systemctl --user start pi-chat-gateway.service || true
  fi
  echo "Status:"
  systemctl --user --no-pager status pi-chat-gateway.service || true
fi
