#!/bin/bash
# Simple local server for Route Stats (macOS)
set -e
cd "$(dirname "$0")"

# Pick a port (8000 default); use first free in [8000..8010]
PORT=8000
for p in {8000..8010}; do
  if ! lsof -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then PORT=$p; break; fi
done

echo "Starting local server on http://localhost:$PORT"
echo "(Close this window to stop the server)"

# Open browser
if command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT"
fi

# Prefer Python 3's http.server
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
fi

# Fallback to Python 2 if present
if command -v python >/dev/null 2>&1; then
  exec python -m SimpleHTTPServer "$PORT"
fi

echo "No Python found. Please install Python 3 from https://www.python.org/downloads/"
exit 1

