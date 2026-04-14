# MOBILE_FOCUS_NEXT

Branch target: `dev/mobile-focus-integrated`

Purpose: keep the Focus Mode mobile track explicit, testable, and synced with `main` direction.

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

## Branch Sync Rule (Main Hotfixes)

When a production hotfix is made on `main`, sync it into mobile dev branch immediately:
- Step 1: Commit + push hotfix on `main`.
- Step 2: Switch to `dev/mobile-focus-integrated`.
- Step 3: Bring hotfix in via one of:
  - `git merge origin/main` (when taking all recent main updates), or
  - `git cherry-pick <hotfix_commit>` (when only one/few fixes are needed).

This keeps production stable and prevents mobile branch drift.

## Recent Updates

- 2026-04-14: Shelving mobile work temporarily.
  1) Branch to resume from: `dev/mobile-focus-integrated`.
  2) Last active focus: page-first polish for `Exceptions & Signals` plus improved insight density/title cleanup.
  3) Next pickup: validate `Exceptions & Signals` on iPhone, then propagate approved tile-based visual pattern to `Week Pulse`, `Daily Movers`, `Efficiency Lens`, and `Milestones`.
- 2026-03-28: Exceptions & Signals page-first polish pass:
  1) Insights header is now single-line context (`Insights: <Page>`), removing duplicate stacked title feel.
  2) Exceptions top metrics are mini-tile buttons with quick drill actions; added top-reason badges with count + percent.
  3) Delta coloring now targets only arrow/percent indicators (not whole row text); renamed Efficiency label to `Office Time`.
- 2026-03-26: Phase 2A visual density pass for iPhone Focus shell:
  1) Hide model strip outside Focus home (`today/quick`) to reclaim viewport space in detail pages.
  2) Remove duplicate large Insights top title; keep only in-page insights title.
  3) Increase insights text scale and compress bottom action buttons; add trend color cues for up/down rows.
- 2026-03-25: Implemented Phase 2A Insights shell rewrite in Focus Mode:
  1) New 5-page flow: Daily Movers, Week Pulse, Efficiency Lens, Milestones, Exceptions & Signals.
  2) Added new per-page metric wiring and retained diagnostics/day-compare Lite drill entry points.
  3) Updated insight nav labels and deep links to Today/Week/Milestone/Day Compare destinations.
- 2026-03-24: Created tracker and locked current three priorities:
  1) Insights curation,
  2) Week Full vs Drill curation,
  3) Gesture-first mode with arrows optional.
