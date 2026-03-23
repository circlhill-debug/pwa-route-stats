import { beforeEach, describe, expect, it } from 'vitest';
import { parseDismissReasonInput } from '../src/utils/diagnostics.js';
import {
  loadDismissedResiduals,
  saveDismissedResiduals,
  RESIDUAL_DISMISS_KEY
} from '../src/utils/storage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('parseDismissReasonInput', () => {
  it('deduplicates reasons and aggregates minutes', () => {
    const input = 'Weather +10, weather +5, Late mail, +3';
    const result = parseDismissReasonInput(input);
    expect(result).toEqual([
      { reason: 'Weather', minutes: 15 },
      { reason: 'Late mail', minutes: null }
    ]);
  });

  it('captures key:value style tags', () => {
    const input = 'Delay:Flat, Missed box +2';
    const result = parseDismissReasonInput(input);
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { reason: 'Delay:Flat', minutes: null },
        { reason: 'Missed box', minutes: 2 }
      ])
    );
  });
});

describe('loadDismissedResiduals', () => {
  it('hydrates legacy reason strings into structured tags', () => {
    const payload = [
      {
        iso: '2024-04-10',
        reason: 'Weather +10, Flats +5',
        notedAt: '2024-04-10T12:00:00Z'
      }
    ];
    localStorage.setItem(RESIDUAL_DISMISS_KEY, JSON.stringify(payload));

    const result = loadDismissedResiduals(parseDismissReasonInput);
    expect(result).toEqual([
      {
        iso: '2024-04-10',
        tags: [
          { reason: 'Weather', minutes: 10, notedAt: '2024-04-10T12:00:00Z' },
          { reason: 'Flats', minutes: 5, notedAt: '2024-04-10T12:00:00Z' }
        ]
      }
    ]);
  });

  it('persists structured entries via saveDismissedResiduals', () => {
    const list = [
      {
        iso: '2024-04-11',
        tags: [{ reason: 'Construction', minutes: 12, notedAt: '2024-04-11T09:00:00Z' }]
      }
    ];

    saveDismissedResiduals(list);
    const storedRaw = localStorage.getItem(RESIDUAL_DISMISS_KEY);
    expect(JSON.parse(storedRaw)).toEqual(list);
  });
});
