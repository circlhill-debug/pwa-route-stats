import { describe, expect, it } from 'vitest';
import { buildWeeklyComparisonPacket, getWeeklyComparisonMode, formatWeeklyComparisonSummary } from '../src/modules/weeklyComparisons.js';

describe('weeklyComparisons helpers', () => {
  it('builds a packet with the correct delta and mode metadata', () => {
    const packet = buildWeeklyComparisonPacket('calendar_same_range', {
      currentTotal: 625,
      referenceTotal: 595,
      currentDays: 5,
      referenceDays: 5
    });
    expect(packet.mode).toBe('calendar_same_range');
    expect(packet.label).toBe(getWeeklyComparisonMode('calendar_same_range').label);
    expect(Math.round(packet.deltaPct)).toBe(5);
  });

  it('formats a readable comparison summary', () => {
    const packet = buildWeeklyComparisonPacket('baseline_array', {
      currentTotal: 625,
      referenceTotal: 595,
      usedDays: 5
    });
    const summary = formatWeeklyComparisonSummary(packet, {
      currentLabel: 'Current',
      referenceLabel: 'Baseline',
      valueFormatter: (n) => `${Math.round(n)} parcels`
    });
    expect(summary).toContain('Baseline array');
    expect(summary).toContain('Current: 625 parcels');
    expect(summary).toContain('Baseline: 595 parcels');
  });
});
