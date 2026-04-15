import { beforeEach, describe, expect, it } from 'vitest';
import { parseDismissReasonInput } from '../src/utils/diagnostics.js';
import { loadDismissedResiduals, saveDismissedResiduals } from '../src/utils/storage.js';
import { loadTagHistory, normalizeTagHistory, saveDismissedResidualWithTags } from '../src/utils/diagnosticsStorage.js';

beforeEach(() => {
  localStorage.clear();
});

describe('diagnosticsStorage helpers', () => {
  it('upserts dismissed residuals and mirrors tags into tag history', () => {
    saveDismissedResidualWithTags({
      iso: '2026-04-14',
      tags: [{ key: 'weather', reason: 'weather', minutes: 15 }],
      loadDismissedResiduals: () => loadDismissedResiduals(parseDismissReasonInput),
      saveDismissedResiduals
    });

    expect(loadDismissedResiduals(parseDismissReasonInput)).toEqual([
      {
        iso: '2026-04-14',
        tags: [{ key: 'weather', reason: 'weather', minutes: 15, notedAt: expect.any(String) }]
      }
    ]);
    expect(loadTagHistory()).toEqual([
      {
        iso: '2026-04-14',
        tags: [{ key: 'weather', reason: 'weather', minutes: 15, notedAt: expect.any(String) }]
      }
    ]);
  });

  it('normalizes stored tag history using dismissed residual seeds', () => {
    localStorage.setItem('routeStats.tagHistory', JSON.stringify([
      { iso: '2026-04-14', tags: [{ reason: 'weather', minutes: 10 }] }
    ]));
    saveDismissedResiduals([
      { iso: '2026-04-14', tags: [{ key: 'weather', reason: 'weather', minutes: 15, notedAt: '2026-04-14T10:00:00Z' }] }
    ]);

    const changed = normalizeTagHistory(loadDismissedResiduals(parseDismissReasonInput));
    expect(changed).toBe(true);
    expect(loadTagHistory()).toEqual([
      {
        iso: '2026-04-14',
        tags: [{ key: 'weather', reason: 'weather', minutes: 15, notedAt: expect.any(String) }]
      }
    ]);
  });
});
