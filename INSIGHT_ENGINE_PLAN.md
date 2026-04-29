# Insight Engine Plan

## Purpose

Turn the app from a long page of disconnected metrics into a guided, story-first system that:

- surfaces what matters first
- explains why it matters
- links the user into the right deeper tool
- keeps the existing math and data model intact

This is **not** an AI plan.

It is a rule-based insight architecture built on top of the current app:

- diagnostics route model
- workday prediction layer
- summaries/insights heuristic layer
- weekly comparison packets
- day compare context

## Product Direction

The app should feel like:

- a live work analyst
- a practical forecasting tool
- a historical pattern explorer

It should **not** feel like:

- one long spreadsheet
- a random stack of cards
- a fake AI narrator

## Core Principle

Every insight should answer one of these questions:

1. What changed?
2. Why does it matter?
3. What should the user open next?

If an insight does not answer at least one of those, it is probably noise.

## Engine Architecture

### Input Layers

The engine should consume normalized outputs, not raw ad hoc calculations wherever possible.

Primary sources:

- shared prediction record
- weekly comparison packets
- diagnostics residuals
- day compare metrics
- summary metrics
- tag history
- trend/history aggregates

### Output Shape

Each insight should produce a structured object:

```js
{
  id: 'week_hours_up',
  lane: 'week',
  priority: 88,
  type: 'trend',
  title: 'Hours are running high',
  summary: 'Week total is up 12% vs last week.',
  evidence: ['36.2h vs 32.3h', 'Office +0.8h', 'Route +3.1h'],
  confidence: 'medium',
  tone: 'plain',
  actionLabel: 'Open Week & USPS',
  actionTarget: 'snapshotCard'
}
```

### Ranking Rules

Insights should be ranked by:

1. magnitude
2. reliability
3. relevance to the current day/week
4. uniqueness vs already shown insights

This prevents five cards from all saying the same thing differently.

## Story Lanes

These are the main narrative lanes the app should organize around.

### 1. Today

Questions:

- How big is today?
- How is today tracking vs normal?
- Is the workday prediction holding up?

Candidate inputs:

- expected end
- actual
- route model expectation
- parcels / letters / flats / office
- heaviness today

### 2. This Week

Questions:

- Is this week heavier or lighter than last week?
- Which metric is moving the most?
- Are we tracking above or below normal?

Candidate inputs:

- Week & USPS
- Weekly Compare
- weekly movers
- weekly heaviness

### 3. Model / Exceptions

Questions:

- Did the route model miss?
- Which days are outliers?
- What reasons are repeating?

Candidate inputs:

- diagnostics residuals
- dismissed/tagged history
- hit/miss trend
- route-model prediction

### 4. Trends / History

Questions:

- What patterns keep repeating?
- Which weekday trends are strong?
- Are letters, parcels, office, or flats shifting over time?

Candidate inputs:

- over-time charts
- weekday averages
- rolling comparisons
- future flats / office historical views

### 5. Milestones

Questions:

- Where am I year-to-date?
- What pace am I on?
- What quality metrics stand out?

Candidate inputs:

- yearly totals
- pace vs target
- misdelivery rate
- sleep/drink if enabled

## First Insight Types

These are the first rule-based insight types worth building.

### Today Lane

1. Expected end drift
- Compare predicted workday vs actual progress/result

2. Route heavier/lighter than same-day average
- Route-only signal

3. Office heavier/lighter than same-day average
- Operational setup/load signal

4. Flats effect
- High or low flats time relative to norm

5. Volume composition shift
- Parcels up while letters down, etc.

### Week Lane

6. Week hours up/down
- Total worked hours vs last same range

7. Week volume up/down
- Combined parcels + letters signal

8. Weekly mover leader
- Biggest factor this week: office, route, volume, flats later

9. Week efficiency shift
- Route min/vol change

10. Week anomaly days
- Pull from Weekly Compare outlier line

### Model / Exceptions Lane

11. Route model miss today
- When diagnostics residual is large

12. Most common recent tag
- Top reason pattern from dismissed/tagged history

13. Repeating miss pattern
- Same reason repeated on same weekday or similar conditions

14. Clean streak / stable streak
- No major residuals over recent period

### Trends / History Lane

15. Office trend change
- Office time rising/falling over recent window

16. Parcel trend change
- Parcel trend over recent window

17. Letter trend change
- Letter trend over recent window

18. Flats emerging signal
- Once enough flats data exists

### Milestones Lane

19. Pace vs yearly target

20. Misdelivery quality trend

## Confidence Rules

The engine should avoid overclaiming.

Suggested confidence levels:

- `high`
  - enough sample size
  - clear delta
  - stable comparison basis

- `medium`
  - decent signal
  - smaller sample or moderate delta

- `low`
  - interesting but noisy
  - show as softer language

Example language policy:

- `high`: `Office time is clearly trending up.`
- `medium`: `Office time appears to be running higher.`
- `low`: `Office time may be drifting upward.`

## Tone Rules

The app should have personality, but not fake personality.

Tone goals:

- concise
- clever when warranted
- calm
- grounded in evidence

Avoid:

- hype
- generic motivational filler
- pretending certainty where none exists

## UI Direction

The engine should support a stronger skin without forcing a rewrite.

### Immediate layout principle

Show:

1. top insight
2. supporting evidence
3. one clear action

Hide the raw table/card unless the user drills deeper.

### Presentation approach

- summary-first
- progressive disclosure
- grouped by story lane
- raw metrics below insights, not above them

## Phase Plan

### Phase 1

- define shared insight object
- implement 5-8 first insight rules
- render a single insight lane cleanly

### Phase 2

- rank multiple insights
- support lane grouping
- add stronger drill actions

### Phase 3

- redesign surface layout around story lanes
- refine tone and confidence language
- add route-model tile / route expectation surface

## Dependencies

Do not install anything yet.

Possible later addition:

- `simple-statistics`

Only add it when there is a concrete need for:

- z-scores
- quantiles
- rolling confidence
- stronger anomaly thresholds

No LLM dependency is planned for this engine.

## Current Recommendation

Next design work should be:

1. choose the first lane to prototype
- recommended: `Today` or `Model / Exceptions`

2. pick the first 5 insight cards

3. mock the lane layout inside the existing app before wider re-skin work
