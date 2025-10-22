# Project Plan: Advanced Weekly Metrics and Interactivity

## Overview
This project aims to enhance the analytics capabilities of our platform by introducing more sophisticated weekly metrics and interactive tiles for deeper insights. These features will provide users with a more nuanced understanding of trends and allow them to drill down into specific details dynamically.

## Goals
1. **Advanced Weekly Metrics**
   - Implement day-to-day weekly comparisons.
   - Introduce weighted weekly averages to calculate cumulative impacts.
   - Provide an accurate and holistic weekly trend picture.

2. **Interactive Clickable Tiles**
   - Make existing tiles clickable to drill down into detailed views.
   - Add graphical representations for daily, weekly, and monthly trends.
   - Enable clickable points on graphs to show granular data for specific days.

## Implementation Plan

### Phase 1: Advanced Weekly Metrics
1. **Day-to-Day Weekly Comparison**
   - Compare the first day of the current week to the same day from the previous week.
   - Calculate daily deltas and thread them together for an accurate weekly picture.

2. **Weighted Weekly Averages**
   - Use weighted formulas to aggregate daily deltas into a weekly metric.
   - Ensure the weekly average reflects day-to-day fluctuations dynamically.

3. **Cumulative Weekly Impacts**
   - Show whether the week is trending positively or negatively based on cumulative day-to-day changes.

### Phase 2: Clickable Tiles and Interactivity
1. **Clickable Tiles**
   - Allow users to click on tiles (e.g., parcels up/down percentage) to open detailed views.
   - Include options to view last week, two-week, or monthly trends.

2. **Interactive Graphs**
   - Add progressive horizontal line graphs for selected metrics.
   - Implement hover-over tooltips and clickable points for detailed stats.

3. **Point-Specific Details**
   - Clicking on a graph point shows the total number of entries for that day.
   - Include contextual insights, such as comparison to averages or medians.

## Technical Considerations
- **Data Handling:**
  - Ensure backend supports storing and comparing daily stats from current and previous weeks.
  - Optimize APIs to fetch historical data efficiently.

- **Frontend Libraries:**
  - Use Chart.js or D3.js for interactive graphs.
  - Ensure UI is intuitive and visually appealing.

- **Performance Optimization:**
  - Use caching and precomputed metrics to minimize server load.
  - Monitor server performance with tools like New Relic or Datadog.

## Next Steps
1. Create a new branch for implementation.
2. Begin with Phase 1: Advanced Weekly Metrics.
3. Gradually introduce clickable tiles and interactivity in Phase 2.

## Roadmap
- **Week 1:** Draft backend API changes and data structures for advanced metrics.
- **Week 2:** Implement and test day-to-day comparisons and weighted averages.
- **Week 3:** Add clickable tiles and basic graphing capabilities.
- **Week 4:** Finalize interactive graphs and point-specific details.

---
This plan outlines a comprehensive approach to delivering these advanced features efficiently and strategically.

---

## Working Notes / Dev Log

### 2025-09-19 — Mix Viz stability + baseline compare fix (v2.0.4)

What we fixed/added
- Baseline Compare (Parcels, Letters) card now renders even if downstream logic fails; header and placeholders always visible.
- Resolved ReferenceError when baseline-normalized compare is disabled by defining safe defaults for `resP`/`resL` and avoiding variable shadowing.
- Defensive guards for text/eff/details elements; fallbacks render cleanly when Chart.js is unavailable.
- Service worker cache version bumped to force clients to pick up latest code.

Verification checklist (manual)
- Toggle “Show Volume Mix (Parcels vs Letters)” ON in Settings → Save → card appears with header immediately.
- Toggle “Use baseline-normalized compare” ON/OFF → details update without errors and drift sparkline remains stable.
- Force Refresh updates the SW and clears caches; subsequent reload shows updated card reliably.

### 2025-10-19 — Diagnostics tagging + AI summary (main)

