import { describe, expect, it, vi } from 'vitest';
import { applyRemoteUserSettingsData, buildUserSettingsPayload } from '../src/modules/userSettingsSync.js';

describe('buildUserSettingsPayload', () => {
  it('builds a normalized payload shape', () => {
    expect(buildUserSettingsPayload({
      evalProfiles: [{ profileId: 'p1' }],
      activeEvalId: 'p1',
      vacationRanges: [{ from: '2026-04-01', to: '2026-04-02' }],
      extraTripEma: 12.5,
      tokenUsage: { today: 1 },
      dismissedList: [{ iso: '2026-04-14', tags: [] }]
    })).toEqual({
      eval_profiles: [{ profileId: 'p1' }],
      active_eval_id: 'p1',
      vacation_ranges: [{ from: '2026-04-01', to: '2026-04-02' }],
      extra_trip: { ema: 12.5 },
      ai_token_usage: { today: 1 },
      diagnostics_dismissed: [{ iso: '2026-04-14', tags: [] }]
    });
  });
});

describe('applyRemoteUserSettingsData', () => {
  it('applies remote user settings via injected callbacks', () => {
    const deps = {
      saveEvalProfiles: vi.fn(),
      setActiveEvalId: vi.fn(),
      syncEvalGlobals: vi.fn(),
      normalizeRanges: vi.fn((ranges) => ranges),
      applyVacationRanges: vi.fn(),
      setExtraTripEma: vi.fn(),
      loadTokenUsage: vi.fn(() => ({ today: 1 })),
      mergeTokenUsage: vi.fn(() => ({ merged: { today: 2 }, source: 'incoming' })),
      saveTokenUsage: vi.fn(),
      saveDismissedResiduals: vi.fn()
    };

    const result = applyRemoteUserSettingsData({
      eval_profiles: [{ profileId: 'p1' }],
      active_eval_id: 'p1',
      vacation_ranges: [{ from: '2026-04-01', to: '2026-04-02' }],
      extra_trip: { ema: '8.5' },
      ai_token_usage: { today: 2 },
      diagnostics_dismissed: [{ iso: '2026-04-14', tags: [] }]
    }, deps);

    expect(result).toEqual({ pushTokenUsageAfterSync: false });
    expect(deps.saveEvalProfiles).toHaveBeenCalledWith([{ profileId: 'p1' }]);
    expect(deps.setActiveEvalId).toHaveBeenCalledWith('p1');
    expect(deps.syncEvalGlobals).toHaveBeenCalled();
    expect(deps.applyVacationRanges).toHaveBeenCalledWith([{ from: '2026-04-01', to: '2026-04-02' }]);
    expect(deps.setExtraTripEma).toHaveBeenCalledWith(8.5);
    expect(deps.saveTokenUsage).toHaveBeenCalledWith({ today: 2 }, { preserveTimestamp: true });
    expect(deps.saveDismissedResiduals).toHaveBeenCalledWith([{ iso: '2026-04-14', tags: [] }]);
  });

  it('requests a local token push when remote token usage is absent', () => {
    expect(applyRemoteUserSettingsData({}, {})).toEqual({ pushTokenUsageAfterSync: true });
  });
});
