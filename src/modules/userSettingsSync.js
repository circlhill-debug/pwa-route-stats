export const USER_SETTINGS_TABLE = 'user_settings';
export const USER_SETTINGS_SELECT = 'eval_profiles, active_eval_id, vacation_ranges, extra_trip, ai_token_usage, diagnostics_dismissed';

export function buildUserSettingsPayload({
  evalProfiles = [],
  activeEvalId = null,
  vacationRanges = [],
  extraTripEma = null,
  tokenUsage = null,
  dismissedList = []
} = {}) {
  return {
    eval_profiles: evalProfiles,
    active_eval_id: activeEvalId || null,
    vacation_ranges: vacationRanges,
    extra_trip: Number.isFinite(extraTripEma) ? { ema: extraTripEma } : null,
    ai_token_usage: tokenUsage || null,
    diagnostics_dismissed: dismissedList || []
  };
}

export function applyRemoteUserSettingsData(data, deps = {}) {
  let pushTokenUsageAfterSync = false;
  if (!data || typeof data !== 'object') {
    return { pushTokenUsageAfterSync: true };
  }

  if (Array.isArray(data.eval_profiles)) {
    deps.saveEvalProfiles?.(data.eval_profiles);
    if (data.active_eval_id) deps.setActiveEvalId?.(data.active_eval_id);
    deps.syncEvalGlobals?.();
  }

  if (Array.isArray(data.vacation_ranges)) {
    const sanitized = data.vacation_ranges
      .filter((r) => r?.from && r?.to)
      .map((r) => ({ from: r.from, to: r.to }));
    const normalized = deps.normalizeRanges ? deps.normalizeRanges(sanitized) : sanitized;
    deps.applyVacationRanges?.(normalized);
  }

  if (data.extra_trip && typeof data.extra_trip === 'object') {
    const emaVal = parseFloat(data.extra_trip.ema);
    if (Number.isFinite(emaVal)) deps.setExtraTripEma?.(emaVal);
  }

  if (data.ai_token_usage && typeof data.ai_token_usage === 'object') {
    const localUsage = deps.loadTokenUsage?.();
    const merged = deps.mergeTokenUsage?.(localUsage, data.ai_token_usage) || { merged: data.ai_token_usage, source: 'incoming' };
    if (merged.source === 'incoming') {
      deps.saveTokenUsage?.(merged.merged, { preserveTimestamp: true });
    } else {
      deps.saveTokenUsage?.(merged.merged);
      pushTokenUsageAfterSync = true;
    }
  } else {
    pushTokenUsageAfterSync = true;
  }

  if (Array.isArray(data.diagnostics_dismissed)) {
    deps.saveDismissedResiduals?.(data.diagnostics_dismissed);
  }

  return { pushTokenUsageAfterSync };
}
