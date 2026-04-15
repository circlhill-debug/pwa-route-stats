# MOBILE_FOCUS_NEXT

Branch target: `dev/mobile-focus-integrated`

Purpose: keep the Focus Mode mobile track explicit, testable, and synced with `main` direction.

Branch discipline
- `main` is production only and must not carry unfinished Focus Mode UI.
- When `main` gets a production fix that mobile also needs, merge `origin/main` into `dev/mobile-focus-integrated` or cherry-pick the specific commit.
- Only merge Focus Mode back to `main` when the mobile work is intentionally finished and approved.

## Current Phase

Phase 2: content curation + gesture-first navigation polish.

## Priority Queue

1. Insights page curation
- Lock exactly which metrics live on each Insights page.
- Keep each page single-message and quick-scan (no metric dump).
- Acceptance:
  - Each Insights page has a defined metric set and title.
  - No duplicate metric appears on 3+ pages unless intentional.
  - Tap path to deeper tool is preserved where relevant.

2. Week Full curation (`Week Full` vs `Week Drilldown`)
- Keep `Week Full` summary-first.
- Move dense details into drill pages (`Hours`, `Parcels`, `Letters`).
- Acceptance:
  - `Week Full` contains only top-level decision metrics.
  - Drill pages open correctly and retain Back context.
  - `Open Weekly Snapshot` routes to Week context (not Today).

3. Gesture-first mode
- Mobile should prioritize swipe navigation hints.
- Arrows should be optional/hidden by default on mobile.
- Acceptance:
  - Swipe prompts are visible and understandable on mobile.
  - Arrow controls can be toggled from Settings.
  - Arrow visibility preference persists across reloads.

## Non-Negotiable Workflow Rule

After **every commit** that changes Focus Mode behavior, immediately update this file:
- Add or adjust impacted task status.
- Note what changed in 1-3 lines under `Recent Updates`.
- If scope changed, update acceptance criteria in the same commit or the immediate next commit.

If a commit is made and this file is not updated, treat it as process debt and fix it in the next commit.

## Recent Updates

- 2026-03-24: Created tracker and locked current three priorities:
  1) Insights curation,
  2) Week Full vs Drill curation,
  3) Gesture-first mode with arrows optional.
- 2026-04-14: Locked branch discipline explicitly:
  `main` stays production-only; mobile work lives on `dev/mobile-focus-integrated` until intentionally merged.
