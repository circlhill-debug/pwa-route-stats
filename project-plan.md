# Project Plan: Advanced Weekly Metrics and Interactivity

## Overview
This project aims to enhance the analytics capabilities of our platform by introducing more sophisticated weekly metrics and interactive tiles for deeper insights. These features will provide users with a more nuanced understanding of trends and allow them to drill down into specific details dynamically.

## Goals
1. **Advanced Weekly Metrics**
   - Implement day-to-day weekly comparisons.
   - Introduce weighted weekly averages to calculate cumulative impacts.
   - Provide an accurate and holistic weekly trend picture.

2. **Interactive Clickable Tiles**
   - Make existing tiles clickable to drill down into detailed views.
   - Add graphical representations for daily, weekly, and monthly trends.
   - Enable clickable points on graphs to show granular data for specific days.

## Implementation Plan

### Phase 1: Advanced Weekly Metrics
1. **Day-to-Day Weekly Comparison**
   - Compare the first day of the current week to the same day from the previous week.
   - Calculate daily deltas and thread them together for an accurate weekly picture.

2. **Weighted Weekly Averages**
   - Use weighted formulas to aggregate daily deltas into a weekly metric.
   - Ensure the weekly average reflects day-to-day fluctuations dynamically.

3. **Cumulative Weekly Impacts**
   - Show whether the week is trending positively or negatively based on cumulative day-to-day changes.

### Phase 2: Clickable Tiles and Interactivity
1. **Clickable Tiles**
   - Allow users to click on tiles (e.g., parcels up/down percentage) to open detailed views.
   - Include options to view last week, two-week, or monthly trends.

2. **Interactive Graphs**
   - Add progressive horizontal line graphs for selected metrics.
   - Implement hover-over tooltips and clickable points for detailed stats.

3. **Point-Specific Details**
   - Clicking on a graph point shows the total number of entries for that day.
   - Include contextual insights, such as comparison to averages or medians.

## Technical Considerations
- **Data Handling:**
  - Ensure backend supports storing and comparing daily stats from current and previous weeks.
  - Optimize APIs to fetch historical data efficiently.

- **Frontend Libraries:**
  - Use Chart.js or D3.js for interactive graphs.
  - Ensure UI is intuitive and visually appealing.

- **Performance Optimization:**
  - Use caching and precomputed metrics to minimize server load.
  - Monitor server performance with tools like New Relic or Datadog.

## Next Steps
1. Create a new branch for implementation.
2. Begin with Phase 1: Advanced Weekly Metrics.
3. Gradually introduce clickable tiles and interactivity in Phase 2.

## Roadmap
- **Week 1:** Draft backend API changes and data structures for advanced metrics.
- **Week 2:** Implement and test day-to-day comparisons and weighted averages.
- **Week 3:** Add clickable tiles and basic graphing capabilities.
- **Week 4:** Finalize interactive graphs and point-specific details.

---
This plan outlines a comprehensive approach to delivering these advanced features efficiently and strategically.

