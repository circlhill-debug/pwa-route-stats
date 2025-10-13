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
- USPS Evaluation summary: fixed tag at top‑right with Route/Eval/Boxes/Salary/Hours per day; configurable in Settings.
- USPS tiles:
  - Hours vs Eval: weekly progress percent (Mon..today) vs eval hours/day (includes office). Tooltip shows “Xh of Yh over N day(s)”.
  - Weekly $/h: 4‑week rolling average (completed weeks), derived from annual salary. Tooltip shows total hours used.
- Vacation Mode: manage one or more date ranges (Settings → Vacation Mode). Analytics skip those days; table keeps them with a superscript `v`.
- Data Sheet: in-app HTML view renders docs/METRICS.md (bp/bl/w/R², diagnostics guidance) with caching-safe refresh.
- Smart Summary (rule‑based): concise Hours/Volume/Efficiency deltas; daily under the title (top‑movers ≥5%).
- Headline Digest (weekly): one‑line summary on Wednesdays after 5pm (flag‑controlled).
- Trending Factors: quick culprit pills (Office / Route / Volume) for Mon..today vs last Mon..today.
- Day Compare (experimental): compare any worked day against last same weekday/baseline/manual pick; shows subject/reference pills, deltas, and drives the Daily Movers strip inside the card.
- Weekly Compare overlays: Volume and Office — blue baseline = last week (Mon..Sun), yellow overlay = this week (Mon..today).
- Heaviness attribution: Today and Week pill rows (Office vs Route vs Total) with hours and % attribution.
- Snapshot help: Volume/Route Eff/Overall tiles are clickable for a short, plain‑English explanation; hover tooltips remain.
- Collapsible dashboard (experimental): per‑section collapse with persisted state; Recent Entries defaults to collapsed; headers toggle.
- Quick Filter: auto‑expands when a day is selected (if collapsed), Normalized badge and optional Ruler (0/50/100), All toggle, Days badge.
- Monthly Glance: 4‑week slim sparklines with Avg pill; text fallback when charts unavailable.
- Boxholders: x1/x2/x3 (Light/Medium/Heavy); route efficiency uses adjusted route minutes (−30/−45/−60m) but stored times remain unchanged.

---

Next Session — Pick Up Here

- New data points: you’ll describe them; we’ll decide how to integrate (overlays, factors, summaries). Bring examples if possible.
- Composition View: optional stacked composition (Parcels vs 0.33×Letters) for W1 vs last week; text fallback first.
- Heaviness tuning: thresholds/copy for Today/Week pills; consider median baselines; optional “Similar” band widths.
- Boxholder offsets: make x1/x2/x3 configurable (Settings) after a week of field data.
- Small polish: Avg pill label (e.g., “Avg (4w)”), chart padding, and minor copy tweaks.
- Tagging system exploration: seasonal labels (e.g., Peak Season) with filterable views for historical comparisons.

Quick start next time
1) Start `Start Server.command` → open the app.
2) Settings → Force Refresh (update + clear cache).
3) Verify charts/tooltips on phone if testing in the field.
4) Share the new data points; we’ll sketch integration and ship behind flags.

Branch Recovery Checklist (Sept 26, 2025)
- `problem-child`: full WIP (header tweaks, diagnostics experiments, boxholder retrofit).
- `restore/stable-sept26`: clean baseline (commit `503186b`, pre iPhone PWA changes).
- Plan: reapply only the useful fixes onto `restore/stable-sept26`, testing each addition.
- Steps:
  1) `git checkout restore/stable-sept26`;
  2) Cherry-pick specific hunks from `problem-child` (diagnostics cell styling, boxholder logic, etc.);
  3) Test locally, commit in small units;
  4) Fast-forward `main` to `restore/stable-sept26` when ready;
  5) Review notes to ensure no important fix is missed.

Where to look / edit
- index.html: Main app, feature flags UI and logic. Quick Filter and summaries live here.
- NEXT.md: Near‑term tasks and acceptance criteria (kept up‑to‑date as we ship).
- project-plan.md: Broader roadmap, history notes, and accepted design decisions.
- sw.js: Cache version string; bump when behavior or UI meaningfully changes.
- docs/METRICS.md: Data sheet explaining what each metric means and how it’s computed.

Flags (Settings dialog)
- Weekday ticks, Progressive pills, Monthly Glance, Holiday adjustments, Trend pills
- Same range weekly totals, Headline digest, Quick Filter, Mix Viz, Baseline compare
- Collapsed dashboard, Focus Mode, Quick Entry, USPS Evaluation, Vacation Mode

Force Refresh (to pick up updates)
1) Open Settings → click “Force Refresh (update + clear cache)”.
2) The page reloads; confirm top‑right version tag shows today’s date (vYYYY‑MM‑DD).

What the snapshot tiles mean (at a glance)
- Volume (0–10): percentile rank vs your recent worked days for parcels + w×letters (learned weight). Not “percent of max”. Click tile for details.
- Route Eff. (0–10): adjusted route minutes vs this weekday’s typical average (boxholder offsets applied). Click tile for details.
- Overall (0–10): today’s total hours vs this weekday’s expected average. Click tile for details.

🚀 Update: Dynamic Volume Model + Diagnostics

What changed
- Replaced fixed letter weight (0.33) with a learned weight from your own history.
- Model: route_minutes ≈ a + (bp × parcels) + (bl × letters)
- bp = minutes per parcel
- bl = minutes per letter
- w = bl/bp → letters expressed as a fraction of a parcel
- Added Diagnostics panel showing coefficients, R², and top residual days (unexplained ± minutes).
- Added live model strip (bp, bl, w, R² pills) at the top for quick glance.
- Residuals color-coded (green = faster than predicted, red = slower).

Why it matters
- Letter volume has much less impact on route time than parcels. A fixed multiplier overstated letter effects, which made “efficiency drops” look worse than they really were.
- Now the multiplier updates dynamically with your data — your efficiency metric stays realistic.
- Diagnostics expose the “other 25%” of variance: weather, boxholders, detours, scanner issues, etc. You can pinpoint anomalies at a glance.

Results
- Early fits show R² ≈ 75%, meaning ~¾ of your route-time variance is explained purely by letters + parcels.
- Learned w ≈ 0.12, showing letters are ~12% the impact of a parcel on route time (vs. the old 0.33 assumption).
- Efficiency gap dropped from ~18% to ~12%, reflecting improved accuracy.

Next up
- Toggle between rolling model (last 120 days) and all-time model.
- Default = rolling (captures seasonality + recent changes).
- Option = all-time (smooths over long periods for stability).

Holiday handling
- Mark a day “Off day” and check “Holiday (observed)” to carry that day into the next weekday’s baseline (prevents outlier comparisons).
- Works for any weekday (e.g., Tue → Wed). Sunday holidays do not carry into Monday (new week).

If chat/context resets
- Open `NEXT.md` for the immediate TODO list and current tag.
- Open `project-plan.md` for the phase outline and recent dev log.
- Confirm flags in Settings match the plan, then Force Refresh.
- For Phase 4, implement `buildSmartSummary(rows)` (rule‑based) under the existing headline area; keep behind a flag and ensure safe fallbacks.
