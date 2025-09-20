# NEXT

Milestone tag: v2.0.4-phase3-qf

Scope: Phase 3 — Quick Filter and weekly compares are in place; Mix Compare removed by design. Focus on correctness, clarity, and small UX polish.

Immediate Tasks
- Percentages correctness
  - Standardize W1 (Mon..today) vs W2 (last same range) across: Snapshot details, any summary lines that mention W1/W2, and labels.
  - Verify math on Hours/Parcels/Letters week compare; ensure no mixing baseline vs raw in the same line.
- Baseline compare details
  - Weekday alignment + min baseline guard (≥5 units); surface “days used”.
  - Keep optional baseline mode; ensure it never crashes UI when off.
- Quick Filter polish
  - Add a tiny “Normalized” badge near the legend when 2+ metrics selected.
  - Add an “All metrics” quick toggle button.
  - Optional: show a faint 0/50/100 ruler line only when normalized.

Quality/Reliability
- Keep headers/text visible before charts; charts use text fallbacks.
- Maintain service worker cache bumps on user‑visible changes.

Nice‑to‑have (post‑Phase 3)
- Volatility view (z‑scores) behind a toggle.
- Composition view (W1/W2 100% stacked, text fallback).

How to verify
- Quick Filter: Mondays → toggle metrics → lines render with normalization note and coverage text.
- Monthly Glance: colors match (Parcels blue, Letters yellow, Hours green); clicking a point shows week summary.
- No ReferenceErrors in banner after toggling Settings and reloading.

