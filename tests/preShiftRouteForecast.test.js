import { describe, expect, it } from 'vitest';
import {
  buildPreShiftRouteForecast,
  loadPreShiftRouteForecasts,
  savePreShiftRouteForecast,
  scorePreShiftRouteForecast,
  summarizePreShiftRouteForecasts
} from '../src/modules/preShiftRouteForecast.js';

const model = { a: 30, bp: 2, bl: 0.1, r2: 0.69, n: 12 };

describe('pre-shift route forecast', () => {
  it('uses prior same-weekday parcel and letter averages with the existing route model', () => {
    const rows = [
      { work_date: '2026-09-02', parcels: 100, letters: 1000 }, // Wednesday
      { work_date: '2026-09-09', parcels: 120, letters: 1400 }, // Wednesday
      { work_date: '2026-09-08', parcels: 999, letters: 9999 } // Tuesday, excluded
    ];
    const result = buildPreShiftRouteForecast(rows, {
      targetIso: '2026-09-16',
      model,
      now: { toISO: () => '2026-09-15T20:00:00.000-04:00' }
    });

    expect(result.expectedParcels).toBe(110);
    expect(result.expectedLetters).toBe(1200);
    expect(result.predictedMinutes).toBe(370);
    expect(result.sampleSize).toBe(2);
  });

  it('keeps the first saved forecast for a date', () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const first = { iso: '2026-09-16', predictedMinutes: 370 };
    const later = { iso: '2026-09-16', predictedMinutes: 420 };

    savePreShiftRouteForecast(first, storage);
    expect(savePreShiftRouteForecast(later, storage)).toEqual(first);
    expect(loadPreShiftRouteForecasts(storage)).toEqual([first]);
  });

  it('scores the preserved forecast without changing its prediction', () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    savePreShiftRouteForecast({ iso: '2026-09-16', predictedMinutes: 370 }, storage);

    expect(scorePreShiftRouteForecast('2026-09-16', 380, storage)).toMatchObject({
      predictedMinutes: 370,
      actualRouteMinutes: 380,
      residualMinutes: 10,
      hit: true
    });
    expect(summarizePreShiftRouteForecasts(loadPreShiftRouteForecasts(storage))).toEqual({
      count: 1,
      hitRate: 1,
      medianAbsoluteMiss: 10,
      averageResidual: 10
    });
  });
});