What we shipped
- Residual list now supports “Tag & dismiss” with comma-separated reasons (`parcels +15, flats +10`), stores the tag list (local + Supabase), and hides handled days until reinstated; summary surface tracks dismissed count.
- Diagnostics weather/notes cells wrap gracefully, “Read full” opens an alert so tall notes don’t stretch mobile layout.
- Mix Viz weekly compare shows an orange min/max expectation band derived from recent comparable weeks.
- AI Summary card (optional OpenAI key) calls `gpt-4o-mini` for three upbeat bullets (cause, action, trend); result cached in localStorage and mirrored to Supabase with expand/collapse state.
- Token usage tracker now auto-increments today/week/month totals after each summary, with an optional monthly cap and color-coded progress bar; manual overrides still available in Settings.

Verification checklist (manual)
- Tag a residual (`parcels +15, flats +10`) and confirm both reasons are logged, the row hides, and the dismissed count updates; reinstate via Manage dismissed to recover it.
- Open Diagnostics on iPhone: table stays compact, “Read full” link pops the entire note without stretching rows.
- Weekly Compare orange band appears once 2+ historic weeks exist; tooltips show expectation range when hovering.
- Enter OpenAI key + generate AI summary, collapse/expand the card, reload page: summary persists across devices and token card increments automatically.

### 2025-09-07 — Phase 2 (part 1) shipped (tag: v2.0.1)

What we implemented
- Clickable weekly tiles: Hours, Parcels, Letters now open inline breakdown panels.
- Breakdown content: Mon..today (this week) vs Mon..Sun (last week), per-day values, totals, and Δ%.
- Clickable Weekly X Trend pills (Hours/Parcels/Letters) with detail panels that show:
  - Day-by-day Δ% vs last week (Mon..today)
  - Weighted average Δ% (Mon weight=1 … today=n)
  - Cumulative Δ% (totals so far vs same range last week)
  - Label showing which aggregate the pill uses (Weighted; falls back to Cumulative).
- Color-only rule: only the percentage text is colored (no backgrounds/borders).
- Baseline display rules:
  - Hours: last-week baseline of 0 shows as “Off”.
  - Parcels/Letters: last-week baseline of 0 shows as “0”.
- Service worker cache version bumped to force client refresh.

Decisions captured
- Keep entire tiles/pills clickable (keyboard: Enter/Space) for simplicity.
- No hover tooltips; clarity comes from the click-through panels.
- “Numbers-first” presentation; avoid heavy visuals.

Repo state
- Tag: v2.0.1
- Branch for next work: `feature/monthly-glance`

Verification checklist (manual)
- Click Hours/Parcels/Letters (week) tiles → see tables with Mon..today vs last week, totals, Δ%.
- Click Weekly X Trend pills → see per-day This/Last and Δ% plus Weighted/Cumulative footer.
- Confirm Hours baseline 0 → “Off”; Parcels/Letters baseline 0 → “0”.
- Confirm percentages use color-only styling.

### Next Up — Phase 2 (part 2): Monthly Glance (stacked sparklines)

Scope
- Add a “Monthly Glance” card with three slim, stacked sparklines (Hours, Parcels, Letters).
- Each shows the last 4 Monday-based weeks: current week (partial) + previous 3 full weeks.
- Dots-only with a subtle connecting line; numbers-first, color on points/labels only.
- If Chart.js unavailable, show a compact text fallback (e.g., H: 28, 32, 31, 14).

Data definition
- Weeks are Monday→Sunday.
- W0: current week (Mon..today) partial total.
- W-1, W-2, W-3: previous full week totals.
- Compute totals for each metric (hours, parcels, letters) using existing helpers
  (`startOfWeekMonday`, `endOfWeekSunday`).

Interactions (v1)
- Optional: clicking a dot opens an inline mini-summary for that week (keep minimal to avoid scope creep).
- No tooltips.

Acceptance criteria
- Monthly Glance renders reliably with existing data; does not block app if charts fail to load.
- Labels show week-ending dates (e.g., Sun: “Sep 01”, “Sep 08”…).
- Visual style consistent with current app (no backgrounds, color-only emphasis).
- Behind a feature flag (e.g., `monthlyGlance: false` by default); easy to toggle via Settings.

Out of scope (for this pass)
- Deep drill-down views; advanced hover tooltips.
- Persisted settings server-side (flags remain local).

