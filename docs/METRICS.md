# Route Stats — Metrics Data Sheet

This sheet explains what each number means and how it’s computed so you can trust what you see at a glance.

## Units & Conventions
- Hours: Stored/compared in hours (e.g., 4.75 = 4h45m).
- Route adjusted hours: `route_hours − boxholder_offset_minutes/60` (x1=30m, x2=45m, x3=60m).
- Combined volume: `parcels + (w × letters)` with a learned letter weight `w = bl ÷ bp` (defaults to 0.33 until the model has data).
- “Mon..today”: This week-to-date (WTD). “Last” means last full week (Mon..Sun) unless noted.

## Dynamic Volume Model
- Model: `route_minutes ≈ a + (bp × parcels) + (bl × letters)`; coefficients update whenever new entries are added.
- `bp` — minutes per parcel (parcel slope) and `bl` — minutes per letter (letter slope) capture how volume drives time.
- Learned weight `w = bl ÷ bp` converts letters into parcel equivalents so mixed volume comparisons stay fair.
- `R²` shows what share of route-minute variance the model explains; higher = fit follows your history more closely.
- The pills in the header surface these live values so you can spot shifts in the route quickly.

## Snapshot Tiles (top row)
- Volume (0–10): Percentile rank vs your recent worked days using combined volume. 3/10 ≈ 30th percentile (not “30% of max”).
- Route Eff. (0–10): Today’s adjusted route hours vs the typical average for this weekday (historical). Higher is better.
- Overall (0–10): Today’s total hours vs this weekday’s expected average (Office + Route). Higher is better.

Click any tile to see a short plain‑English explanation. Hover tooltips show details.

## Today Deltas
- Today Parcels Δ / Letters Δ: Today vs last same weekday you worked.
- Today Office Δ: Office minutes today vs last same weekday you worked.

## Diagnostics — Volume→Time Model
- View: Settings → Diagnostics → "Volume → Time" shows the model coefficients alongside fit quality.
- Coefficients panel: watch `bp`, `bl`, `w`, and `R²` week-to-week; big swings hint at changes in route mix or data entry issues.
- Residuals list: highlights days where actual route minutes were far above/below the prediction; use Reason tags to explain recurring outliers.
- Toggle "Show Residuals" to sort the biggest misses (± minutes) and decide if they’re noise, weather, detours, or require baseline tweaks.
- Export: copy the table straight into notes when coaching or reviewing past adjustments.
- **Tag & dismiss workflow**: use the “Tag & dismiss” button to log one or more comma-separated reasons (e.g., `parcels +15, flats +10`). The residual is hidden, the tag list is stored locally (and in Supabase), and you can reinstate it via “Manage dismissed.” Tagged days feed future summaries.

## Smart Summary (under the title)
- Week‑to‑date comparison (Mon..today) vs last Mon..today.
- Includes three movers when ≥5%:
  - Hours: Total hours WTD vs last.
  - Volume: Combined volume WTD vs last.
  - Efficiency: Change in `route adjusted hours per combined volume` (min/vol). Lower is better.

## Weekly Compare (card)
- Volume overlay: Last full week (blue) vs this week so far (yellow) by weekday.
- Expectation band: translucent orange min/max envelope computed from up to four recent non-vacation weeks, so you can tell at a glance whether current volume is within the historical range.
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
- Settings → Vacation Mode to exclude date ranges from analytics (charts/tiles). Add multiple spans with “Add Range”; remove any from the list as needed.
- Entries inside a saved range are hidden from analytics but remain in the table with a superscript `v`; tooltips append `(v)` for clarity.

## Optional Reason Tag
- Add a short “Reason (optional)” on a day (e.g., Boxholders, Detour, Weather). It’s surfaced in Weekly Compare outliers.
- Stored in `weather_json` as `Reason: …` (no DB migration needed).
- Diagnostics tags (`Tag & dismiss`) share the same spirit—use them to keep context for the residuals table and future AI summaries (each tag can carry its own minutes).

## Quick Filter
- Pick a weekday to see pills and a sparkline for the last N filtered days (normalized when multiple metrics are on). Ruler option shows 0/50/100.

## AI Summary & Token Usage
- Settings → AI Summary: store your OpenAI API key locally, tweak the base prompt, and view token usage counters (today/week/month plus optional monthly limit).
- “Generate summary” (Diagnostics card) sends curated diagnostics context to `gpt-4o-mini` and returns three upbeat bullets (root cause, suggested action, trend to watch). Results are cached locally (and synced via Supabase) so you can collapse/expand without re-running.
- Token usage card auto-increments after each summary; edit the fields in Settings if you need to adjust or reset the totals.

## Data Integrity Tips
- Ensure route start/return times are correct; don’t overlap office and route.
- Mark Boxholders on days they occurred so adjustments reflect reality.
- Use Reason tags on outlier days to keep context for later.
