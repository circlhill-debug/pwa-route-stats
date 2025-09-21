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

---

Project Agenda & How To Resume Context

- Current milestone: v2.0.4-phase3-qf (Quick Filter + baseline polish)
- Next target tag: v2.0.5-phase4-summary
- What shipped in Phase 3:
  - Quick Filter: All toggle, Normalized badge, optional Ruler (0/50/100) when normalized; persists.
  - W1/W2 standardization (Mon..today vs last same range) across labels.
  - Baseline details: weekday-aligned compare with min baseline guard (≥5) and “days used”.
  - SW cache bumped when user-visible changes land; use Settings → Force Refresh.

Phase 4 (planned)
- Smart Summary v1 (rule‑based): 1–2 sentences under title summarizing week vs last, hours, volume mix, and efficiency. Controlled by a feature flag; always degrades to text (no charts needed).
- Week labels: use W1 for most recent, then W2, W3, W4 consistently (no week zero). Monthly Glance updated already.
- Optional AI summary: pluggable provider behind a flag; falls back to rule‑based. No blocking on API availability; key stays local.

Latest features (main)
- Smart Summary (rule‑based): concise Hours/Volume/Efficiency deltas; shows daily under the title.
- Collapsible dashboard (experimental): per‑section Collapse/Expand with persisted state.
- Focus Mode: one‑tap collapse of all non‑snapshot sections; tap again to expand all.
- Quick Entry (experimental): compact “Hit Street (now)” and “Return (now)” buttons in Add Entry header when collapsed.
- Monthly Glance: always visible card with text fallback; sparklines render if Chart.js is available.
- Quick Filter: Normalized badge, optional Ruler (0/50/100) when 2+ metrics selected, All toggle, and a Days badge.
- Copy: “Average Hours by Weekday” label clarifies the DOW chart.

Where to look / edit
- index.html: Main app, feature flags UI and logic. Quick Filter and summaries live here.
- NEXT.md: Near‑term tasks and acceptance criteria (kept up‑to‑date as we ship).
- project-plan.md: Broader roadmap, history notes, and accepted design decisions.
- sw.js: Cache version string; bump when behavior or UI meaningfully changes.

Flags (Settings dialog)
- Weekday ticks, Progressive pills, Monthly Glance, Holiday adjustments, Trend pills
- Same range weekly totals, Headline digest, Quick Filter, Mix Viz, Baseline compare

Force Refresh (to pick up updates)
1) Open Settings → click “Force Refresh (update + clear cache)”.
2) The page reloads; confirm top‑right version tag shows today’s date (vYYYY‑MM‑DD).

If chat/context resets
- Open `NEXT.md` for the immediate TODO list and current tag.
- Open `project-plan.md` for the phase outline and recent dev log.
- Confirm flags in Settings match the plan, then Force Refresh.
- For Phase 4, implement `buildSmartSummary(rows)` (rule‑based) under the existing headline area; keep behind a flag and ensure safe fallbacks.
