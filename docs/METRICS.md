# Route Stats — Metrics Data Sheet

This sheet explains what each number means and how it’s computed so you can trust what you see at a glance.

## Units & Conventions
- Hours: Stored/compared in hours (e.g., 4.75 = 4h45m).
- Route adjusted hours: `route_hours − boxholder_offset_minutes/60` (x1=30m, x2=45m, x3=60m).
- Combined volume: `parcels + 0.33 × letters`.
- “Mon..today”: This week-to-date (WTD). “Last” means last full week (Mon..Sun) unless noted.

## Snapshot Tiles (top row)
- Volume (0–10): Percentile rank vs your recent worked days using combined volume. 3/10 ≈ 30th percentile (not “30% of max”).
- Route Eff. (0–10): Today’s adjusted route hours vs the typical average for this weekday (historical). Higher is better.
- Overall (0–10): Today’s total hours vs this weekday’s expected average (Office + Route). Higher is better.

Click any tile to see a short plain‑English explanation. Hover tooltips show details.

## Today Deltas
- Today Parcels Δ / Letters Δ: Today vs last same weekday you worked.
- Today Office Δ: Office minutes today vs last same weekday you worked.

## Smart Summary (under the title)
- Week‑to‑date comparison (Mon..today) vs last Mon..today.
- Includes three movers when ≥5%:
  - Hours: Total hours WTD vs last.
  - Volume: Combined volume WTD vs last.
  - Efficiency: Change in `route adjusted hours per combined volume` (min/vol). Lower is better.

## Weekly Compare (card)
- Volume overlay: Last full week (blue) vs this week so far (yellow) by weekday.
- Route h (this): Dashed line (right axis) for this week’s adjusted route hours per weekday.
- Efficiency label: Shows `min/vol` this week vs last with an up/down indicator.
- Outliers: Lists weekdays where route hours are >+10% vs the same weekday last week and shows any Reason tag.

## USPS Evaluation (header tag + tiles)
- Fixed tag: Route ID, Eval (e.g., 44K), Boxes, Salary, Hours/day, Office/day.
- Hours vs Eval (tile): Weekly progress percent = WTD hours ÷ (hours/day × worked days). Tooltip shows `Xh of Yh eval`.
- Weekly $/h (tile): 4‑week rolling average of `(annualSalary / 52) / hours` (completed weeks only).

## Boxholders (route adjustments)
- Offsets add time on the street; we subtract offsets from route hours for efficiency metrics:
  - x1: 30m, x2: 45m, x3: 60m.
- Shown in header tooltips as a note (“adjusted −30m (≈0.5h)” etc.).

## Holiday handling
- If a day is Off + Holiday (observed), the next weekday baseline includes last week’s previous day + that day so comparisons aren’t skewed.
- Works for any weekday; Sundays don’t carry into Monday (new week).

## Vacation Mode
- Settings → Vacation Mode to exclude a date range from analytics (charts/tiles). The table remains unchanged.

## Optional Reason Tag
- Add a short “Reason (optional)” on a day (e.g., Boxholders, Detour, Weather). It’s surfaced in Weekly Compare outliers.
- Stored in `weather_json` as `Reason: …` (no DB migration needed).

## Quick Filter
- Pick a weekday to see pills and a sparkline for the last N filtered days (normalized when multiple metrics are on). Ruler option shows 0/50/100.

## Data Integrity Tips
- Ensure route start/return times are correct; don’t overlap office and route.
- Mark Boxholders on days they occurred so adjustments reflect reality.
- Use Reason tags on outlier days to keep context for later.

