# Today Insight Cards

## Purpose

Define the first `Today` lane insight cards for the rule-based insight engine.

These are not implementation details yet.
They are product/design targets for:

- what the user should see first
- what each card is trying to say
- which metric pool it should use
- where it should send the user next

## Lane Goal

The `Today` lane should answer:

1. How big is today?
2. Am I tracking near expectation?
3. What is most likely driving the day?
4. What deserves a closer look?

The lane should feel:

- calm
- immediately useful
- not overloaded

## Card Order

Recommended default order:

1. Workday Forecast
2. Route Expectation
3. Workload Driver
4. Day Shape
5. Action / Exception

## Card 1: Workday Forecast

### Purpose

Anchor the user in the practical workday expectation.

### Inputs

- shared prediction record
- expected end
- actual end when available
- predicted total hours
- actual total hours when available

### Suggested display

Title:
- `Workday Forecast`

Primary value:
- `Expected End 4:45 PM`

Support line:
- `Tuesday avg 8.26h`

After day is complete:
- `Actual 4:15 PM`
- `Workday miss -79m`

### Notes

- this is the practical forecast card
- not the route-model card
- hit/miss here refers to worked-hours delta

### Action

- `Open Today Snapshot`

## Card 2: Route Expectation

### Purpose

Surface the route-model expectation directly, without forcing the user into Diagnostics.

### Inputs

- diagnostics route model
- predicted route hours or route minutes
- actual route hours/minutes when available
- residual when available

### Suggested display

Title:
- `Route Expectation`

Primary value:
- `5.8h route`

Support line:
- `Model fit R² 58%`

Post-completion:
- `Actual 5.4h`
- `Residual -24m`

### Notes

- this is the missing companion to `Expected End`
- should clearly be labeled route-only
- should not look like total-day forecast

### Action

- `Open Diagnostics`

## Card 3: Workload Driver

### Purpose

Answer the user’s likely question:
- what is making today big or light?

### Inputs

- parcels delta vs same-weekday average
- letters delta vs same-weekday average
- flats delta when enough data exists
- office time delta

### Suggested display

Title:
- `Main Driver`

Primary statement examples:
- `Parcels are driving today up`
- `Office setup is lighter than normal`
- `Flats are adding office load`

Support bullets:
- `Parcels +18%`
- `Letters -6%`
- `Office +0.4h`

### Notes

- should identify one primary driver first
- should not dump all deltas equally

### Action

- `Open Day Compare`

## Card 4: Day Shape

### Purpose

Describe whether today feels front-loaded, route-heavy, office-heavy, or balanced.

### Inputs

- office vs same-day average
- route vs same-day average
- total vs same-day average
- flats when available

### Suggested display

Title:
- `Day Shape`

Primary statement examples:
- `Office-heavy start`
- `Balanced day so far`
- `Route is lighter than normal`

Support pills:
- `Office +0.5h`
- `Route -0.2h`
- `Total +0.3h`

### Notes

- this card is descriptive
- it should feel like an interpretation layer, not raw arithmetic

### Action

- `Open Today Heaviness`

## Card 5: Action / Exception

### Purpose

Surface whether the user should do anything right now.

### Inputs

- diagnostics residual today
- hit/miss state
- tag history availability
- notes availability

### Suggested display

If day is normal:
- `No major exception detected`

If day is off:
- `Today missed the route model`
- `Tag the reason while it is fresh`

Support line:
- `Weather, flats, detour, traffic, boxholders`

### Notes

- should become the nudge card
- especially useful after the day is logged

### Action

- `Tag & dismiss`
- `Open Diagnostics`

## Card Behavior Rules

### Rule 1

Only one card should own the main workday forecast:

- `Workday Forecast`

### Rule 2

Only one card should own the route-model prediction:

- `Route Expectation`

### Rule 3

Cards should not duplicate the same fact in different wording.

### Rule 4

Every card should have one dominant message and one next action.

## Tone Examples

Good:

- `Parcels are doing most of the lifting today.`
- `Office setup is running lighter than a normal Tuesday.`
- `Route expectation is below average, but office load is elevated.`

Avoid:

- `Today appears to be a statistically significant distribution shift.`
- `You are crushing it today!`
- `Many numbers changed.`

## Implementation Order

Recommended order:

1. Workday Forecast
2. Route Expectation
3. Workload Driver
4. Action / Exception
5. Day Shape

## Open Questions

1. Should `Workday Forecast` and `Route Expectation` live side-by-side in the current snapshot row?
2. Should `Action / Exception` replace some of the current raw delta presentation after the day is completed?
3. How much of this should live in the current desktop main app before later being adapted into Focus Mode?
