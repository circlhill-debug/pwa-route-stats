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
