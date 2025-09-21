# NEXT

Milestone tag: v2.0.4-phase3-qf

Scope: Phase 3 — Quick Filter and weekly compares are in place; Mix Compare removed by design. Focus on correctness, clarity, and small UX polish.

Immediate Tasks
- Percentages correctness
  - Standardize W1 (Mon..today) vs W2 (last same range) across: Snapshot details, any summary lines that mention W1/W2, and labels. DONE (Mix section labels use W1=current, W2=last; percent math consistent)
  - Verify math on Hours/Parcels/Letters week compare; ensure no mixing baseline vs raw in the same line. DONE
- Baseline compare details
  - Weekday alignment + min baseline guard (≥5 units); surface “days used”. DONE (shows “x day(s) used” and guards by weekday baseline >= 5)
  - Keep optional baseline mode; ensure it never crashes UI when off. DONE (graceful branches and text fallback)
- Quick Filter polish
  - Add a tiny “Normalized” badge near the legend when 2+ metrics selected. DONE (qfNormBadge)
  - Add an “All metrics” quick toggle button. DONE (qfAllMetrics)
  - Optional: show a faint 0/50/100 ruler line only when normalized. DONE (qfShowRuler, persisted)

Quality/Reliability
- Keep headers/text visible before charts; charts use text fallbacks.
- Maintain service worker cache bumps on user‑visible changes.
  - Bumped to rs-pwa-v2025-09-20-02

---

Phase 4 — Summary + UX (target: v2.0.5-phase4-summary)

Scope (initial)
- Smart Summary v1 (rule-based), under headline; 1–2 sentences, always degrades to text. Flag: `headlineDigest` or separate `smartSummary`.
  - Implemented: `smartSummary` flag, text-only summary with Hours/Volume/Efficiency vs last same range; renders any day.
- Collapsible Dashboard (experimental) behind `collapsedUi` — scaffolding merged; add polish (styles, accessibility attributes) and global Expand/Collapse control (added; test and refine).
- Quick Entry (experimental): compact Hit Street/Return buttons when Add Entry is collapsed (no stopwatch), behind `quickEntry` flag.
- W labels: keep W1..Wn with most recent as W1 across views.

Out of scope (consider later in Phase 4/5)
- Optional AI summary provider behind a separate flag; rule-based remains default.
- Composition view (stacked W1 vs W-1); Volatility (z-scores) toggle.

Ship plan
- Merge to main behind flags; bump SW cache; tag `v2.0.5-phase4-summary`.
- Verify Force Refresh path and Settings toggles.

Nice‑to‑have (post‑Phase 3)
- Volatility view (z‑scores) behind a toggle.
- Composition view (W1/W2 100% stacked, text fallback).

How to verify
- Quick Filter: Mondays → toggle metrics → lines render with normalization note and coverage text.
- Monthly Glance: colors match (Parcels blue, Letters yellow, Hours green); clicking a point shows week summary.
- No ReferenceErrors in banner after toggling Settings and reloading.
