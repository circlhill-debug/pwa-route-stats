# NEXT

Tracking note:
- `NEXT.md` is the source-of-truth tracker for `main` app work.
- `MOBILE_FOCUS_NEXT.md` is the source-of-truth tracker for Focus Mode mobile branch work.
- Process rule: after any commit that changes behavior in either track, update the corresponding tracker in the same commit (or immediate follow-up).
- Branch rule: `main` stays production-only. Mobile Focus work must stay off `main` until explicitly finished and merged.
- Sync rule: production fixes land on `main` first, then get merged or cherry-picked into `dev/mobile-focus-integrated` when that branch resumes.

Milestone tag: v2.0.4-phase3-qf

Snapshot note (Oct 25, 2025): modular baseline captured after diagnostics + AI summary extraction (`refactor/modularize-ui` branch — "v2025-10-25_modular-baseline").

Scope: Phase 3 — Quick Filter and weekly compares are in place; Mix Compare removed by design. Focus on correctness, clarity, and small UX polish.

Current production guardrail
- Keep legacy and unfinished Focus Mode UI out of `main`.
- Mobile branch work belongs on `dev/mobile-focus-integrated` until intentionally shipped.

---

Audit Track

Done
- Forecast hardening
  - `9651008` `Harden forecast normalization and add coverage`
  - Deterministic forecast wording
  - Hour/minute normalization fix
  - Weekday parsing hardening
  - Route-time trend priority fix
  - Tag aggregation improvement
  - Forecast coverage added

- Production cleanup for branch discipline
  - `7a4c5c8` `Remove legacy focus shell from production main`
  - `074b00a` `Restore section header collapse behavior`
  - Removed legacy focus shell from `main`
  - Restored normal section header collapse
  - Locked production/mobile branch rules

- Diagnostics storage isolation
  - `0f3bd42` `Isolate diagnostics tag storage helpers`
  - Removed direct diagnostics tag-history writes from UI code
  - Added dedicated diagnostics storage helper
  - Added diagnostics storage coverage

Next
- App-state risk reduction around diagnostics/forecast boundaries
  - Reduce cross-module state coupling
  - Clarify ownership of diagnostics, forecast, and sync logic
  - Reduce orchestration burden in `src/app.js`
  - In progress:
    - diagnostics tag persistence moved out of diagnostics UI into `src/utils/diagnosticsStorage.js`
    - user-settings payload/apply logic moved out of `src/app.js` into `src/modules/userSettingsSync.js`

- Test coverage expansion for settings/state persistence
  - Settings persistence tests
  - User-settings sync tests
  - Diagnostics/forecast integration-path tests

Later
- Split `src/features/charts.js` into smaller chart families
- Split `src/utils/storage.js` by domain
- Reduce direct DOM/UI complexity in diagnostics/day compare
- Consider broader app-state structure cleanup only after the higher-risk fixes above

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
  - Bumped to rs-pwa-v2025-10-25-11

---

Phase 4 — Summary + UX (target: v2.0.5-phase4-summary)

Scope (initial)
- Smart Summary v1 (rule-based), under headline; 1–2 sentences, always degrades to text. Flag: `headlineDigest` or separate `smartSummary`.
  - Implemented: `smartSummary` flag, text-only summary with Hours/Volume/Efficiency vs last same range; renders any day.
- Collapsible Dashboard (experimental) behind `collapsedUi` — scaffolding merged; add polish (styles, accessibility attributes) and global Expand/Collapse control (added; test and refine).
  - Focus Mode: header toggle collapses all non-snapshot sections; persists; includes aria attributes.
  - Replace global Collapse All with Focus Mode (resolved button conflict). Focus Mode OFF now expands all sections.
- Quick polish
  - Quick Entry buttons compact style.
  - Quick Filter: Days badge next to legend; sparkline taller with padding.
  - DOW header copy: “Average Hours by Weekday”.
  - Monthly Glance card always visible; chart optional.
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
- Holiday-aware baselines: smarter post-holiday handling (seasonal profiles, residual annotations, trend dampening).
- Tagging/season labels (e.g., Peak Season) with filters for historical comparisons.

How to verify
- Quick Filter: Mondays → toggle metrics → lines render with normalization note and coverage text.
- Monthly Glance: colors match (Parcels blue, Letters yellow, Hours green); clicking a point shows week summary.
- No ReferenceErrors in banner after toggling Settings and reloading.
