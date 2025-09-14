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
