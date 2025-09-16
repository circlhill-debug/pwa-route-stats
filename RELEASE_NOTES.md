# Release Notes

## v2.0.2 — Phase 2 (part 2)

- Monthly Glance: 3 slim sparklines (Hours, Parcels, Letters) with numeric labels; text fallback when charts unavailable.
- Auto‑load local Chart.js if missing; fixed sparkline sizing.
- Simple green/red delta option (default); progressive color option remains in Settings.
- Holiday‑aware baseline: Monday Off → Tuesday baseline uses Mon+Tue from last week; rows marked “(adj)”.
- Off‑day handling: per‑day Δ% shows “—” for current‑week off days; advanced pills ignore off‑day rows.
- Same‑Count Weekly Avg: pills compare N worked days this week vs first N worked days last week; detail panels show Weekly Avg, Weighted, and Cumulative.
- Settings: “Show Weekly Trend pills (power users)” toggle — hidden by default.
- Service worker cache bumped; hard reload may be required.

---

Previous releases: see tags v2.0 and v2.0.1.
## v2.0.3 — UI polish + weekly totals fix

- Weekly totals: compare Mon..today vs last Mon..today in Hours/Parcels/Letters panels; label totals as “this week vs last”.
- Hours panel copy: kept explainer in normal color; shows numeric summary with amber highlight (matches Monthly Glance); removed redundant sentence.
- Parcels/Letters panels: cleaned explainer duplication; added matching amber numeric summary.
- Settings: added “Compare weekly totals: Mon..today vs last Mon..today” toggle (on by default).
- Service worker: multiple cache bumps to ensure smooth rollout.
