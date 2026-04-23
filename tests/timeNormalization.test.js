import { describe, expect, it } from 'vitest';
import {
  normalizeHoursValue,
  normalizeTotalHoursRecord,
  adjustedRouteHoursFromRow,
  adjustedRouteMinutesFromRow
} from '../src/utils/timeNormalization.js';

describe('timeNormalization', () => {
  it('treats values over 24 as legacy minutes and converts to hours', () => {
    expect(normalizeHoursValue(90)).toBe(1.5);
    expect(normalizeHoursValue(5.25)).toBe(5.25);
  });

  it('prefers combined route + office when stored total looks suspiciously high', () => {
    const total = normalizeTotalHoursRecord({ hours: 12 }, 5, 2);
    expect(total).toBe(7);
  });

  it('applies route adjustments after normalizing stored route values', () => {
    const row = { route_minutes: 330 };
    expect(adjustedRouteHoursFromRow(row, 30)).toBe(5);
    expect(adjustedRouteMinutesFromRow(row, 30)).toBe(300);
  });
});
