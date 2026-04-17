import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  FLAG_KEY,
  loadFlags,
  saveFlags,
  loadPeakSeason,
  savePeakSeason,
  loadEvalProfiles,
  saveEvalProfiles,
  getActiveEvalId,
  setActiveEvalId,
  loadEval,
  saveEval,
  deleteEvalProfile,
  loadVacation,
  saveVacation,
  getModelScope,
  setModelScope,
  loadTokenUsage,
  saveTokenUsage,
  mergeTokenUsage
} from '../src/utils/storage.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-17T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('flags storage helpers', () => {
  it('returns defaults when nothing is stored', () => {
    const flags = loadFlags();
    expect(flags.smartSummary).toBe(true);
    expect(flags.weekdayTicks).toBe(true);
  });

  it('persists overrides while preserving defaults', () => {
    saveFlags({ smartSummary: false, mixViz: false });
    const raw = localStorage.getItem(FLAG_KEY);
    expect(JSON.parse(raw)).toEqual({ smartSummary: false, mixViz: false });

    const merged = loadFlags();
    expect(merged.smartSummary).toBe(false);
    expect(merged.mixViz).toBe(false);
    expect(merged.weekdayTicks).toBe(true); // default retained
  });
});

describe('vacation helpers', () => {
  it('filters invalid ranges on load', () => {
    saveVacation({ ranges: [{ from: '2024-05-01', to: '2024-05-05' }, { from: '2024-06-01' }] });
    expect(loadVacation()).toEqual({ ranges: [{ from: '2024-05-01', to: '2024-05-05' }] });
  });
});

describe('peak season helpers', () => {
  it('persists peak season settings', () => {
    savePeakSeason({ from: '2026-11-20', to: '2026-12-31', excludeFromModel: true });
    expect(loadPeakSeason()).toEqual({
      from: '2026-11-20',
      to: '2026-12-31',
      excludeFromModel: true
    });
  });
});

describe('evaluation profile helpers', () => {
  it('saves and loads eval profiles with active selection', () => {
    saveEvalProfiles([
      { profileId: 'p1', label: 'Route A', routeId: 'A1' },
      { profileId: 'p2', label: 'Route B', routeId: 'B1' }
    ]);
    setActiveEvalId('p2');

    expect(loadEvalProfiles().map((p) => p.profileId)).toEqual(['p1', 'p2']);
    expect(getActiveEvalId()).toBe('p2');
    expect(loadEval().profileId).toBe('p2');
  });

  it('saveEval upserts and activates the saved profile', () => {
    saveEval({ profileId: 'p9', label: 'Route Nine', routeId: 'R9', hoursPerDay: 8.6 });
    expect(loadEval().profileId).toBe('p9');
    expect(getActiveEvalId()).toBe('p9');
  });

  it('deletes an active profile and falls back to another profile', () => {
    saveEvalProfiles([
      { profileId: 'p1', label: 'Route A', routeId: 'A1' },
      { profileId: 'p2', label: 'Route B', routeId: 'B1' }
    ]);
    setActiveEvalId('p2');

    const remaining = deleteEvalProfile('p2');
    expect(remaining).toHaveLength(1);
    expect(getActiveEvalId()).toBe('p1');
    expect(loadEval().profileId).toBe('p1');
  });
});

describe('model scope helpers', () => {
  it('defaults to rolling scope', () => {
    expect(getModelScope()).toBe('rolling');
  });

  it('persists scope choice', () => {
    setModelScope('all');
    expect(getModelScope()).toBe('all');
  });
});

describe('token usage helpers', () => {
  it('initializes token usage with current period keys', () => {
    const usage = loadTokenUsage();
    expect(usage.today).toBe(0);
    expect(usage.week).toBe(0);
    expect(usage.month).toBe(0);
    expect(usage.todayDate).toBe('2026-04-17');
    expect(usage.monthKey).toBe('2026-04');
  });

  it('resets stale token usage periods on load', () => {
    localStorage.setItem('routeStats.aiTokenUsage', JSON.stringify({
      today: 5,
      week: 12,
      month: 20,
      todayDate: '2026-04-16',
      weekStart: '2026-04-06',
      monthKey: '2026-03',
      updatedAt: '2026-04-16T10:00:00.000Z'
    }));

    const usage = loadTokenUsage();
    expect(usage.today).toBe(0);
    expect(usage.week).toBe(0);
    expect(usage.month).toBe(0);
    expect(usage.todayDate).toBe('2026-04-17');
    expect(usage.monthKey).toBe('2026-04');
  });

  it('preserves timestamp when requested on saveTokenUsage', () => {
    const usage = saveTokenUsage({
      today: 1,
      week: 2,
      month: 3,
      todayDate: '2026-04-17',
      weekStart: '2026-04-13',
      monthKey: '2026-04',
      updatedAt: '2026-04-17T09:00:00.000Z'
    }, { preserveTimestamp: true });

    expect(usage.updatedAt).toBe('2026-04-17T09:00:00.000Z');
  });

  it('prefers incoming token usage when incoming timestamp is newer', () => {
    const result = mergeTokenUsage(
      { today: 1, week: 2, month: 3, updatedAt: '2026-04-17T08:00:00.000Z' },
      { today: 4, week: 5, month: 6, updatedAt: '2026-04-17T09:00:00.000Z' }
    );

    expect(result.source).toBe('incoming');
    expect(result.merged.today).toBe(4);
  });

  it('prefers higher usage totals when timestamps tie', () => {
    const result = mergeTokenUsage(
      { today: 1, week: 2, month: 3, updatedAt: '2026-04-17T09:00:00.000Z' },
      { today: 4, week: 5, month: 6, updatedAt: '2026-04-17T09:00:00.000Z' }
    );

    expect(result.source).toBe('incoming');
    expect(result.merged.month).toBe(6);
  });
});
