# Weekly Compare Redesign

## Problem

The current `Weekly Compare` card is trying to answer too many questions at once:

1. `This week vs last week`
2. `This week vs weekday baseline`
3. `Efficiency trend`
4. `Weekday anomalies`
5. `Baseline drift`

That makes the section hard to read. The current baseline dotted line is especially unclear because:

- it is not directly labeled in the chart
- it is a flat average, not a weekday-shaped baseline
- it appears alongside both parcels and letters, which suggests it belongs to both
- the user cannot tell whether it is:
  - parcels
  - letters
  - combined volume
  - or some blended average

## Goal

Make `Weekly Compare` answer one clear question at a time:

1. `What is the volume trend this week vs last week?`
2. `How is this week tracking against the weekday baseline?`
3. `What changed enough to matter?`

The redesign should reduce chart ambiguity and keep the useful parts:

- weekly volume trend
- route efficiency context
- weekday anomalies
- baseline comparison
- details drilldown

## Recommended Structure

Split the current section into two distinct cards.

### Card 1: Weekly Compare

Primary purpose:

- `This week vs last week`
- volume-focused

This is the top-level operational question:

- `How is this week's workload trending compared to last week?`

### Card 2: Baseline View

Primary purpose:

- `This week vs weekday baseline`

This is the normalization question:

- `Are we above or below the recent weekday baseline?`

This should not share the same chart as the week-vs-last-week trend.

## Card 1: Weekly Compare

### Question

`How is the current week's volume moving compared to last week?`

### Main chart

Use one metric family only:

- weighted `volume`

This avoids plotting parcels and letters separately in the same trend line.

### Lines

1. `This week`
2. `Last week`

Optional third overlay later:

3. `Efficiency (this week)` as a light dashed secondary line

But efficiency should remain secondary, not the main story.

### Labels

Title:

- `Weekly Compare`

Subtitle:

- `This week vs last week`

Support lines:

1. `This week: Parcels X, Letters Y • Last week: Parcels A, Letters B`
2. `Efficiency (min/vol): current vs last`
3. `Weekday anomalies: Thu route time ↓14%`

### Weekday anomalies

Keep the anomaly line in this card, but keep it explicitly route-time based.

Format:

- `Weekday anomalies: Thu route time ↓14%`

Rules:

- only include current-week worked days
- never include vacation days
- never include not-yet-entered days
- never include off days

### Click behavior

1. Main `Details` button:
   - opens the text detail block for this card only
2. Later optional:
   - click chart point opens the weekday drilldown row in a detail panel

## Card 2: Baseline View

### Question

`How is this week performing relative to the weekday baseline?`

### Main chart

Use a weekday-shaped baseline series, not a flat average line.

Plot:

1. `Current week volume by weekday`
2. `Weekday baseline volume by weekday`

This means:

- Monday current vs Monday baseline
- Tuesday current vs Tuesday baseline
- Wednesday current vs Wednesday baseline

and so on.

### Metric

Use weighted `volume` as the default chart metric.

Reason:

- one line
- one baseline
- one meaning
- avoids parcel/letter dual-axis confusion

Parcels, letters, and hours remain available in the detail text below.

### Labels

Title:

- `Baseline View`

Subtitle:

- `This week vs weekday baseline`

Chart legend:

1. `Current volume`
2. `Weekday baseline`

### Baseline drift note

Do not hide baseline drift inside a mystery line.

Show it explicitly below the chart.

Examples:

- `Baseline drift: volume +8% vs prior anchor weeks`
- `Baseline drift: route time -5% vs prior anchor weeks`
- `Baseline drift: stable`

### Click behavior

1. `Details` button:
   - opens baseline detail rows
2. Later optional:
   - metric toggle between:
     - `Volume`
     - `Parcels`
     - `Letters`
     - `Hours`

For phase one, keep this fixed to `Volume`.

## Details Strategy

The text detail area should remain useful, but should be narrower in scope per card.

### Weekly Compare details

Show:

1. parcels vs last week
2. letters vs last week
3. hours vs last week
4. efficiency note

This section answers:

- `How did the actual week compare to last week?`

### Baseline View details

Show:

1. parcels vs baseline
2. letters vs baseline
3. hours vs baseline
4. used day count
5. baseline source note

This section answers:

- `How did the week compare to the weekday baseline?`

## Baseline Source Wording

The app should state what the baseline actually is.

Suggested wording:

- `Weekday baseline uses recent weekday averages from stored baseline history.`

If we keep the current storage logic for now:

- `Weekday baseline uses weekday averages from the last two full weeks.`

That needs to be explicit in the UI.

## What To Remove

Remove these from the current mixed card:

1. flat dotted average baseline line
2. unlabeled baseline line
3. parcels and letters sharing an unclear baseline reference in one chart
4. multiple meanings in one visual area

## Phase 1 Implementation Order

1. Keep the current `Weekly Compare` card shell.
2. Convert the top chart to:
   - weighted volume only
   - this week vs last week
3. Keep:
   - weekly volume summary line
   - efficiency line
   - weekday anomalies line
4. Move baseline comparison into a second card to the right when space allows.
5. In the new baseline card:
   - plot current weekday volume vs weekday baseline volume
   - add explicit baseline drift note
6. Keep existing detail tables, but split them by card purpose.

## Mobile / Narrow Layout

On narrow screens:

1. `Weekly Compare` stays first
2. `Baseline View` stacks below it

The two-card distinction should remain even when stacked vertically.

## Future Enhancements

1. Metric toggle in `Baseline View`
2. Click weekday point to open targeted drilldown
3. Route-time baseline mode
4. Year-over-year weekly callback inside the baseline card
5. Shared highlight flows with diagnostics and day compare

## Final Direction

Use this split:

1. `Weekly Compare`
   - volume trend
   - this week vs last week
   - efficiency secondary
   - weekday anomalies

2. `Baseline View`
   - current week vs weekday baseline
   - weekday-shaped baseline
   - explicit drift note
   - details separate from week-vs-last-week logic

That is the cleanest way to make the section readable again.
