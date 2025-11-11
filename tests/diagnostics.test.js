import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadDismissedResiduals,
  saveDismissedResiduals,
  RESIDUAL_DISMISS_KEY
} from '../src/utils/storage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('loadDismissedResiduals', () => {
  it('hydrates legacy reason strings into structured tags', () => {
    const payload = [
      {
        iso: '2024-04-10',
        reason: 'heavy parcels',
        minutes: 30,
        notedAt: '2024-04-10T12:00:00Z'
      }
    ];
    localStorage.setItem(RESIDUAL_DISMISS_KEY, JSON.stringify(payload));

    const result = loadDismissedResiduals();
    expect(result).toEqual([
      {
        iso: '2024-04-10',
        tags: [
          { id: 'workload-heavy-parcels', minutes: 30, notedAt: '2024-04-10T12:00:00Z' }
        ]
      }
    ]);
  });

  it('persists structured entries via saveDismissedResiduals', () => {
    const list = [
      {
        iso: '2024-04-11',
        tags: [{ id: 'weather-rain', minutes: 12, notedAt: '2024-04-11T09:00:00Z' }]
      }
    ];

    saveDismissedResiduals(list);
    const storedRaw = localStorage.getItem(RESIDUAL_DISMISS_KEY);
    expect(JSON.parse(storedRaw)).toEqual(list);
  });
});
