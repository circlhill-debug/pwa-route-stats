import { describe, expect, it } from 'vitest';
import { createDiagnostics } from '../src/features/diagnostics.js';

const colorStub = (pct) => ({ fg: pct >= 0 ? 'green' : 'red', bg: 'transparent', bc: 'transparent' });

function createSubject(parcels, letters, routeHours, officeHours, totalHours, miles = 0) {
  return {
    work_date: '2025-01-01',
    status: 'worked',
    parcels,
    letters,
    route_minutes: routeHours,
    office_minutes: officeHours,
    hours: totalHours,
    miles,
    weather_json: ''
  };
}

function harness() {
  const diagnostics = createDiagnostics({
    getFlags: () => ({ dayCompare: true }),
    filterRowsForView: rows => rows,
    rowsForModelScope: rows => rows,
    getResidualWeighting: () => ({ enabled: false, fn: null }),
    setHolidayDownweightEnabled: () => {},
    isHolidayDownweightEnabled: () => false,
    loadDismissedResiduals: () => [],
    saveDismissedResiduals: () => {},
    parseDismissReasonInput: () => [],
    rebuildAll: () => {},
    updateAiSummaryAvailability: () => {},
    inferBoxholderLabel: () => '—',
    hasTag: () => false,
    summarizeHolidayCatchups: () => ({}),
    getCurrentLetterWeight: () => 0.33,
    setCurrentLetterWeight: () => {},
    combinedVolume: (p, l, w = 0.33) => p + w * l,
    routeAdjustedMinutes: (row) => {
      const hours = Number(row.route_minutes ?? 0);
      return Number.isFinite(hours) ? hours * 60 : 0;
    },
    colorForDelta: colorStub
  });
  return diagnostics.__test;
}

describe('day metrics normalization', () => {
  it('treats stored hours as hours', () => {
    const testApi = harness();
    const metrics = testApi.dayMetricsFromRow(createSubject(100, 50, 5.25, 1.5, 6.75), {});
    expect(metrics.routeHours).toBeCloseTo(5.25, 5);
    expect(metrics.officeHours).toBeCloseTo(1.5, 5);
    expect(metrics.totalHours).toBeCloseTo(6.75, 5);
    expect(metrics.volume).toBeGreaterThan(0);
  });

  it('converts legacy minute fields to hours', () => {
    const testApi = harness();
    const legacyRow = createSubject(80, 20, 330, 90, null);
    const metrics = testApi.dayMetricsFromRow(legacyRow, {});
    expect(metrics.routeHours).toBeCloseTo(5.5, 4);
    expect(metrics.officeHours).toBeCloseTo(1.5, 4);
    expect(metrics.totalHours).toBeCloseTo(7, 4);
  });
});

describe('delta details formatting', () => {
  it('includes delta value and percent change', () => {
    const testApi = harness();
    const subject = testApi.dayMetricsFromRow(createSubject(120, 60, 6, 2, 8), {});
    const reference = testApi.dayMetricsFromRow(createSubject(100, 50, 5, 1.5, 6.5), {});
    const { rows } = testApi.deltaDetails(subject, reference);
    const totalRow = rows.find(r => r.key === 'totalHours');
    expect(totalRow).toBeTruthy();
    expect(totalRow.deltaText).toMatch(/^\d/);
    expect(totalRow.deltaText).toContain('(+');
    expect(totalRow.deltaText).toContain('%');
    expect(totalRow.deltaText).toMatch(/h/);
  });
});
