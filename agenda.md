# Working Agenda

Updated: 2025-09-19

Focus
- Fix percentages: align ranges (W1 Mon..today vs W2 same range), baseline-normalized deltas, and clear labels.
- Keep today/weekly tiles simple: raw vs last same weekday; cumulative Mon..today vs last Mon..today.
- Restore Mix Viz reliability (done): header always shows, errors guarded.

New Work — Historical Baseline Comparison
- Add a button near Mix Viz header to toggle a compact chart.
- Show three index lines (Parcels, Letters, Hours) vs a fixed anchor (= median of last 5 completed weeks).
- Index(t) = 100 × weekly_total(t) / anchor.
- X-axis: last 8 completed weeks (W8…W1). W1 = most recent completed week.
- Fallback: text summary if Chart.js is unavailable.

Decisions
- No rolling/resampled baselines; anchor is fixed per metric across the sparkline.
- Use guards: min baseline (P/L ≥5 units, H ≥1h) or skip points.
- Efficiency remains separate (min/vol), not forced into the index view.

Next Steps
- Validate index series against sample data; spot-check a few weeks.
- Consider a small debug toggle to print aligned totals and anchor values in details.
- Iterate copy/labels for clarity once numbers are verified.

