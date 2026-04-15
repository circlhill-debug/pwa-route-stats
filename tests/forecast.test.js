import { describe, expect, it } from 'vitest';
import {
  buildTrendForecastCore,
  flattenTagStrings,
  generateForecastText,
  normalizeDurationMinutes,
  normalizeSnapshot
} from '../src/modules/forecast.js';

describe('forecast normalization', () => {
  it('treats plausible hour-like values as minutes when configured', () => {
    expect(normalizeDurationMinutes(5, { hourLikeThreshold: 16 })).toBe(300);
    expect(normalizeDurationMinutes(330, { hourLikeThreshold: 16 })).toBe(330);
  });

  it('normalizes legacy snapshot hour fields into minute fields', () => {
    const result = normalizeSnapshot({
      iso: '2026-04-14',
      total_time: 5.5,
      office_time: 1.5,
      tags: [{ reason: 'weather', minutes: 15 }]
    });

    expect(result).toMatchObject({
      iso: '2026-04-14',
      totalTime: 330,
      officeTime: 90,
      tags: [{ key: 'weather', reason: 'weather', minutes: 15, notedAt: expect.any(String) }]
    });
  });
});

describe('trend forecast core', () => {
  it('returns deterministic wording for a strong weekly increase', () => {
    const data = [
      { iso: '2026-03-02', weekday: 1, totalTime: 300, officeTime: 60 },
      { iso: '2026-03-09', weekday: 1, totalTime: 310, officeTime: 62 },
      { iso: '2026-03-16', weekday: 1, totalTime: 320, officeTime: 64 },
      { iso: '2026-03-23', weekday: 1, totalTime: 420, officeTime: 90 },
      { iso: '2026-03-30', weekday: 1, totalTime: 430, officeTime: 92 },
      { iso: '2026-04-06', weekday: 1, totalTime: 440, officeTime: 94 }
    ];

    expect(buildTrendForecastCore(1, data)).toBe(
      'Forecast Insight: Expect a modest increase in route time. Route time has shifted 39% compared to recent Mondays.'
    );
  });

  it('returns null when there is not enough weekday history', () => {
    const data = [
      { iso: '2026-03-02', weekday: 1, totalTime: 300, officeTime: 60 },
      { iso: '2026-03-09', weekday: 1, totalTime: 310, officeTime: 62 }
    ];

    expect(buildTrendForecastCore(1, data)).toBeNull();
  });
});

describe('tag-based forecast inputs', () => {
  it('aggregates weekday tag history by average effect instead of only latest tag', () => {
    const history = [
      { iso: '2026-03-02', tags: [{ key: 'weather', reason: 'weather', minutes: 60 }] },
      { iso: '2026-03-09', tags: [{ key: 'weather', reason: 'weather', minutes: 120 }] },
      { iso: '2026-03-16', tags: [{ key: 'weather', reason: 'weather', minutes: 30 }] }
    ];

    expect(flattenTagStrings(history, 1)).toEqual([
      { key: 'weather', reason: 'weather', minutes: 70 }
    ]);
  });

  it('caps dominant tag minutes in generated forecast text', () => {
    const history = [
      { iso: '2026-03-02', tags: [{ key: 'detour', reason: 'detour', minutes: 400 }] }
    ];

    expect(generateForecastText(history, 1)).toBe(
      '📬 Tomorrow’s trend: Expect about 180 minutes longer than usual due to detour change.'
    );
  });
});