Ship plan
- Implement on `feature/monthly-glance` behind flag.
- Bump service worker cache version.
- Manual test, PR → merge to `main`, tag v2.0.2.

### 2025-09-14 — v2.0.3 UI polish + weekly totals fix

What we shipped (main)
- Weekly totals compare same range: Mon..today vs last Mon..today in Hours/Parcels/Letters panels.
- Totals row label simplified to “Total (this week vs last)” and highlighted for emphasis.
- Hours/Parcels/Letters panel headers: concise explainer lines; numeric summaries highlighted in the same amber tone as Monthly Glance.
- Settings: added toggle “Compare weekly totals: Mon..today vs last Mon..today” (ON by default).
- Multiple SW cache bumps to ensure rollout.

Repo state
- Tag: v2.0.3 (pending GitHub Release)
- Branch for upcoming work: `feature/phase-3-quick-filters`

Verification checklist (manual)
- Weekly panels: totals row is “this week vs last” and reflects Mon..today ranges.
- Hours panel: explainer in normal color; numeric summary in amber; no redundant lines.
- Parcels/Letters: numeric summary in amber; no duplicate explainer lines.
- Settings toggle flips totals behavior as expected.

---

### Phase 3: Quick Filters + Digest + Mix Visualization

Goals
- Add fast, lightweight insights without heavy visuals or extra network calls.
- Keep numbers-first with optional charts that degrade to text.

Scope
1) Quick Filter card (weekday parsing)
   - Selector: All, Mon, Tue, Wed, Thu, Fri, Sat, Sun.
   - Stats (computed client-side from fetched rows):
     - Count (worked days), Avg hours, Avg parcels, Avg letters, Avg route minutes.
   - Optional tiny sparkline (if Chart.js present); otherwise text fallback (e.g., comma list or mini table).
   - Performance: zero additional DB calls; O(n) over loaded rows.

2) Headline digest (under app title)
   - One-sentence summary comparing this week (Mon..today) vs last (Mon..today).
   - Uses the already-computed blended % (carry-forward → today) to bucket tone:
     - ≤−15%: “much lighter”
     - −15..−5%: “a bit lighter”
     - −5..+5%: “similar to last week”
     - +5..+15%: “a bit heavier”
     - ≥+15%: “much more intense”
   - Copy is calm, encouraging, and brief (Weds-ready but visible any day).
   - Feature flag (ON by default) to show/hide.

3) Parcels vs Letters mix (at a glance)
   - Two 100% stacked bars (text fallback): W-1 vs W0 composition by parcels/letters share of total volume.
   - Text fallback example: “W-1: parcels 41% / letters 59% • W0: parcels 46% / letters 54%”.
   - Optional: small efficiency index (minutes per vol vs last same range) as a sublabel; keep subtle.

Technical notes
- Charts are optional. If Chart.js is absent, show clean text summaries.
- Color-only emphasis, no heavy backgrounds; reuse existing brand/warn tones.
- All computations reuse loaded data; no new API endpoints.

Acceptance criteria
- Quick Filter shows correct stats per weekday selection; sparkline appears only when Chart.js is present.
- Headline sentence appears under title and reflects blended % bucket; can be toggled off in Settings.
- Mix visualization displays composition (stacked bars or clean text) for W-1 and W0.
- No noticeable performance regressions; initial render remains snappy.

Out of scope (Phase 3)
- Deep drilldowns, large interactive charts, or server-side filters.
- Persisted user preferences beyond localStorage flags.

Ship plan
- Implement on `feature/phase-3-quick-filters` behind flags.
- Bump SW cache version.
- Manual test → PR → merge to `main`, tag v2.0.5.

### Phase 3 — Focus Points (next)
- Mix Viz composition bars: show W-1 vs W0 stacked composition (parcels vs letters×0.33) with text fallback.
- Headline digest polish: ensure copy buckets match blended % thresholds; add gentle iconography if space allows.
- Quick Filter UX: add keyboard focus styles and small “days count” badge; keep charts optional.
- Baseline drift sparkline: add anchor label toggle; ensure labels degrade to text if Chart.js missing.
- Reliability: keep header/text visible first, chart render second; no feature can block page load.
