import { beforeEach, describe, expect, it } from 'vitest';
import {
  FLAG_KEY,
  loadFlags,
  saveFlags,
  loadVacation,
  saveVacation,
  getModelScope,
  setModelScope
} from '../src/utils/storage.js';

beforeEach(() => {
  localStorage.clear();
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

describe('model scope helpers', () => {
  it('defaults to rolling scope', () => {
    expect(getModelScope()).toBe('rolling');
  });

  it('persists scope choice', () => {
    setModelScope('all');
    expect(getModelScope()).toBe('all');
  });
});
