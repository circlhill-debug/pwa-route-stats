# Route Stats — Quick Start

Run the app locally (macOS, no install required):

1) Double‑click `Start Server.command` in this folder.
   - It opens your browser to `http://localhost:8000` (or the next free port).
   - Leave the Terminal window open while testing.

2) Hard‑reload once on first run (to refresh the service worker):
   - Chrome: View → Developer → Developer Tools → Application → Service Workers → Unregister, then reload — or Shift+Reload.

3) What to verify:
   - Version tag at top‑right shows today’s date like `vYYYY-MM-DD`.
   - “Miles” defaults to `53` when adding a new entry and after delete reset (Off Day still sets it to 0).
   - “Averages by Day of Week” bar chart starts at Mon → … → Sun.

Troubleshooting
- If the page doesn’t load: ensure the terminal shows “Starting local server…” and visit the printed URL.
- If a different app already uses port 8000, the script picks the next free port automatically.
- If double‑clicking the script doesn’t run, right‑click → Open. You may need to allow it in System Settings → Privacy & Security.
