import { describe, expect, it } from 'vitest';
import { DateTime, ZONE } from '../src/utils/date.js';
import { buildForecastRenderPlan, buildForecastSnapshotFromPayload } from '../src/modules/forecastSurface.js';

describe('buildForecastRenderPlan', () => {
  it('uses tomorrow forecast after 8pm', () => {
    const now = DateTime.fromISO('2026-04-15T20:30:00', { zone: ZONE });
    const plan = buildForecastRenderPlan({
      now,
      latestForecastMessage: null,
      computeForecastText: () => 'Forecast text'
    });
    expect(plan).toMatchObject({
      message: 'Forecast text',
      shouldSyncBeforeRender: true,
      shouldPersistRemote: true,
      iso: '2026-04-16'
    });
  });

  it('reuses latest morning forecast when available', () => {
    const now = DateTime.fromISO('2026-04-15T07:15:00', { zone: ZONE });
    const plan = buildForecastRenderPlan({
      now,
      latestForecastMessage: { iso: '2026-04-15', text: 'Saved forecast' },
      computeForecastText: () => 'Ignored'
    });
    expect(plan.message).toBe('Saved forecast');
    expect(plan.shouldPersistRemote).toBe(false);
  });

  it('returns mid-day safe message otherwise', () => {
    const now = DateTime.fromISO('2026-04-15T12:00:00', { zone: ZONE });
    const plan = buildForecastRenderPlan({
      now,
      latestForecastMessage: null,
      computeForecastText: () => 'Ignored'
    });
    expect(plan).toMatchObject({
      title: '❤',
      message: 'Stay safe out there my Stallion.',
      shouldPersistRemote: false
    });
  });
});

describe('buildForecastSnapshotFromPayload', () => {
  it('builds a snapshot from entry payload', () => {
    expect(buildForecastSnapshotFromPayload({
      work_date: '2026-04-15',
      hours: 5.5,
      office_minutes: 1.25,
      end_time: '15:30'
    }, {
      userId: 'user-1',
      tags: [{ key: 'weather', reason: 'weather', minutes: 15 }]
    })).toEqual({
      iso: '2026-04-15',
      weekday: 3,
      totalTime: 330,
      officeTime: 75,
      endTime: '15:30',
      tags: [{ key: 'weather', reason: 'weather', minutes: 15 }],
      user_id: 'user-1'
    });
  });
});
