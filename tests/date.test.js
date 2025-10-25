import { describe, expect, it } from 'vitest';
import {
  normalizeRanges,
  diffHours,
  dateInRangeISO
} from '../src/utils/date.js';

describe('normalizeRanges', () => {
  it('merges overlapping vacation ranges and sorts them', () => {
    const ranges = [
      { from: '2024-05-05', to: '2024-05-08' },
      { from: '2024-05-07', to: '2024-05-10' },
      { from: '2024-04-28', to: '2024-04-30' }
    ];

    expect(normalizeRanges(ranges)).toEqual([
      { from: '2024-04-28', to: '2024-04-30' },
      { from: '2024-05-05', to: '2024-05-10' }
    ]);
  });
});

describe('diffHours', () => {
  it('computes duration within a day', () => {
    expect(diffHours('2024-05-01', '08:00', '10:30')).toBe(2.5);
  });

  it('wraps across midnight', () => {
    expect(diffHours('2024-05-01', '22:15', '01:15')).toBe(3);
  });
});

describe('dateInRangeISO', () => {
  it('detects inclusive range matches', () => {
    expect(dateInRangeISO('2024-05-03', '2024-05-01', '2024-05-05')).toBe(true);
    expect(dateInRangeISO('2024-05-06', '2024-05-01', '2024-05-05')).toBe(false);
  });
});
