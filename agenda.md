# Working Agenda

Updated: 2025-09-19 (late)

Phase 3 — Current State
- Today tiles: raw vs last same weekday (worked) — in place.
- Weekly day-by-day panels: cumulative Mon..today vs last Mon..today — in place.
- Parcels vs Letters compare: removed (per scope simplification).
- Quick Filter: upgraded
  - Metric toggles (Parcels blue, Letters yellow, Hours green).
  - Normalizes values when multiple metrics selected so lines are comparable.
  - Last N selector (8/12/20) with availability guard and summary (e.g., “Showing K of N requested, available M”).
  - Thicker lines, better point visibility, colored legends.
- Monthly Glance: colors aligned with Quick Filter (Parcels=blue, Letters=yellow, Hours=green).
- Stability: Guarded against previous ReferenceErrors; SW cache bumped after changes.

Immediate Next Tasks
- Percentages correctness: audit and standardize W1 (Mon..today) vs W2 (last same range) across all summaries, ensure labels are consistent.
- Baseline compare in details: keep weekday alignment + min guard; show “days used”.
- Quick Filter polish:
  - Optional “Normalized” badge near legends when multi-series is normalized.
  - Optional “All metrics” one-click toggle.
  - Optional axis hint or tiny 0/50/100 ruler only when normalized.
- Reliability: keep headers visible and never block on charts (text fallbacks already in place).

Parking Lot (post‑Phase 3)
- Optional volatility (z-scores) view (separate toggle).
- Composition view for W1/W2 (100% stacked text fallback) if needed.

Handoff Outline (copy into new chat)
- Context: Phase 3 in progress. Today tiles (raw vs last weekday) and weekly cumulative compares are done. Parcels vs Letters compare section removed by choice. We upgraded Quick Filter and aligned Monthly Glance colors.
- Quick Filter: metric toggles (P/L/H), multi-series normalization, Last N selector with guard, colored legends, thicker lines, text summary shows coverage and “(normalized)” when applicable.
- Monthly Glance: Parcels=blue, Letters=yellow, Hours=green; points clickable for per-week mini summaries.
- Stability: prior ReferenceError fixed; service worker cache bumped; recommend Settings → Force Refresh after deploys.
- Next tasks: unify percentages (W1 Mon..today vs W2 same range), surface “days used” for baseline compares in details, add optional Normalized badge + All metrics toggle, and ensure consistent labels.
