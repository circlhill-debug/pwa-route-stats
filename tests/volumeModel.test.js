import { describe, expect, it } from 'vitest';
import { fitVolumeTimeModel, learnedLetterWeightFromModel } from '../src/modules/volumeModel.js';

describe('fitVolumeTimeModel', () => {
  it('fits a simple parcel/letter minutes model', () => {
    const rows = [
      { work_date: '2026-04-01', status: 'worked', parcels: 100, letters: 1000, route_minutes: 5.0 },
      { work_date: '2026-04-02', status: 'worked', parcels: 120, letters: 900, route_minutes: 5.2 },
      { work_date: '2026-04-03', status: 'worked', parcels: 140, letters: 1100, route_minutes: 5.8 },
      { work_date: '2026-04-04', status: 'worked', parcels: 160, letters: 1300, route_minutes: 6.4 }
    ];
    const model = fitVolumeTimeModel(rows, {
      minutesForRow: (row) => (Number(row.route_minutes) || 0) * 60
    });
    expect(model).toBeTruthy();
    expect(model.n).toBe(4);
    expect(model.residuals).toHaveLength(4);
    expect(model.bp).toBeGreaterThan(0);
    expect(model.bl).toBeGreaterThan(0);
  });
});

describe('learnedLetterWeightFromModel', () => {
  it('derives a bounded learned letter weight', () => {
    expect(learnedLetterWeightFromModel({ bp: 2, bl: 0.5 })).toBe(0.25);
    expect(learnedLetterWeightFromModel({ bp: 0, bl: 1 })).toBeNull();
  });
});
