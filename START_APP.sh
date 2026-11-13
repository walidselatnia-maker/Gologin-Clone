#!/usr/bin/env bash
# Orbita Anti-Detect Browser Profile Manager - Linux Desktop Launcher

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/orbita_clone" || exit 1

# Clean up any stale or orphaned background processes holding port 3030
STALE_PIDS=$(lsof -ti :3030 2>/dev/null)
if [ -n "$STALE_PIDS" ]; then
  echo "Cleaning up stale instance holding port 3030 (PIDs: $STALE_PIDS)..."
  kill -9 $STALE_PIDS 2>/dev/null || true
  sleep 0.5
fi

# Ensure npm dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing required npm dependencies..."
  npm install
fi

# Ensure Electron binary is downloaded and executable
ELECTRON_EXE="node_modules/electron/dist/electron"
if [ ! -f "$ELECTRON_EXE" ]; then
  echo "Configuring Electron binary..."
  node node_modules/electron/install.js 2>/dev/null || npm rebuild electron
fi

if [ -f "$ELECTRON_EXE" ]; then
  chmod +x "$ELECTRON_EXE" 2>/dev/null || true
  exec "$ELECTRON_EXE" main.js --no-sandbox "$@"
elif [ -f "node_modules/.bin/electron" ]; then
  exec "./node_modules/.bin/electron" main.js --no-sandbox "$@"
else
  exec npx electron main.js --no-sandbox "$@"
fi
