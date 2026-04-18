import { describe, expect, it } from 'vitest';
import { DateTime } from '../src/utils/date.js';
import { buildPredictionRecord } from '../src/modules/predictionRecord.js';

describe('buildPredictionRecord', () => {
  it('builds a weekday-average prediction and compares it to today actuals', () => {
    const rows = [
      { work_date: '2026-04-10', status: 'worked', hours: 7.0, office_minutes: 2.0, route_minutes: 5.0, end_time: '15:00' },
      { work_date: '2026-04-03', status: 'worked', hours: 6.5, office_minutes: 1.75, route_minutes: 4.75, end_time: '14:30' },
      { work_date: '2026-04-17', status: 'worked', hours: 7.5, office_minutes: 2.1, route_minutes: 5.4, end_time: '15:30' }
    ];

    const record = buildPredictionRecord(rows, {
      now: DateTime.fromISO('2026-04-17T07:00:00', { zone: 'America/Detroit' })
    });

    expect(record.source.type).toBe('weekday_average');
    expect(record.source.sampleSize).toBe(2);
    expect(record.predicted.totalHours).toBe(6.75);
    expect(record.predicted.officeHours).toBeCloseTo(1.875, 3);
    expect(record.predicted.routeHours).toBeCloseTo(4.875, 3);
    expect(record.predicted.endTime).toBe('2:45 PM');
    expect(record.actual.totalHours).toBe(7.5);
    expect(record.actual.endTime).toBe('3:30 PM');
    expect(record.delta.totalMinutes).toBe(45);
    expect(record.delta.hitMiss).toBe('miss');
  });

  it('falls back to overall averages when no weekday history exists', () => {
    const rows = [
      { work_date: '2026-04-14', status: 'worked', hours: 6.0, office_minutes: 1.5, route_minutes: 4.5 },
      { work_date: '2026-04-15', status: 'worked', hours: 7.0, office_minutes: 2.0, route_minutes: 5.0 }
    ];

    const record = buildPredictionRecord(rows, {
      now: DateTime.fromISO('2026-04-17T07:00:00', { zone: 'America/Detroit' })
    });

    expect(record.source.type).toBe('overall_average');
    expect(record.source.sampleSize).toBe(2);
    expect(record.predicted.totalHours).toBe(6.5);
    expect(record.predicted.endTime).toBe('2:30 PM');
    expect(record.actual.totalHours).toBeNull();
    expect(record.delta.hitMiss).toBeNull();
  });

  it('chooses the most complete row when multiple rows exist for today', () => {
    const rows = [
      { work_date: '2026-04-10', status: 'worked', hours: 7.0, office_minutes: 2.0, route_minutes: 5.0 },
      { work_date: '2026-04-17', status: 'worked', hours: 7.0, office_minutes: 2.0, route_minutes: 5.0 },
      { work_date: '2026-04-17', status: 'worked', hours: 7.25, office_minutes: 2.1, route_minutes: 5.15, return_time: '15:15', end_time: '15:30' }
    ];

    const record = buildPredictionRecord(rows, {
      now: DateTime.fromISO('2026-04-17T07:00:00', { zone: 'America/Detroit' })
    });

    expect(record.actual.totalHours).toBe(7.25);
    expect(record.actual.endTime).toBe('3:30 PM');
    expect(record.row?.return_time).toBe('15:15');
  });
});
