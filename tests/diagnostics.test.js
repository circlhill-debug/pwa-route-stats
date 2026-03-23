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
      { key: 'weather', reason: 'weather', minutes: 15, notedAt: expect.any(String) },
      { key: 'letters', reason: 'letters', minutes: null, notedAt: expect.any(String) }
    ]);
  });

  it('captures key:value style tags', () => {
    const input = 'Delay:Flat, Missed box +2';
    const result = parseDismissReasonInput(input);
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        { key: 'flats', reason: 'flats', minutes: null, notedAt: expect.any(String) },
        { key: 'boxholders', reason: 'boxholders', minutes: 2, notedAt: expect.any(String) }
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
          { key: 'weather', reason: 'weather', minutes: 10, notedAt: '2024-04-10T12:00:00Z' },
          { key: 'flats', reason: 'flats', minutes: 5, notedAt: '2024-04-10T12:00:00Z' }
        ]
      }
    ]);
  });

  it('persists structured entries via saveDismissedResiduals', () => {
    const list = [
      {
        iso: '2024-04-11',
        tags: [{ key: 'road_closure', reason: 'road_closure', minutes: 12, notedAt: '2024-04-11T09:00:00Z' }]
      }
    ];

    saveDismissedResiduals(list);
    const storedRaw = localStorage.getItem(RESIDUAL_DISMISS_KEY);
    expect(JSON.parse(storedRaw)).toEqual(list);
  });
});
