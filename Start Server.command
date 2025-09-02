#!/bin/bash
# Simple local server for Route Stats (macOS)
set -e
cd "$(dirname "$0")"

# Pick a port (8000 default); use first free in [8000..8010]
PORT=8000
for p in {8000..8010}; do
  if ! lsof -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then PORT=$p; break; fi
done

URL="http://localhost:$PORT"
echo "Starting local server on $URL"
echo "(Close this window to stop the server)"

# Open browser
if command -v open >/dev/null 2>&1; then
  open "$URL" || true
fi

# Try to locate a Python 3 even if Homebrew didn't link it
find_python3() {
  # 1) PATH
  if command -v python3 >/dev/null 2>&1; then echo "$(command -v python3)"; return; fi
  # 2) Common Homebrew opt paths (Apple Silicon + Intel)
  for p in /opt/homebrew/opt/python@*/bin/python3 /usr/local/opt/python@*/bin/python3; do
    if [ -x "$p" ]; then echo "$p"; return; fi
  done
  # 3) Framework installers (python.org)
  for p in /Library/Frameworks/Python.framework/Versions/*/bin/python3; do
    if [ -x "$p" ]; then echo "$p"; return; fi
  done
  # 4) A bare `python` that happens to be Python 3
  if command -v python >/dev/null 2>&1; then
    if python - <<'PY'
import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)
PY
    then
      echo "$(command -v python)"; return
    fi
  fi
}

PY=$(find_python3 || true)
if [ -n "$PY" ]; then
  echo "Using Python at: $PY"
  exec "$PY" -m http.server "$PORT"
fi

# Fallback: Ruby one-liner (often preinstalled)
if command -v ruby >/dev/null 2>&1; then
  echo "Using Ruby built-in server"
  exec ruby -run -e httpd . -p "$PORT"
fi

# Fallback: PHP if available
if command -v php >/dev/null 2>&1; then
  echo "Using PHP built-in server"
  exec php -S "localhost:$PORT"
fi

echo "No local server runtime found. Please install Python 3 from https://www.python.org/downloads/"
exit 1
