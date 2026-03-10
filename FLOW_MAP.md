# Focus Mode Flow Map (Refined for Codex)

## Goal
Define mobile navigation flow before final layout polishing.

Focus Mode is not just a smaller responsive dashboard. It is a **single-section, full-screen mobile experience** where one dashboard section at a time takes over the viewport for easier reading, tapping, and navigation.

This draft covers `Today`, `Week`, `Entry`, and `Insights` first.

---

# Core Focus Mode Principle

When a user opens a Focus page, only that section should be shown on screen.

Examples:
- If user opens `Today Full`, the mobile screen should show only the **Today tile content**, expanded to fill the viewport.
- If user opens `Week Full`, the mobile screen should show only the **Week tile content**, expanded to fill the viewport.
- If user opens `Insights`, the mobile screen should show only the selected insight page, not the rest of the dashboard.

### Important UI rule
Focus Mode should preserve the visual identity and interaction style of the full dashboard:
- badges should still look like badges
- cards should still look like cards
- existing clickable badges/cards should remain clickable
- do not flatten everything into generic mobile list rows unless necessary

The purpose of Focus Mode is:
1. isolate one information group
2. make it easier to see and digest
3. preserve tappable pathways into deeper tools

---

# Layer Model

- `Quick`: fastest glance, lowest cognitive load
- `Full`: full-screen focused version of that tile/group using existing visual language
- `Lite`: focused drilldown inside Focus Mode
- `Full Tool`: existing dashboard card/tool destination outside Focus Mode

---

# Global Navigation Rules

### Horizontal swipe
- moves between sibling pages in the current channel
- does **not** wrap at the ends

### Vertical scroll / swipe up
- allowed inside a Focus page when that page has more content than fits on one screen
- example: `Today Full` may show first set of badges on screen one, then additional badges below on scroll/swipe

### Tap nav chip
- jumps to named page in the current channel

### Back behavior
- Back should return to the immediately previous Focus page/state
- do not reset to home or Quick unless that was the actual previous screen
- this is especially important when a clickable badge opens a second-layer Lite page or Full Tool

### Open Full Tool
- exits Focus Mode and jumps to the existing full dashboard section/card/tool

### Back to Focus
- returns to the last in-focus page and state
- restore prior channel and subpage memory

---

# State Memory Rules

Persist these values:
- last channel (`today | week | entry | insights`)
- last sub-page within each channel
- last Lite drill view within each channel if opened
- last scroll/page position within a Focus page if practical

`Back to Focus` should restore the user to where they actually were, not a default page.

---

# Today Channel

## Purpose
The Today channel should feel like an isolated, full-screen version of the Today tile system.

## Page Order
1. `Today Quick`
2. `Today Full`
3. `Today Drilldown` (optional/future if needed)

## Today Full Behavior
`Today Full` should expand the Today tile to fill the mobile viewport.

Example layout behavior:
- show Today badges in a larger, easy-to-read mobile grid
- preserve badge styling and tap interactions
- if there are 8 badges they may appear as:
  - `2 x 4` on one screen, or
  - multiple vertical sections accessible via scroll/swipe

Do **not** show unrelated dashboard tiles while in `Today Full`.

---

# Week Channel

## Purpose
Week channel should isolate weekly understanding into a full-screen mobile flow.

## Page Order
1. `Week Quick`
2. `Week Full`
3. `Week Drilldown`

## Flow Diagram

Week Quick <–> Week Full <–> Week Drilldown
|              |               |
| tap metric    | tap metric    | tap:Open Full Tool
v              v               v
Lite:Hours     Lite:Parcels     Full Tool
Lite:Letters


## Week Full Behavior
`Week Full` should be a full-screen focused version of the Week tile/group.

It should:
- preserve clickable badges/cards from the existing weekly tile
- keep the weekly tile’s visual style
- fill the mobile viewport with only weekly content
- remain summary-first, not a dense metric dump

### Include
- weekly hours
- weekly parcels
- weekly letters
- primary deltas
- route evaluation snapshot
- trend indicators
- extra-trip summary
- notable flags if useful

### Avoid
- displaying every USPS submetric simultaneously
- spreadsheet-style dense data

## Week Drilldown
Focused single-dimension views:
- Hours
- Parcels
- Letters

Each drilldown page should remain concise and readable while linking to deeper tools.

## Deep Links
- `Open Weekly Snapshot` → `snapshotCard`
- `Open Hours Breakdown` → `wkHoursDetails`
- `Open Parcels Breakdown` → `wkParcelsDetails`
- `Open Letters Breakdown` → `wkLettersDetails`

---

# Entry Channel

## Purpose
Entry flow should support fast real-world logging with minimal friction.

## Page Order
1. `Entry Quick`
2. `Entry Form Lite`
3. `Entry Validate`

## Flow Diagram

Entry Quick <–> Entry Form Lite <–> Entry Validate
|                 |                    |
| instant taps    | open full form     | tap:Save
v                 v                    v
Instant actions   Full Tool (optional)   Save / confirm

## Entry Quick
Provides instant timestamp actions:
- Start now
- Hit street now
- Clock out now

Also displays current field preview.

## Entry Form Lite
Essential fields only:
- date
- times
- parcels
- letters
- flats time
- misdelivery

### Save Rule
Allow direct save from Lite when minimally valid.

If fields appear inconsistent:
- route to `Entry Validate`
- show warning indicators
- allow correction without losing entered data

## Entry Validate
Advisory validation screen showing:
- office / route / total consistency
- warning indicators for possible mistakes

This screen should assist the user, not block them unnecessarily.

## Deep Links
- `Open Add Entry Form` → `addEntryCard`

---

# Insights Channel

## Purpose
Insights should present key signals clearly, one insight per page.

## Page Order
1. `Weekly Movers`
2. `Heaviness Today`
3. `Heaviness Week`
4. `Diagnostics`
5. `Day Compare`

## Flow Diagram

Movers <–> Today Heaviness <–> Week Heaviness <–> Diagnostics <–> Day Compare
|                 |
v                 v
Diagnostics Lite    Day Compare Lite
|                 |
v                 v
Full Tool (diagnosticsCard / dayCompareCard)

## Behavior
- maintain the current insight sequence
- each page should focus on one clear message
- allow deeper Lite views
- support persistent Back behavior

---

# Back Button Requirements

Back navigation must preserve context.

Examples:
- `Week Full` → tap Hours badge → `Lite:Hours` → Back returns to `Week Full`
- `Diagnostics` → `Diagnostics Lite` → open full diagnostics tool → Back to Focus returns to prior insight page
- `Today Full` → tap badge → deep destination → Back returns to `Today Full`

The Back button must not reset the navigation stack unnecessarily.

---

# Design Interpretation Notes

Focus Mode should be interpreted as:

- single-channel immersion
- full-screen tile expansion
- preserved badge/card interactions
- persistent contextual back navigation
- simplified mobile reading

Focus Mode should **not** be interpreted as:

- a generic stacked mobile dashboard
- a text-only simplified view
- a navigation pattern that frequently resets to home

Focus Mode is a **mobile-first isolated dashboard lens**, not a separate application.

---

# Decisions Locked In

1. `Week Full` remains summary-focused
2. `Entry Form Lite` allows direct save when minimally valid
3. Back navigation restores the previous Focus state
4. swipe navigation does not wrap
5. Focus pages display only their section content
6. badge/card click behavior remains active inside Focus Mode
