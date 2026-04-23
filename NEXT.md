# NEXT

Tracking note:
- `NEXT.md` is the source-of-truth tracker for `main` app work.
- `MOBILE_FOCUS_NEXT.md` is the source-of-truth tracker for Focus Mode mobile branch work.
- Process rule: after any commit that changes behavior in either track, update the corresponding tracker in the same commit (or immediate follow-up).
- Continuity rule: also update the tracker whenever the task list, audit depth, or recommended next resume point changes, even if no code was committed yet.
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

- App-state risk reduction around diagnostics/forecast boundaries
  - `6238050` `Reduce app.js user-settings sync coupling`
  - `8ebbfc1` `Extract forecast surface helpers from app state`
  - `873a8ef` `Share volume-time model across diagnostics and summaries`
  - `7a24700` `Refresh diagnostics after reinstating dismissed date`
  - `994fca0` `Add shared daily prediction record`
  - `2d95718` `Add actual end snapshot tile`
  - `ed9f6ea` `Add actual tile actions and align weekly compare details`
  - `fa47de8` `Expand state persistence and sync coverage`
  - Prediction vs actual path now has a shared daily record
  - Actual tile exists and routes into diagnostics/tagging workflow
  - State persistence and sync coverage expanded

- Weekly comparison audit, sub-pass 1
  - `ab4f34c` `Clarify weekly comparison modes and improve detail readability`
  - Named weekly comparison modes introduced:
    - `calendar_same_range`
    - `matched_workday_count`
    - `baseline_array`
  - Weekly Compare details no longer mix percent source and displayed totals
  - Weekly Compare readability/labels improved
  - Item 1 remains in progress; deeper math unification is still open

Next
- Route / office / total normalization audit
  - `1fa659a` `Centralize time normalization across core modules`
  - Shared normalization helpers introduced in `src/utils/timeNormalization.js`
  - Core consumers now routed through shared rules:
    - `src/app.js`
    - `src/features/diagnostics.js`
    - `src/features/summaries.js`
    - `src/features/charts.js`
    - `src/modules/predictionRecord.js`
  - Raw `hours` / `office_minutes` / `route_minutes` grep across `app.js`, `features`, and `modules` is now clean
  - Item 2 is in progress; next step is judgment review of whether any display-only or edge-case paths still need `normalizeTotalHoursRecord(...)` instead of plain hour normalization

- Weekly comparison math audit, sub-pass 2
  - Continue only after item above if needed
  - Decide whether more weekly surfaces should consume shared comparison packets
  - Verify no remaining weekly modules mix:
    - different reference windows
    - different day-count rules
    - different percentage denominators

- Expected vs actual data-path audit, sub-pass 2
  - Verify all snapshot prediction/actual displays use the same normalized fields
  - Confirm no remaining duplicate local calculations for expected/actual summary values

Later
- Split `src/features/charts.js` into smaller chart families
- Split `src/utils/storage.js` by domain
- Reduce direct DOM/UI complexity in diagnostics/day compare
- Consider broader app-state structure cleanup only after the higher-risk fixes above
- Flats / office-time modeling review
  - Add average flats time/day reporting metric
  - Audit where `flats_minutes` is currently ignored
  - Review whether flats should affect office-time expectation and total-day prediction
  - Review whether office-time averages/trends should become part of the predictive layer

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

Current resume point
- Depth-first audit workflow is now preferred:
  - audit the whole site at one depth
  - then move to the next depth across the whole site
- Next resume step:
  - finish `Route / office / total normalization audit` with an edge-case review of total-hours fallback usage, then re-check `Expected vs actual data-path audit`
