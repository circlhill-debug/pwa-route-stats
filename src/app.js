import {
  DateTime,
  ZONE,
  todayStr,
  todayIso,
  hhmmNow,
  dowIndex,
  startOfWeekMonday,
  endOfWeekSunday,
  dateInRangeISO,
  diffHours,
  moonPhaseEmoji,
  normalizeRanges
} from './utils/date.js';

import {
  RESIDUAL_WEIGHT_PREF_KEY,
  loadFlags,
  saveFlags,
  loadEval,
  saveEval,
  saveEvalProfiles,
  setActiveEvalId,
  getActiveEvalId,
  loadEvalProfiles,
  deleteEvalProfile,
  createEvalProfile,
  loadVacation,
  saveVacation,
  loadPeakSeason,
  savePeakSeason,
  ensureWeeklyBaselines,
  getWeeklyBaselines,
  computeAnchorBaselines,
  getModelScope,
  setModelScope,
  loadDismissedResiduals,
  saveDismissedResiduals,
  getOpenAiKey,
  setOpenAiKey,
  getAiBasePrompt,
  setAiBasePrompt,
  loadTokenUsage,
  saveTokenUsage,
  getStored,
  updateYearlyTotals,
  YEARLY_THRESHOLDS,
  recomputeYearlyStats,
  mergeTokenUsage
} from './utils/storage.js';

import {
  SUPABASE_URL,
  createSupabaseClient,
  handleAuthCallback
} from './services/supabaseClient.js';
import { computeForecastText, storeForecastSnapshot, saveForecastSnapshot, syncForecastSnapshotsFromSupabase, loadLatestForecastMessage } from './modules/forecast.js';

import { createDiagnostics } from './features/diagnostics.js';
import { createAiSummary } from './features/aiSummary.js';
import { createCharts } from './features/charts.js';
import { createSummariesFeature } from './features/summaries.js';
import { parseDismissReasonInput, normalizeTagEntries } from './utils/diagnostics.js';
import './modules/forecast.js';

// Expose Supabase client globally for debugging
window.__sb = createSupabaseClient();

// If libs failed to load, show a clear banner with next step
  (function(){
    function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
    ready(function(){
      var missingCore=[]; if(!window.luxon) missingCore.push('Luxon'); if(!window.supabase) missingCore.push('Supabase');
      if(missingCore.length){
        var div=document.createElement('div');
        div.style.cssText='position:fixed;left:0;right:0;bottom:0;background:#c62828;color:#fff;padding:10px 14px;z-index:99999;font:14px/1.4 system-ui';
        div.textContent='Missing libraries: '+missingCore.join(', ')+'. Run "Fetch Vendor Libraries.command" to download local copies, then reload.';
        document.body.appendChild(div);
      }
      if(!window.Chart){
        console.warn('Chart.js missing — charts disabled. Everything else should work.');
      }
    });
  })();

// Global error handler to surface issues in the UI
  (function(){
    window.addEventListener('error', function(e){
      try{
        var div=document.createElement('div');
        div.style.cssText='position:fixed;left:0;right:0;top:0;background:#b00020;color:#fff;padding:10px 14px;z-index:100000;font:13px/1.4 system-ui';
        var loc = '';
        if (e && (e.filename || e.lineno)) {
          loc = ' (' + (e.filename||'inline') + ':' + (e.lineno||'?') + ':' + (e.colno||'?') + ')';
        }
        div.textContent='JavaScript error: ' + (e && e.message ? e.message : 'unknown') + loc;
        document.body.appendChild(div);
        console.error('[RouteStats] error', e);
      }catch(_){ /* ignore */ }
    }, true);
  })();

// ==== SUPABASE CONFIG ====
  console.log('[RouteStats] boot start');
  let EVAL_PROFILES = loadEvalProfiles();
  let USPS_EVAL = loadEval();

  // Vacation Mode config
  let VACATION = loadVacation();
  let PEAK_SEASON = loadPeakSeason();
  if (VACATION && Array.isArray(VACATION.ranges)){
    const normalized = normalizeRanges(VACATION.ranges);
    if (normalized.length !== VACATION.ranges.length || normalized.some((r,i)=> r.from!==VACATION.ranges[i]?.from || r.to!==VACATION.ranges[i]?.to)){
      VACATION = { ranges: normalized };
      saveVacation(VACATION);
    }
  }

  const DEFAULT_AI_BASE_PROMPT = 'You are an upbeat, encouraging USPS route analyst. Be concise but creative, celebrate wins, suggest actionable next steps, and call out emerging or fading trends as new tags appear.';
  const SECOND_TRIP_EMA_KEY = 'routeStats.secondTrip.ema';
  const THEME_STORAGE_KEY = 'routeStats.theme';
  let showMilestoneHistory = false;
  let CURRENT_THEME = 'polish';

  function normalizeTheme(value){
    return (value === 'classic' || value === 'night' || value === 'polish') ? value : 'polish';
  }

  function loadThemePreference(){
    try{
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return normalizeTheme(stored);
    }catch(_){
      return 'polish';
    }
  }
  function applyThemePreference(theme){
    const root = document.documentElement;
    const next = normalizeTheme(theme);
    if (!root) return;
    root.setAttribute('data-theme', next);
    CURRENT_THEME = next;
  }
  function persistThemePreference(theme){
    try{
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }catch(_){ }
  }
  applyThemePreference(loadThemePreference());

  function addVacationRange(fromIso, toIso){
    if (!fromIso || !toIso) return;
    const next = { ranges: [...(VACATION?.ranges || []), { from: fromIso, to: toIso }] };
    next.ranges = normalizeRanges(next.ranges);
    VACATION = next;
    saveVacation(VACATION);
    scheduleUserSettingsSave();
  }

  function removeVacationRange(index){
    const ranges = Array.isArray(VACATION?.ranges) ? [...VACATION.ranges] : [];
    if (index < 0 || index >= ranges.length) return;
    ranges.splice(index, 1);
    VACATION = { ranges: normalizeRanges(ranges) };
    saveVacation(VACATION);
    scheduleUserSettingsSave();
  }

  function listVacationRanges(){
    const cfg = VACATION || loadVacation();
    return Array.isArray(cfg?.ranges) ? cfg.ranges : [];
  }

  function renderVacationRanges(){
    const container = document.getElementById('vacRanges');
    if (!container) return;
    const ranges = listVacationRanges();
    if (!ranges.length){
      container.innerHTML = '<small class="muted">No vacation ranges saved.</small>';
      return;
    }
    const rows = ranges.map((r, idx)=>{
      try{
        const from = DateTime.fromISO(r.from, { zone: ZONE });
        const to   = DateTime.fromISO(r.to,   { zone: ZONE });
        const days = Math.max(1, Math.round(to.endOf('day').diff(from.startOf('day'), 'days').days + 1));
        const label = `${from.toFormat('LLL dd, yyyy')} → ${to.toFormat('LLL dd, yyyy')}`;
        return `<div class="vac-range-item"><div><strong>${label}</strong><br><small>${days} day${days===1?'':'s'}</small></div><button class="btn vac-remove" type="button" data-index="${idx}">Remove</button></div>`;
      }catch(_){
        return `<div class="vac-range-item"><div><strong>${r.from} → ${r.to}</strong></div><button class="btn vac-remove" type="button" data-index="${idx}">Remove</button></div>`;
      }
    }).join('');
    container.innerHTML = rows;
  }

  function isVacationDate(iso){
    try{
      const cfg = VACATION || loadVacation();
      if (!cfg || !Array.isArray(cfg.ranges)) return false;
      return cfg.ranges.some(r=> dateInRangeISO(iso, r.from, r.to));
    }catch(_){ return false; }
  }
  function filterRowsForView(rows){
    try{
      const cfg = VACATION || loadVacation();
      if (!cfg || !Array.isArray(cfg.ranges) || !cfg.ranges.length) return rows||[];
      return (rows||[]).filter(r=> !isVacationDate(r.work_date));
    }catch(_){ return rows||[]; }
  }

  function isPeakSeasonDate(iso){
    try{
      const cfg = PEAK_SEASON || loadPeakSeason();
      if (!cfg || !cfg.from || !cfg.to) return false;
      return dateInRangeISO(iso, cfg.from, cfg.to);
    }catch(_){
      return false;
    }
  }

  function syncEvalGlobals(){
    EVAL_PROFILES = loadEvalProfiles();
    USPS_EVAL = loadEval();
  }

  const USER_SETTINGS_TABLE = 'user_settings';
  let userSettingsSynced = false;
  let suppressSettingsSave = false;
  let pendingSettingsPayload = null;
  let settingsSaveTimer = null;

  function buildUserSettingsPayload(){
    const evalProfiles = (EVAL_PROFILES || []).map(profile => ({
      profileId: profile.profileId,
      label: profile.label,
      routeId: profile.routeId,
      evalCode: profile.evalCode,
      boxes: profile.boxes ?? null,
      stops: profile.stops ?? null,
      hoursPerDay: profile.hoursPerDay ?? null,
      officeHoursPerDay: profile.officeHoursPerDay ?? null,
      annualSalary: profile.annualSalary ?? null,
      evalDaysPerYear: profile.evalDaysPerYear ?? null,
      effectiveFrom: profile.effectiveFrom ?? null,
      effectiveTo: profile.effectiveTo ?? null
    }));
    const vacationRanges = listVacationRanges().map(r => ({ from: r.from, to: r.to }));
    const ema = readStoredEma();
    const extraTrip = Number.isFinite(ema) ? { ema } : null;
    const activeEvalId = USPS_EVAL?.profileId || getActiveEvalId();
    const tokenUsage = loadTokenUsage();
    const dismissedList = loadDismissedResiduals(parseDismissReasonInput);
    return {
      eval_profiles: evalProfiles,
      active_eval_id: activeEvalId || null,
      vacation_ranges: vacationRanges,
      extra_trip: extraTrip,
      ai_token_usage: tokenUsage,
      diagnostics_dismissed: dismissedList
    };
  }

  function normalizeLocalTagHistory(seedFromDismissed = []){
    try{
      const raw = localStorage.getItem('routeStats.tagHistory');
      const parsed = raw ? JSON.parse(raw) : [];
      const history = Array.isArray(parsed) ? parsed : [];
      const mergeTagListsStable = (primary = [], incoming = []) => {
        const byReason = new Map();
        const upsert = (tag, preferIncoming = false) => {
          if (!tag) return;
          const key = String(tag.key || '').trim() || 'misc';
          const reason = String(tag.reason || key).trim() || key;
          const mapKey = `${key}:${reason.toLowerCase()}`;
          if (!byReason.has(mapKey) || preferIncoming){
            byReason.set(mapKey, {
              key,
              reason,
              minutes: (tag.minutes != null && Number.isFinite(Number(tag.minutes))) ? Number(tag.minutes) : null,
              notedAt: tag.notedAt || new Date().toISOString()
            });
          }
        };
        (primary || []).forEach(tag => upsert(tag, false));
        (incoming || []).forEach(tag => upsert(tag, true));
        return Array.from(byReason.values());
      };
      const byIso = new Map();
      history
        .filter(Boolean)
        .forEach(item => {
          const iso = item?.iso || item?.date || null;
          if (!iso) return;
          const tags = normalizeTagEntries(item.tags || []);
          if (!tags.length) return;
          byIso.set(iso, { iso, tags });
        });
      (seedFromDismissed || []).forEach(item => {
        const iso = item?.iso || null;
        if (!iso) return;
        const current = byIso.get(iso);
        // Merge by tag identity, not additive math, to prevent repeated startup inflation.
        const mergedTags = mergeTagListsStable(current?.tags || [], normalizeTagEntries(item.tags || []));
        if (!mergedTags.length) return;
        byIso.set(iso, { iso, tags: mergedTags });
      });
      const normalized = Array.from(byIso.values()).sort((a, b) => String(a.iso).localeCompare(String(b.iso)));
      const before = JSON.stringify(history);
      const after = JSON.stringify(normalized);
      if (before !== after){
        localStorage.setItem('routeStats.tagHistory', after);
        return true;
      }
      return false;
    }catch(_){
      return false;
    }
  }

  function normalizeDiagnosticsTagData(){
    let changed = false;
    let dismissed = [];
    try{
      dismissed = loadDismissedResiduals(parseDismissReasonInput);
      const beforeRaw = localStorage.getItem('routeStats.diagnostics.dismissed') || '[]';
      const afterRaw = JSON.stringify(dismissed || []);
      if (beforeRaw !== afterRaw){
        saveDismissedResiduals(dismissed);
        changed = true;
      }
    }catch(_){ }
    if (normalizeLocalTagHistory(dismissed)) changed = true;
    return changed;
  }

  async function upsertUserSettingsRemote(payload){
    if (!CURRENT_USER_ID) return;
    try{
      const { error } = await sb.from(USER_SETTINGS_TABLE).upsert({
        user_id: CURRENT_USER_ID,
        eval_profiles: payload.eval_profiles || [],
        active_eval_id: payload.active_eval_id || null,
        vacation_ranges: payload.vacation_ranges || [],
        extra_trip: payload.extra_trip || null,
        diagnostics_dismissed: payload.diagnostics_dismissed || [],
        ai_token_usage: payload.ai_token_usage || null,
        updated_at: new Date().toISOString()
      });
      if (error) console.warn('[Settings] upsert failed', error);
    }catch(err){
      console.warn('[Settings] upsert error', err);
    }
  }

  function scheduleUserSettingsSave(){
    if (suppressSettingsSave) return;
    if (!CURRENT_USER_ID) return;
    pendingSettingsPayload = buildUserSettingsPayload();
    if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(()=>{
      const payload = pendingSettingsPayload;
      pendingSettingsPayload = null;
      if (!payload) return;
      upsertUserSettingsRemote(payload);
    }, 800);
  }

  async function syncUserSettingsFromRemote(){
    if (!CURRENT_USER_ID) return;
    let pushTokenUsageAfterSync = false;
    try{
      const { data, error } = await sb
        .from(USER_SETTINGS_TABLE)
        .select('eval_profiles, active_eval_id, vacation_ranges, extra_trip, ai_token_usage, diagnostics_dismissed')
        .eq('user_id', CURRENT_USER_ID)
        .maybeSingle();
      if (error && error.code !== 'PGRST116'){
        console.warn('[Settings] load failed', error);
        return;
      }
      suppressSettingsSave = true;
      try{
        if (data){
          if (Array.isArray(data.eval_profiles)){
            saveEvalProfiles(data.eval_profiles);
            if (data.active_eval_id){
              setActiveEvalId(data.active_eval_id);
            }
            syncEvalGlobals();
          }
          if (Array.isArray(data.vacation_ranges)){
            const sanitized = data.vacation_ranges
              .filter(r => r?.from && r?.to)
              .map(r => ({ from: r.from, to: r.to }));
            const normalized = normalizeRanges(sanitized);
            VACATION = { ranges: normalized };
            saveVacation(VACATION);
          }
          if (data.extra_trip && typeof data.extra_trip === 'object'){
            const emaVal = parseFloat(data.extra_trip.ema);
            if (Number.isFinite(emaVal)){
              try{ localStorage.setItem(SECOND_TRIP_EMA_KEY, String(emaVal)); }catch(_){}
            }
          }
          if (data.ai_token_usage && typeof data.ai_token_usage === 'object'){
            const localUsage = loadTokenUsage();
            const { merged, source } = mergeTokenUsage(localUsage, data.ai_token_usage);
            if (source === 'incoming'){
              saveTokenUsage(merged, { preserveTimestamp: true });
            } else {
              saveTokenUsage(merged);
              pushTokenUsageAfterSync = true;
            }
          } else {
            pushTokenUsageAfterSync = true;
          }
          if (Array.isArray(data.diagnostics_dismissed)){
            saveDismissedResiduals(data.diagnostics_dismissed);
          }
        } else {
          await upsertUserSettingsRemote(buildUserSettingsPayload());
        }
      } finally {
        suppressSettingsSave = false;
      }
      if (pushTokenUsageAfterSync) scheduleUserSettingsSave();
      if (normalizeDiagnosticsTagData()) scheduleUserSettingsSave();
      renderVacationRanges();
      renderUspsEvalTag();
      if (secondTripEmaInput){
        secondTripEmaInput.value = readStoredEma();
        updateSecondTripSummary();
      }
      try{
        const latestUsage = loadTokenUsage();
        aiSummary.populateTokenInputs(latestUsage);
        aiSummary.updateTokenUsageCard(latestUsage);
      }catch(_){ }
      try{
        resetDiagnosticsCache?.();
        buildDiagnostics(filterRowsForView(allRows || []));
      }catch(_){ }
      buildEvalCompare(allRows || []);
    }catch(err){
      suppressSettingsSave = false;
      console.warn('[Settings] sync error', err);
    }
  }

  async function ensureUserSettingsSync(){
    if (!CURRENT_USER_ID) return;
    if (userSettingsSynced) return;
    userSettingsSynced = true;
    await syncUserSettingsFromRemote();
  }
  normalizeDiagnosticsTagData();

  function getEvalProfileById(profileId){
    if (!profileId) return null;
    return (EVAL_PROFILES || []).find(p => p.profileId === profileId) || null;
  }

  function getEvalProfileDisplayName(profile){
    if (!profile) return 'Evaluation';
    if (profile.label) return profile.label;
    const parts = [profile.routeId, profile.evalCode].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Evaluation';
  }

  function getEvalHeaderLabel(profile){
    if (!profile) return 'Evaluation';
    const base = getEvalProfileDisplayName(profile);
    const code = String(profile.evalCode || '').trim();
    if (!code) return base;
    const hasCode = base.toLowerCase().includes(code.toLowerCase());
    return hasCode ? base : `${base} ${code}`;
  }

  function applyEvalProfileToInputs(profileId){
    const profile = getEvalProfileById(profileId) || USPS_EVAL || (EVAL_PROFILES && EVAL_PROFILES[0]) || null;
    if (!profile) return;
    if (evalProfileSelect && profile.profileId) evalProfileSelect.value = profile.profileId;
    if (evalProfileLabelInput) evalProfileLabelInput.value = profile.label || '';
    if (evalRouteId) evalRouteId.value = profile.routeId || '';
    if (evalCode) evalCode.value = profile.evalCode || '';
    if (evalBoxesIn) evalBoxesIn.value = profile.boxes != null ? profile.boxes : '';
    if (evalStopsIn) evalStopsIn.value = profile.stops != null ? profile.stops : '';
    if (evalHoursIn) evalHoursIn.value = profile.hoursPerDay != null ? profile.hoursPerDay : '';
    if (evalOfficeHoursIn) evalOfficeHoursIn.value = profile.officeHoursPerDay != null ? profile.officeHoursPerDay : '';
    if (evalSalaryIn) evalSalaryIn.value = profile.annualSalary != null ? profile.annualSalary : '';
    if (evalWorkDaysYearIn) evalWorkDaysYearIn.value = profile.evalDaysPerYear != null ? profile.evalDaysPerYear : '';
    if (evalEffectiveFromInput) evalEffectiveFromInput.value = profile.effectiveFrom || '';
    if (evalEffectiveToInput) evalEffectiveToInput.value = profile.effectiveTo || '';
  }

  function populateEvalProfileSelectUI(selectedId){
    if (!evalProfileSelect) return;
    syncEvalGlobals();
    evalProfileSelect.innerHTML = '';
    (EVAL_PROFILES || []).forEach(profile=>{
      const opt = document.createElement('option');
      opt.value = profile.profileId;
      opt.textContent = getEvalProfileDisplayName(profile);
      evalProfileSelect.appendChild(opt);
    });
    const fallbackId = USPS_EVAL?.profileId || (EVAL_PROFILES && EVAL_PROFILES[0]?.profileId) || null;
    const targetId = (selectedId && getEvalProfileById(selectedId)) ? selectedId : fallbackId;
    if (targetId) evalProfileSelect.value = targetId;
    applyEvalProfileToInputs(targetId);
    if (evalProfileDeleteBtn){
      evalProfileDeleteBtn.disabled = (EVAL_PROFILES?.length || 0) <= 1;
    }
  }

  function readNumberInput(el){
    if (!el) return null;
    const raw = el.value;
    if (raw === '' || raw == null) return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  }

  function collectEvalFormValues(profileId){
    const base = getEvalProfileById(profileId) || USPS_EVAL || {};
    const routeIdVal = (evalRouteId?.value || '').trim();
    const evalCodeVal = (evalCode?.value || '').trim();
    const labelVal = (evalProfileLabelInput?.value || '').trim();
    const label = labelVal || getEvalProfileDisplayName({ ...base, routeId: routeIdVal, evalCode: evalCodeVal });
    return {
      ...base,
      profileId: base.profileId || profileId || null,
      label,
      routeId: routeIdVal || base.routeId || 'R1',
      evalCode: evalCodeVal || base.evalCode || '',
      boxes: readNumberInput(evalBoxesIn),
      stops: readNumberInput(evalStopsIn),
      hoursPerDay: readNumberInput(evalHoursIn),
      officeHoursPerDay: readNumberInput(evalOfficeHoursIn),
      annualSalary: readNumberInput(evalSalaryIn),
      evalDaysPerYear: readNumberInput(evalWorkDaysYearIn),
      effectiveFrom: (evalEffectiveFromInput?.value || '').trim() || null,
      effectiveTo: (evalEffectiveToInput?.value || '').trim() || null
    };
  }

  function rowsForEvaluationRange(rows, profile){
    if (!profile) return [];
    let from = null;
    let to = null;
    try{
      if (profile.effectiveFrom){
        const dt = DateTime.fromISO(profile.effectiveFrom, { zone: ZONE });
        if (dt.isValid) from = dt.startOf('day');
      }
      if (profile.effectiveTo){
        const dt = DateTime.fromISO(profile.effectiveTo, { zone: ZONE });
        if (dt.isValid) to = dt.endOf('day');
      }
    }catch(_){ /* ignore parse errors */ }
    return (rows||[]).filter(r=>{
      if (!r || !r.work_date) return false;
      try{
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        if (!d.isValid) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }catch(_){ return false; }
    });
  }

  function formatNumber(value, digits=0){
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return '0';
    return num.toLocaleString(undefined, { minimumFractionDigits:digits, maximumFractionDigits:digits });
  }

  function formatSigned(value, digits=0){
    const num = Number(value || 0);
    const prefix = num > 0 ? '+' : '';
    return `${prefix}${formatNumber(num, digits)}`;
  }

  function formatMoney(value, digits=2){
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }

  function formatMaybe(value, digits=1, suffix=''){
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return `${formatNumber(num, digits)}${suffix}`;
  }

  function formatSignedMaybe(value, digits=1, suffix=''){
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const prefix = num > 0 ? '+' : '';
    return `${prefix}${formatNumber(num, digits)}${suffix}`;
  }

  function parseFlatsFromWeatherValue(weather){
    if (!weather) return 0;
    try{
      const text = String(weather);
      const flatsMatch = text.match(/\bFlats:\s*([0-9.]+)/i);
      if (flatsMatch && Number.isFinite(Number(flatsMatch[1]))) return Number(flatsMatch[1]);
      const boxMatch = text.match(/\bBox:\s*([0-9.]+)/i);
      if (boxMatch && Number.isFinite(Number(boxMatch[1]))) return Number(boxMatch[1]);
      return 0;
    }catch(_){
      return 0;
    }
  }

  function getFlatCount(row){
    const direct = Number(row?.flats ?? row?.flat_count ?? row?.flatCount);
    if (Number.isFinite(direct)) return direct;
    return parseFlatsFromWeatherValue(row?.weather_json);
  }

  function getProfileRange(profile){
    if (!profile) return { from: null, to: null };
    let from = null;
    let to = null;
    try{
      if (profile.effectiveFrom){
        const dt = DateTime.fromISO(profile.effectiveFrom, { zone: ZONE });
        if (dt.isValid) from = dt.startOf('day');
      }
      if (profile.effectiveTo){
        const dt = DateTime.fromISO(profile.effectiveTo, { zone: ZONE });
        if (dt.isValid) to = dt.endOf('day');
      }
    }catch(_){ /* ignore */ }
    return { from, to };
  }

  function profileIncludesDay(profile, day){
    const { from, to } = getProfileRange(profile);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }

  function findActiveEvalProfileId(){
    const profiles = EVAL_PROFILES || [];
    if (!profiles.length) return null;
    const now = DateTime.now().setZone(ZONE).startOf('day');
    const activeCandidates = profiles
      .filter(profile => profileIncludesDay(profile, now))
      .sort((a, b) => {
        const aFrom = getProfileRange(a).from;
        const bFrom = getProfileRange(b).from;
        const aTs = aFrom && aFrom.isValid ? aFrom.toMillis() : -Infinity;
        const bTs = bFrom && bFrom.isValid ? bFrom.toMillis() : -Infinity;
        return bTs - aTs;
      });
    if (activeCandidates.length) return activeCandidates[0].profileId;

    const pastCandidates = profiles
      .map(profile => ({ profile, range: getProfileRange(profile) }))
      .filter(({ range }) => {
        if (range.to && range.to.isValid) return range.to < now;
        if (range.from && range.from.isValid) return range.from < now;
        return false;
      })
      .sort((a, b) => {
        const aTs = a.range.to?.toMillis?.() ?? a.range.from?.toMillis?.() ?? -Infinity;
        const bTs = b.range.to?.toMillis?.() ?? b.range.from?.toMillis?.() ?? -Infinity;
        return bTs - aTs;
      });
    if (pastCandidates.length) return pastCandidates[0].profile.profileId;

    const stored = getActiveEvalId();
    if (stored && getEvalProfileById(stored)) return stored;
    return profiles[0].profileId;
  }

  function getEvalProfileSortValue(profile){
    const range = getProfileRange(profile);
    return range.from?.toMillis?.() ?? range.to?.toMillis?.() ?? -Infinity;
  }

  function getOrderedEvalProfiles(){
    return [...(EVAL_PROFILES || [])].sort((a, b) => getEvalProfileSortValue(a) - getEvalProfileSortValue(b));
  }

  function getPreviousEvalProfile(activeId){
    const ordered = getOrderedEvalProfiles();
    const idx = ordered.findIndex(p => p.profileId === activeId);
    if (idx <= 0) return null;
    return ordered[idx - 1] || null;
  }

  function getPriorEvalProfiles(activeProfile){
    if (!activeProfile) return [];
    const ordered = getOrderedEvalProfiles();
    const activeIdx = ordered.findIndex(p => p.profileId === activeProfile.profileId);
    if (activeIdx <= 0) return ordered.filter(p => p.profileId !== activeProfile.profileId);
    return ordered.slice(0, activeIdx);
  }

  function selectWorkedRows(rows){
    return (rows || []).filter(row => row && row.status !== 'off' && row.work_date);
  }

  function computeWindowMetrics(profile, rows, options = {}){
    const threshold = 0.1;
    const worked = rowsForEvaluationRange(selectWorkedRows(rows), profile)
      .sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)));
    const wantsLast14 = !!options.last14;
    const baselineFallback = !!options.baselineFallbackToWindow;
    let sampleMode = 'window';
    let selected = worked;
    if (wantsLast14){
      if (baselineFallback && worked.length < 14){
        sampleMode = 'windowFallback';
      } else {
        selected = worked.slice(-14);
        sampleMode = worked.length >= 14 ? 'last14' : 'last14Partial';
      }
    }
    const days = selected.length;
    const evalHoursPerDay = Number(profile?.hoursPerDay);
    let totals = { parcels:0, letters:0, flats:0, volume:0, hours:0, officeTime:0, miles:0 };
    let deltaSum = 0;
    let deltaCount = 0;
    let overEvalDays = 0;
    let underEvalDays = 0;

    selected.forEach((row) => {
      const parcels = Number(row?.parcels) || 0;
      const letters = Number(row?.letters) || 0;
      const flats = getFlatCount(row);
      const hours = Number(row?.hours) || 0;
      const officeTime = Number(row?.office_minutes ?? row?.officeMinutes) || 0;
      const miles = Number(row?.miles) || 0;
      const volume = parcels + letters + flats;
      totals.parcels += parcels;
      totals.letters += letters;
      totals.flats += flats;
      totals.volume += volume;
      totals.hours += hours;
      totals.officeTime += officeTime;
      totals.miles += miles;
      if (Number.isFinite(evalHoursPerDay)){
        const delta = hours - evalHoursPerDay;
        deltaSum += delta;
        deltaCount += 1;
        if (delta > threshold) overEvalDays += 1;
        if (delta < -threshold) underEvalDays += 1;
      }
    });

    const avg = (value) => (days > 0 ? value / days : null);
    const avgDeltaHoursPerDay = deltaCount > 0 ? deltaSum / deltaCount : null;
    const quarterlyPay = Number.isFinite(Number(profile?.annualSalary)) ? Number(profile.annualSalary) / 4 : null;
    const effectiveHourly = quarterlyPay && totals.hours > 0 ? quarterlyPay / totals.hours : null;
    const volumePerHour = (totals.hours > 0) ? (totals.volume / totals.hours) : null;
    const parcelsPerHour = (totals.hours > 0) ? (totals.parcels / totals.hours) : null;
    const volumePerEvalHour = Number.isFinite(evalHoursPerDay) && evalHoursPerDay > 0 ? ((avg(totals.volume)) / evalHoursPerDay) : null;
    const deltaPer1000Volume = (avg(totals.volume) > 0 && Number.isFinite(avgDeltaHoursPerDay))
      ? (avgDeltaHoursPerDay / avg(totals.volume)) * 1000
      : null;

    return {
      profile,
      rows: selected,
      allRowsInWindow: worked,
      sampleMode,
      workedDays: days,
      totals,
      averages: {
        parcelsPerDay: avg(totals.parcels),
        lettersPerDay: avg(totals.letters),
        flatsPerDay: avg(totals.flats),
        volumePerDay: avg(totals.volume),
        hoursPerDay: avg(totals.hours),
        officeTimePerDay: avg(totals.officeTime),
        milesPerDay: avg(totals.miles)
      },
      evalHoursPerDay: Number.isFinite(evalHoursPerDay) ? evalHoursPerDay : null,
      avgDeltaHoursPerDay,
      overEvalDays,
      underEvalDays,
      quarterlyPay,
      effectiveHourly,
      density: {
        volumePerHour,
        parcelsPerHour,
        volumePerEvalHour,
        deltaPer1000Volume
      }
    };
  }

  function metricClassByDelta(delta, meaning = 'neutral'){
    const n = Number(delta);
    if (!Number.isFinite(n)) return 'eval-neutral';
    if (meaning === 'overUnder'){
      if (Math.abs(n) <= 0.1) return 'eval-neutral';
      return n > 0 ? 'eval-bad' : 'eval-good';
    }
    if (meaning === 'efficiencyGoodUp'){
      if (Math.abs(n) <= 0.0001) return 'eval-neutral';
      return n > 0 ? 'eval-good' : 'eval-bad';
    }
    if (meaning === 'loadGoodDown'){
      if (Math.abs(n) <= 0.0001) return 'eval-neutral';
      return n > 0 ? 'eval-bad' : 'eval-good';
    }
    return 'eval-neutral';
  }

  function computeDelta(active, baseline){
    const a = Number(active);
    const b = Number(baseline);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { value:null, pct:null };
    const value = a - b;
    const pct = Math.abs(b) > 0.000001 ? (value / b) * 100 : null;
    return { value, pct };
  }

  function makeComparisonRow(group, label, baseline, active, options = {}){
    const { value, pct } = computeDelta(active, baseline);
    return {
      group,
      label,
      baseline,
      active,
      delta: value,
      pct,
      digits: options.digits ?? 2,
      suffix: options.suffix || '',
      meaning: options.meaning || 'neutral'
    };
  }

  function buildComparisonSummary(activeMetrics, baselineMetrics){
    if (!activeMetrics || !baselineMetrics) return null;
    const rows = [
      makeComparisonRow('time', 'Avg hours/day', baselineMetrics.averages.hoursPerDay, activeMetrics.averages.hoursPerDay, { digits:2, suffix:'h', meaning:'loadGoodDown' }),
      makeComparisonRow('time', 'Total hours', baselineMetrics.totals.hours, activeMetrics.totals.hours, { digits:1, suffix:'h', meaning:'loadGoodDown' }),
      makeComparisonRow('time', 'Avg delta vs eval/day', baselineMetrics.avgDeltaHoursPerDay, activeMetrics.avgDeltaHoursPerDay, { digits:2, suffix:'h', meaning:'overUnder' }),
      makeComparisonRow('workload', 'Avg parcels/day', baselineMetrics.averages.parcelsPerDay, activeMetrics.averages.parcelsPerDay, { digits:1, meaning:'loadGoodDown' }),
      makeComparisonRow('workload', 'Avg letters/day', baselineMetrics.averages.lettersPerDay, activeMetrics.averages.lettersPerDay, { digits:1, meaning:'loadGoodDown' }),
      makeComparisonRow('workload', 'Avg flats/day', baselineMetrics.averages.flatsPerDay, activeMetrics.averages.flatsPerDay, { digits:1, meaning:'loadGoodDown' }),
      makeComparisonRow('workload', 'Avg volume/day', baselineMetrics.averages.volumePerDay, activeMetrics.averages.volumePerDay, { digits:1, meaning:'loadGoodDown' }),
      makeComparisonRow('workload', 'Office time/day', baselineMetrics.averages.officeTimePerDay, activeMetrics.averages.officeTimePerDay, { digits:2, suffix:'h', meaning:'loadGoodDown' }),
      makeComparisonRow('workload', 'Miles/day', baselineMetrics.averages.milesPerDay, activeMetrics.averages.milesPerDay, { digits:1, meaning:'loadGoodDown' }),
      makeComparisonRow('efficiency', 'Volume/hour', baselineMetrics.density.volumePerHour, activeMetrics.density.volumePerHour, { digits:2, meaning:'efficiencyGoodUp' }),
      makeComparisonRow('efficiency', 'Parcels/hour', baselineMetrics.density.parcelsPerHour, activeMetrics.density.parcelsPerHour, { digits:2, meaning:'efficiencyGoodUp' }),
      makeComparisonRow('efficiency', 'Volume/eval hour', baselineMetrics.density.volumePerEvalHour, activeMetrics.density.volumePerEvalHour, { digits:2, meaning:'efficiencyGoodUp' }),
      makeComparisonRow('efficiency', 'Delta hours per 1000 volume', baselineMetrics.density.deltaPer1000Volume, activeMetrics.density.deltaPer1000Volume, { digits:2, suffix:'h', meaning:'overUnder' }),
      makeComparisonRow('pay', 'Eval annual pay', baselineMetrics.profile?.annualSalary, activeMetrics.profile?.annualSalary, { digits:0, meaning:'efficiencyGoodUp' }),
      makeComparisonRow('pay', 'Eval route hours/day', baselineMetrics.evalHoursPerDay, activeMetrics.evalHoursPerDay, { digits:2, suffix:'h', meaning:'neutral' }),
      makeComparisonRow('pay', 'Effective $/hour', baselineMetrics.effectiveHourly, activeMetrics.effectiveHourly, { digits:2, meaning:'efficiencyGoodUp' })
    ];
    const topDelta = rows.find(row => row.label === 'Avg delta vs eval/day') || null;
    const hrsDelta = rows.find(row => row.label === 'Avg hours/day');
    const volDelta = rows.find(row => row.label === 'Avg volume/day');
    const effDelta = rows.find(row => row.label === 'Volume/hour');
    const deltaDir = (topDelta?.delta ?? 0) < -0.1 ? 'improving' : ((topDelta?.delta ?? 0) > 0.1 ? 'worsening' : 'steady');
    const narrative = [
      `Time per day is ${formatSignedMaybe(hrsDelta?.delta, 2, 'h')} and workload per day is ${formatSignedMaybe(volDelta?.delta, 1)} vs baseline.`,
      `Efficiency (volume/hour) shifted ${formatSignedMaybe(effDelta?.delta, 2)} and over/under evaluation is ${deltaDir} (${formatSignedMaybe(topDelta?.delta, 2, 'h/day')}).`,
      `Effective $/hour moved ${formatSignedMaybe((rows.find(r => r.label === 'Effective $/hour') || {}).delta, 2)} (${formatMoney(baselineMetrics.effectiveHourly)} → ${formatMoney(activeMetrics.effectiveHourly)}).`
    ].join(' ');
    return { rows, narrative, topDelta };
  }

  function buildEvalNarrative(summary){
    if (!summary) return 'No comparison data available.';
    return summary.narrative;
  }

  function computeEvaluationProgress(profile){
    if (!profile) return { hasActiveWindow:false };
    const today = DateTime.now().setZone(ZONE).startOf('day');
    const { from, to } = getProfileRange(profile);
    if (!from || !to || !from.isValid || !to.isValid) return { hasActiveWindow:false };
    const hasActiveWindow = today >= from && today <= to;
    if (!hasActiveWindow){
      return { hasActiveWindow:false, start:from, end:to };
    }
    const totalDays = Math.max(1, Math.floor(to.diff(from, 'days').days) + 1);
    const elapsedDays = Math.max(0, Math.floor(today.diff(from, 'days').days) + 1);
    const remainingDays = Math.max(0, totalDays - elapsedDays);
    const progressPct = (elapsedDays / totalDays) * 100;
    return { hasActiveWindow:true, start:from, end:to, totalDays, elapsedDays, remainingDays, progressPct, today };
  }

  function computeTwoWeekBlock(progress){
    if (!progress?.hasActiveWindow || !progress.start || !progress.today) return null;
    const daysFromStart = Math.max(0, Math.floor(progress.today.diff(progress.start, 'days').days));
    const blockNumber = Math.floor(daysFromStart / 14) + 1;
    const blockStart = progress.start.plus({ days: (blockNumber - 1) * 14 }).startOf('day');
    const theoreticalEnd = blockStart.plus({ days: 13 }).endOf('day');
    const blockEnd = theoreticalEnd > progress.end ? progress.end : theoreticalEnd;
    const daysRemaining = Math.max(0, Math.floor(blockEnd.diff(progress.today, 'days').days));
    const nextCheck = blockEnd < progress.end ? blockEnd.plus({ days: 1 }).startOf('day') : null;
    return { blockNumber, blockStart, blockEnd, daysRemaining, nextCheck };
  }

  function renderEvalTrendList(container, profiles, rows, options = {}){
    if (!container) return;
    const ordered = [...(profiles || [])]
      .sort((a, b) => getEvalProfileSortValue(a) - getEvalProfileSortValue(b))
      .slice(-6);
    if (!ordered.length){
      container.innerHTML = '<li><span>No evaluation history yet.</span><span class="num eval-neutral">—</span></li>';
      return;
    }
    const items = ordered.map((profile) => {
      const metrics = computeWindowMetrics(profile, rows, { last14: !!options.last14, baselineFallbackToWindow: false });
      const label = getEvalProfileDisplayName(profile);
      const delta = formatSignedMaybe(metrics.avgDeltaHoursPerDay, 2, 'h/day');
      const eff = formatMoney(metrics.effectiveHourly);
      return `<li><span>${label}</span><span class="num ${metricClassByDelta(metrics.avgDeltaHoursPerDay, 'overUnder')}">${delta} • ${eff}</span></li>`;
    });
    container.innerHTML = items.join('');
  }

  function renderEvalList(container, items){
    if (!container) return;
    container.innerHTML = items.map((item) => `
      <li>
        <span>${item.label}</span>
        <span class="num ${item.cls || 'eval-neutral'}">${item.value}</span>
      </li>
    `).join('');
  }

  // === Feature Flags (localStorage) ===
  let FLAGS = loadFlags();
  let evalCompareState = {
    activeId: null,
    compareEnabled: false,
    compareId: null,
    last14: false
  };

  // === Feature Flags (localStorage) ===
  let parserChart = null;
  let sleepTrendChart = null;
  let sleepWeekdayChart = null;
  let drinkWeekdayChart = null;

  // === Helpers ===
  const $ = id => document.getElementById(id);
  const dConn=$('dConn'), dAuth=$('dAuth'), dWrite=$('dWrite');

  function updateModelScopeBadge(){
    const el = document.getElementById('modelScopeBadge');
    if (!el) return;
    const scope = getModelScope();
    const isRolling = scope !== 'all';
    el.classList.toggle('all', !isRolling);
    el.innerHTML = `<span class="dot" aria-hidden="true"></span>${isRolling ? 'Rolling · 120d' : 'All-time'}`;
  }

  function rowsForModelScope(allRows){
    const rows = Array.isArray(allRows) ? allRows : [];
    const scope = getModelScope();
    const cutoff = DateTime.now().setZone(ZONE).minus({ days:120 }).startOf('day');
    const base = scope !== 'rolling'
      ? rows
      : rows.filter(r=>{
          try{
            if (!r || !r.work_date) return false;
            const d = DateTime.fromISO(r.work_date, { zone: ZONE });
            return d >= cutoff;
          }catch(_){ return false; }
        });
    if (!PEAK_SEASON?.excludeFromModel || !PEAK_SEASON.from || !PEAK_SEASON.to) return base;
    return base.filter(r => !isPeakSeasonDate(r.work_date));
  }
  (function initModelScopeUI(){
    const el = document.getElementById('modelScope');
    if (!el) return;
    el.value = getModelScope();
    el.addEventListener('change', ()=>{
      setModelScope(el.value);
      updateModelScopeBadge();
      rebuildAll();
    });
  })();

  // NEW: set live header date + version tag
  (function(){
    const d = DateTime.now().setZone(ZONE);
    const el = document.getElementById('headerDate');
    if (el) el.textContent = d.toFormat('MMM d, yyyy');
    const ver = document.getElementById('verTag');
    if (ver) ver.textContent = 'v' + d.toFormat('yyyy-MM-dd');
    updateModelScopeBadge();
  })();

  function renderUspsEvalTag(){
    try{
      const tag = document.getElementById('uspsEvalTag'); if (!tag) return;
      if (!FLAGS.uspsEval){ tag.style.display='none'; return; }
      const cfg = USPS_EVAL || loadEval();
      $('evalRouteLabel').textContent = cfg.routeId || '—';
      $('evalEvalCode').textContent = cfg.evalCode || '—';
      $('evalBoxes').textContent = (cfg.boxes!=null? cfg.boxes : '—') + ' boxes';
      $('evalSalary').textContent = (cfg.annualSalary!=null? ('$'+Number(cfg.annualSalary).toLocaleString()) : '—') + '/yr';
      const hp = (cfg.hoursPerDay!=null? cfg.hoursPerDay : '—');
      const oh = (cfg.officeHoursPerDay!=null? cfg.officeHoursPerDay : '—');
      $('evalHours').textContent = `${hp}h (${oh} office)`;
      tag.style.display='block';
      tag.onclick = ()=> document.getElementById('btnSettings')?.click();
    }catch(_){ /* ignore */ }
  }

  async function renderTomorrowForecast(){
    try{
      const container = document.querySelector('#forecastBadgeContainer') || document.body;
      const showMessage = ({ title = '🌤 Tomorrow’s Forecast', msg = '' } = {}) => {
        if (!container) return;
        const existingBadges = container.querySelectorAll('.forecast-badge');
        existingBadges.forEach(node => node.remove());
        const forecastBadge = document.createElement('div');
        forecastBadge.className = 'forecast-badge';
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        const bodyEl = document.createElement('p');
        bodyEl.textContent = msg;
        forecastBadge.appendChild(titleEl);
        forecastBadge.appendChild(bodyEl);
        container.appendChild(forecastBadge);
      };

      const now = DateTime.now().setZone(ZONE);
      const hour = now.hour;

      if (hour >= 20) {
        if (CURRENT_USER_ID){
          try {
            await syncForecastSnapshotsFromSupabase(sb, CURRENT_USER_ID, { silent: true });
          } catch (err) {
            console.warn('renderTomorrowForecast: snapshot sync failed, using local cache', err);
          }
        }
        const targetDate = now.plus({ days: 1 });
        const targetDow = targetDate.weekday === 7 ? 0 : targetDate.weekday;

        if (targetDow === 0) {
          showMessage({ msg: "Enjoy your day off ❤️" });
          return;
        }

        const forecastText = computeForecastText({ targetDow }) || 'Forecast unavailable';
        const iso = targetDate.toISODate();
        storeForecastSnapshot(iso, forecastText);
        if (CURRENT_USER_ID){
          try{
            await saveForecastSnapshot({
              iso,
              weekday: targetDow,
              totalTime: null,
              officeTime: null,
              endTime: null,
              tags: readTagHistoryForIso(iso),
              user_id: CURRENT_USER_ID
            }, { supabaseClient: sb, silent: true });
          }catch(err){ console.warn('saveForecastSnapshot (remote) failed', err); }
        }
        showMessage({ msg: forecastText });
        return;
      }

      if (hour < 8) {
        const todayIso = now.toISODate();
        const latest = loadLatestForecastMessage();
        if (latest?.iso === todayIso && latest?.text){
          showMessage({ msg: latest.text });
          return;
        }
        const todayDow = now.weekday === 7 ? 0 : now.weekday;
        const forecastText = computeForecastText({ targetDow: todayDow }) || 'Forecast unavailable';
        storeForecastSnapshot(todayIso, forecastText);
        if (CURRENT_USER_ID){
          try{
            await saveForecastSnapshot({
              iso: todayIso,
              weekday: todayDow,
              totalTime: null,
              officeTime: null,
              endTime: null,
              tags: readTagHistoryForIso(todayIso),
              user_id: CURRENT_USER_ID
            }, { supabaseClient: sb, silent: true });
          }catch(err){ console.warn('saveForecastSnapshot (remote) failed', err); }
        }
        showMessage({ msg: forecastText });
        return;
      }

      showMessage({
        title: '❤',
        msg: 'Stay safe out there my Stallion.'
      });
    }catch(err){
      console.warn('renderTomorrowForecast failed', err);
    }
  }
  window.renderTomorrowForecast = renderTomorrowForecast;
  // initial render
  renderUspsEvalTag();
  renderVacationRanges();
  
  // === NEW: Sync forecast snapshots from Supabase before rendering ===
  (async () => {
    const session = await authReadyPromise;
    CURRENT_USER_ID = session?.user?.id || null;
  
    if (window.__sb && CURRENT_USER_ID) {
      try {
        await syncForecastSnapshotsFromSupabase(window.__sb, CURRENT_USER_ID, { silent: true });
      } catch (e) {
        console.warn("[Forecast] Snapshot sync failed:", e);
      }
    }
    // Now that sync is complete, render the forecast
    renderTomorrowForecast();
  })();

  function getLastNonEmptyWeek(rows, now, { excludeVacation = true } = {}){
    const worked = (rows || []).filter(r => (+r.hours || 0) > 0);
    const weeksToScan = 12;
    const inRange = (r, from, to) => {
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      return d >= from && d <= to;
    };
    for (let w = 1; w <= weeksToScan; w++){
      const start = startOfWeekMonday(now.minus({ weeks: w }));
      const end   = endOfWeekSunday(now.minus({ weeks: w }));
      const bucket = worked.filter(r => inRange(r, start, end) && (!excludeVacation || !isVacationDate(r.work_date)));
      if (bucket.length) return { start, end, rows: bucket };
    }
    const fallbackStart = startOfWeekMonday(now.minus({ weeks: 1 }));
    const fallbackEnd   = endOfWeekSunday(now.minus({ weeks: 1 }));
    return {
      start: fallbackStart,
      end: fallbackEnd,
      rows: worked.filter(r => inRange(r, fallbackStart, fallbackEnd))
    };
  }

  function vacMark(iso){
    return (iso && isVacationDate(iso)) ? '<sup class="vac-mark" title="Vacation day">v</sup>' : '';
  }

  function vacGlyph(iso){
    return (iso && isVacationDate(iso)) ? ' (Vacation)' : '';
  }

  function isHolidayMarked(row){
    if (!row) return false;
    const text = String(row.weather_json || '');
    return /\bHoliday\b/i.test(text);
  }

  function ensurePostHolidayTags(rows){
    if (!Array.isArray(rows)) return rows;
    try{
      const holidayOff = new Set(
        rows
          .filter(r => r && r.status === 'off' && isHolidayMarked(r))
          .map(r => r.work_date)
          .filter(Boolean)
      );

      const sorted = [...rows].filter(r => r && r.work_date).sort((a,b)=> a.work_date.localeCompare(b.work_date));
      const history = Array.from({ length: 7 }, () => ({ count:0, parcels:0, letters:0, routeMinutes:0 }));

      sorted.forEach(r => {
        try{
          if (!r || r.status === 'off') return;
          const dt = DateTime.fromISO(r.work_date, { zone: ZONE });
          if (!dt.isValid) return;
          const dow = dt.weekday % 7;
          const hist = history[dow];
          const baselineParcels = hist.count ? hist.parcels / hist.count : null;
          const baselineLetters = hist.count ? hist.letters / hist.count : null;
          const baselineRoute = hist.count ? hist.routeMinutes / hist.count : null;

          const parcels = +r.parcels || 0;
          const letters = +r.letters || 0;
          const routeMinutes = routeAdjustedMinutes(r);

          const prevIso = dt.minus({ days: 1 }).toISODate();
          const followsHoliday = prevIso && holidayOff.has(prevIso);
          let flagged = false;
          let context = null;

          if (followsHoliday){
            const ratio = (a,b)=> (b && b > 0) ? (a / b) : null;
            const ratioParcels = ratio(parcels, baselineParcels);
            const ratioLetters = ratio(letters, baselineLetters);
            const ratioRoute   = ratio(routeMinutes, baselineRoute);
            const overParcels = ratioParcels != null && ratioParcels >= 1.25;
            const overLetters = ratioLetters != null && ratioLetters >= 1.25;
            const overRoute   = ratioRoute != null && ratioRoute >= 1.15;
            flagged = overParcels || overLetters || overRoute;

            if (flagged){
              context = {
                baselineParcels,
                baselineLetters,
                baselineRouteMinutes: baselineRoute,
                parcels,
                letters,
                routeMinutes,
                ratioParcels,
                ratioLetters,
                ratioRoute,
                prevHoliday: prevIso,
                sampleSize: hist.count
              };
            }
          }

          if (flagged){
            if (!Array.isArray(r._tags)) r._tags = [];
            if (!r._tags.includes('post_holiday')) r._tags.push('post_holiday');
            if (!r._tags.includes('holiday_catchup')) r._tags.push('holiday_catchup');
            r._holidayCatchup = context;
            r._weightHints = Object.assign({}, r._weightHints, { holidayCatchup: { recommended: 0.65 }});
            const base = String(r.weather_json || '').trim();
            if (!/Reason:\s*Post-Holiday/i.test(base)){
              r.weather_json = base ? `${base} · Reason: Post-Holiday` : 'Reason: Post-Holiday';
            }
          }

          if (parcels > 0 || letters > 0 || routeMinutes > 0){
            hist.count += 1;
            hist.parcels += parcels;
            hist.letters += letters;
            hist.routeMinutes += routeMinutes;
          }
        }catch(_){ /* ignore per-row errors */ }
      });
    }catch(_){ /* ignore */ }
    return rows;
  }

  function hasTag(row, tag){
    return !!(row && Array.isArray(row._tags) && row._tags.includes(tag));
  }

  function summarizeHolidayCatchups(rows){
    const stats = { count:0, addedMinutes:0, avgRouteRatio:null };
    const ratios = [];
    (rows||[]).forEach(row => {
      if (!hasTag(row, 'holiday_catchup')) return;
      stats.count++;
      const ctx = row?._holidayCatchup || {};
      if (ctx.routeMinutes!=null && ctx.baselineRouteMinutes!=null){
        const delta = Math.max(0, ctx.routeMinutes - ctx.baselineRouteMinutes);
        stats.addedMinutes += delta;
      }
      if (ctx.ratioRoute!=null && isFinite(ctx.ratioRoute)) ratios.push(ctx.ratioRoute);
    });
    if (ratios.length){
      const total = ratios.reduce((sum,val)=> sum + val, 0);
      stats.avgRouteRatio = total / ratios.length;
    }
    return stats;
  }

  function isHolidayDownweightEnabled(){
    try{ return localStorage.getItem(RESIDUAL_WEIGHT_PREF_KEY) === '1'; }catch(_){ return false; }
  }

  function setHolidayDownweightEnabled(on){
    try{ localStorage.setItem(RESIDUAL_WEIGHT_PREF_KEY, on ? '1' : '0'); }catch(_){ }
  }

  function getResidualWeighting(){
    const enabled = isHolidayDownweightEnabled();
    if (!enabled) return { enabled:false, fn:null };
    const fn = (row)=>{
      if (!row) return 1;
      if (!hasTag(row, 'holiday_catchup')) return 1;
      const hint = row._weightHints?.holidayCatchup?.recommended;
      if (Number.isFinite(hint) && hint > 0 && hint <= 1) return hint;
      return 0.65;
    };
    return { enabled:true, fn };
  }

  let aiSummary = null;
  function updateAiSummaryAvailability(){
    try{ aiSummary?.updateAvailability(); }catch(_){ /* noop */ }
  }

  const diagnosticsFeature = createDiagnostics({
    getFlags: () => FLAGS,
    filterRowsForView,
    rowsForModelScope,
    getResidualWeighting,
    setHolidayDownweightEnabled,
    isHolidayDownweightEnabled,
    loadDismissedResiduals: () => loadDismissedResiduals(parseDismissReasonInput),
    saveDismissedResiduals,
    parseDismissReasonInput,
    rebuildAll,
    updateAiSummaryAvailability,
    inferBoxholderLabel,
    hasTag,
    summarizeHolidayCatchups,
    getCurrentLetterWeight: () => CURRENT_LETTER_WEIGHT,
    setCurrentLetterWeight: (value) => {
      CURRENT_LETTER_WEIGHT = value;
      try{ localStorage.setItem('routeStats.letterWeight', String(CURRENT_LETTER_WEIGHT)); }catch(_){ }
    },
    combinedVolume,
    routeAdjustedMinutes,
    colorForDelta,
    onDismissedChange: scheduleUserSettingsSave
  });

  const {
    buildDiagnostics,
    buildDayCompare,
    buildVolumeLeaderboard,
    fitVolumeTimeModel,
    getResidualModel,
    getLatestDiagnosticsContext,
    resetDiagnosticsCache
  } = diagnosticsFeature;

  const chartsFeature = createCharts({
    getFlags: () => FLAGS,
    filterRowsForView,
    vacGlyph,
    routeAdjustedHours,
    boxholderAdjMinutes,
    getLastNonEmptyWeek,
    buildDayCompare
  });

  const {
    buildCharts,
    buildMonthlyGlance,
    buildMixViz,
    buildOfficeCompare,
    buildQuickFilter
  } = chartsFeature;

// Supabase
const sb = createSupabaseClient();
try{ window.__sbClient = sb; }catch(_){ }

const authReadyPromise = handleAuthCallback(sb);

  authReadyPromise.then(session=>{
    if (session?.user){
      CURRENT_USER_ID = session.user.id;
      dAuth.textContent = 'Session';
      ensureUserSettingsSync();
    }
  }).catch(()=>{});

  // === Handle auth callbacks (incl. password recovery links) ===
  (async () => {
    const isRecoveryLink = /type=recovery/i.test(window.location.hash);
    if (!isRecoveryLink) return;
    const session = await authReadyPromise;
    if (!session) return;
    try {
      const p1 = prompt('Enter a new password (6+ characters)');
      if (p1 && p1.length >= 6) {
        const { error: uerr } = await sb.auth.updateUser({ password: p1 });
        if (uerr) alert('Update failed: ' + uerr.message);
        else alert('Password updated. You can now sign in normally.');
      } else {
        alert('Password must be at least 6 characters.');
      }
    } catch (e) {
      console.warn('Auth callback error', e);
    }
  })();

  // Connectivity + session bootstrap
  (async ()=>{ try{ await fetch(SUPABASE_URL,{mode:'no-cors'}); dConn.textContent='Connected'; }catch{ dConn.textContent='Error'; }})();
  (async function ensureSession(){
    const { data:{ session } } = await sb.auth.getSession();
    const hasSession = !!session;
    if (!hasSession){
      dAuth.textContent = 'No session';
      return;
    }
    const { data:{ user } } = await sb.auth.getUser();
    dAuth.textContent = user? 'Session' : 'No session';
    if (user){
      CURRENT_USER_ID = user.id;
      ensureUserSettingsSync();
    }
  })();

  // Magic link
  const linkBtn=$('linkBtn'), linkDlg=$('linkDlg'), sendLink=$('sendLink'), email=$('email');
  linkBtn.addEventListener('click', ()=> linkDlg.showModal());
  sendLink.addEventListener('click', async (e)=>{
    e.preventDefault();
    const redirectTo = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOtp({ email: email.value, options:{ emailRedirectTo: redirectTo } });
    if (error) alert(error.message); else { alert('Check your email for the magic link.'); linkDlg.close(); }
  });
  $('signOut').addEventListener('click', ()=> sb.auth.signOut().then(()=>location.reload()));

  // === Email + Password auth ===
  const signInBtn = $('signInBtn');
  const pwDlg     = $('pwDlg');
  const loginEmail= $('loginEmail');
  const loginPass = $('loginPass');
  const doLogin   = $('doLogin');
  const doSignup  = $('doSignup');
  const authMsg   = $('authMsg');

  signInBtn?.addEventListener('click', ()=> {
    authMsg.textContent = '';
    loginEmail.value = loginEmail.value || '';
    loginPass.value = '';
    pwDlg.showModal();
  });

  doLogin?.addEventListener('click', async (e)=>{
    e.preventDefault();
    authMsg.textContent = 'Signing in…';
    const { error } = await sb.auth.signInWithPassword({
      email: (loginEmail.value||'').trim(),
      password: loginPass.value||''
    });
    if (error) {
      if (/Email not confirmed/i.test(error.message)) authMsg.textContent = 'Email not confirmed. Use reset link or check your inbox.';
      else if (/Invalid login credentials/i.test(error.message)) authMsg.textContent = 'Invalid email or password. Try Reset or Create Account.';
      else authMsg.textContent = 'Error: ' + error.message;
      return;
    }
    authMsg.textContent = 'Signed in!';
    pwDlg.close();
    const rows = await fetchEntries();
    allRows = rows;
    rebuildAll();
  });

  doSignup?.addEventListener('click', async ()=>{
    authMsg.textContent = 'Creating account…';
    const { error } = await sb.auth.signUp({
      email: (loginEmail.value||'').trim(),
      password: loginPass.value||''
    });
    authMsg.textContent = error
      ? ('Error: ' + error.message)
      : 'Account created. If email confirmation is on, check your inbox, then Sign In.';
  });

  // === Set password for the CURRENT logged-in user ===
  const setPwBtn = $('setPwBtn');
  const setPwDlg = $('setPwDlg');
  const newPass  = $('newPass');
  const newPass2 = $('newPass2');
  const setPwMsg = $('setPwMsg');
  const doSetPw  = $('doSetPw');

  setPwBtn?.addEventListener('click', ()=> {
    setPwMsg.textContent = '';
    newPass.value = '';
    newPass2.value = '';
    setPwDlg.showModal();
  });

  doSetPw?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const p1 = newPass.value || '';
    const p2 = newPass2.value || '';
    if (p1.length < 6) { setPwMsg.textContent = 'Password must be at least 6 characters.'; return; }
    if (p1 !== p2)     { setPwMsg.textContent = 'Passwords do not match.'; return; }
    setPwMsg.textContent = 'Updating…';
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) { setPwMsg.textContent = 'Error: ' + error.message; return; }
    setPwMsg.textContent = 'Password set! You can now sign in anywhere.';
    setTimeout(()=> setPwDlg.close(), 600);
  });

  // === Settings dialog (Feature Flags) ===
  const settingsDlg = document.getElementById('settingsDlg');
  const btnSettings = document.getElementById('btnSettings');
  const modelScopeSelect = document.getElementById('modelScope');
  const themeSelect = document.getElementById('themeSelect');
  const flagWeekdayTicks = document.getElementById('flagWeekdayTicks');
  const flagProgressivePills = document.getElementById('flagProgressivePills');
  const flagMonthlyGlance = document.getElementById('flagMonthlyGlance');
  const flagHolidayAdjust = document.getElementById('flagHolidayAdjust');
  const flagTrendPills = document.getElementById('flagTrendPills');
  const flagSameRangeTotals = document.getElementById('flagSameRangeTotals');
  const flagHeadlineDigest = document.getElementById('flagHeadlineDigest');
  const flagMixViz = document.getElementById('flagMixViz');
  const flagBaselineCompare = document.getElementById('flagBaselineCompare');
  const flagQuickEntry = document.getElementById('flagQuickEntry');
  const flagSmartSummary = document.getElementById('flagSmartSummary');
  const flagDayCompare = document.getElementById('flagDayCompare');
  const flagUspsEval = document.getElementById('flagUspsEval');
  const flagSleepDrink = document.getElementById('flagSleepDrink');
  const settingsEmaRate = document.getElementById('settingsEmaRate');
  if (themeSelect){
    themeSelect.value = CURRENT_THEME;
  }
  // USPS Eval inputs
  const evalRouteId = document.getElementById('evalRouteId');
  const evalCode    = document.getElementById('evalCode');
  const evalBoxesIn = document.getElementById('evalBoxesIn');
  const evalStopsIn = document.getElementById('evalStopsIn');
  const evalHoursIn = document.getElementById('evalHoursIn');
  const evalOfficeHoursIn = document.getElementById('evalOfficeHoursIn');
  const evalSalaryIn = document.getElementById('evalSalaryIn');
  const evalWorkDaysYearIn = document.getElementById('evalWorkDaysYearIn');
  const evalProfileSelect = document.getElementById('evalProfileSelect');
  const evalProfileAddBtn = document.getElementById('evalProfileAdd');
  const evalProfileDeleteBtn = document.getElementById('evalProfileDelete');
  const evalProfileLabelInput = document.getElementById('evalProfileLabel');
  const evalEffectiveFromInput = document.getElementById('evalEffectiveFrom');
  const evalEffectiveToInput = document.getElementById('evalEffectiveTo');
  // Vacation mode inputs
  const vacFrom    = document.getElementById('vacFrom');
  const vacTo      = document.getElementById('vacTo');
  const vacAdd     = document.getElementById('vacAdd');
  const vacRangesEl= document.getElementById('vacRanges');
  const peakFrom = document.getElementById('peakFrom');
  const peakTo = document.getElementById('peakTo');
  const peakExclude = document.getElementById('peakExclude');
  const peakClear = document.getElementById('peakClear');
  const saveSettings = document.getElementById('saveSettings');
const settingsOpenAiKey = document.getElementById('settingsOpenAiKey');
const clearOpenAiKeyBtn = document.getElementById('clearOpenAiKey');

const aiSummaryCard = document.getElementById('aiSummaryCard');
const aiSummaryBtn = document.getElementById('generateAiSummary');
const toggleAiSummaryBtn = document.getElementById('toggleAiSummary');
const aiSummaryHint = document.getElementById('aiSummaryHint');
const aiSummaryStatus = document.getElementById('aiSummaryStatus');
const aiSummaryOutput = document.getElementById('aiSummaryOutput');
const aiSummaryContent = document.getElementById('aiSummaryContent');
const tokenUsageCard = document.getElementById('tokenUsageCard');
const tokenTodayEl = document.getElementById('token-today');
const tokenWeekEl = document.getElementById('token-week');
const tokenMonthEl = document.getElementById('token-month');
const tokenLimitEl = document.getElementById('token-limit');
const tokenBarFill = document.getElementById('token-bar-fill');
const tokenBarNote = document.getElementById('token-bar-note');
const tokenTodayInput = document.getElementById('tokenUsageToday');
const tokenWeekInput = document.getElementById('tokenUsageWeek');
const tokenMonthInput = document.getElementById('tokenUsageMonth');
const tokenLimitInput = document.getElementById('tokenUsageLimit');
const aiPromptTextarea = document.getElementById('aiSummaryBasePrompt');
const evalCompareCard = document.getElementById('evalCompareCard');
const evalWindowPrimary = document.getElementById('evalWindowPrimary');
const evalWindowRecent14 = document.getElementById('evalWindowRecent14');
const evalCompareToggle = document.getElementById('evalCompareToggle');
const evalCompareControls = document.getElementById('evalCompareControls');
const evalWindowCompare = document.getElementById('evalWindowCompare');
const evalCompareClose = document.getElementById('evalCompareClose');
const evalCompareSummary = document.getElementById('evalCompareSummary');
const evalSingleDashboard = document.getElementById('evalSingleDashboard');
const evalPrimaryDelta = document.getElementById('evalPrimaryDelta');
const evalPrimaryMeta = document.getElementById('evalPrimaryMeta');
const evalSingleGrid = document.getElementById('evalSingleGrid');
const evalCompareDashboard = document.getElementById('evalCompareDashboard');
const evalComparePrimaryDelta = document.getElementById('evalComparePrimaryDelta');
const evalComparePrimaryMeta = document.getElementById('evalComparePrimaryMeta');
const evalPaneA = document.getElementById('evalPaneA');
const evalPaneB = document.getElementById('evalPaneB');
const evalPaneDelta = document.getElementById('evalPaneDelta');
const evalCompareNarrative = document.getElementById('evalCompareNarrative');
const evalTrendList = document.getElementById('evalTrendList');
const yearlySummaryCard = document.getElementById('yearlySummaryCard');
const yearlySummaryYear = document.getElementById('yearlySummaryYear');
const yearlySummaryIncludePeak = document.getElementById('yearlySummaryIncludePeak');
const yearlySummaryStats = document.getElementById('yearlySummaryStats');
const parserCard = document.getElementById('parserCard');
const parserGranularity = document.getElementById('parserGranularity');
const parserCount = document.getElementById('parserCount');
const parserView = document.getElementById('parserView');
const parserIncludePeak = document.getElementById('parserIncludePeak');
const parserShowParcels = document.getElementById('parserShowParcels');
const parserShowLetters = document.getElementById('parserShowLetters');
const parserShowHours = document.getElementById('parserShowHours');
const parserShowEfficiency = document.getElementById('parserShowEfficiency');
const parserNote = document.getElementById('parserNote');
const parserChartCanvas = document.getElementById('parserChart');
const sleepDrinkCard = document.getElementById('sleepDrinkCard');
const sleepDrinkNote = document.getElementById('sleepDrinkNote');
const drinkWeekBadge = document.getElementById('drinkWeekBadge');
const drinkWeekMeta = document.getElementById('drinkWeekMeta');
const sleepWeekBadge = document.getElementById('sleepWeekBadge');
const sleepWeekMeta = document.getElementById('sleepWeekMeta');
const sleepRecentBadge = document.getElementById('sleepRecentBadge');
const sleepRecentMeta = document.getElementById('sleepRecentMeta');
const sleepTrendCanvas = document.getElementById('sleepTrendChart');
const sleepWeekdayCanvas = document.getElementById('sleepWeekdayChart');
const drinkWeekdayCanvas = document.getElementById('drinkWeekdayChart');
let CURRENT_USER_ID = null;
(async () => {
  try{
    const { data } = await sb.auth.getUser();
    CURRENT_USER_ID = data?.user?.id || null;
  }catch(_){ CURRENT_USER_ID = null; }
})();

aiSummary = createAiSummary({
  elements: {
    card: aiSummaryCard,
    button: aiSummaryBtn,
    toggleButton: toggleAiSummaryBtn,
    hint: aiSummaryHint,
    status: aiSummaryStatus,
    output: aiSummaryOutput,
    content: aiSummaryContent,
    tokenUsageCard,
    tokenTodayEl,
    tokenWeekEl,
    tokenMonthEl,
    tokenLimitEl,
    tokenBarFill,
    tokenBarNote,
    tokenTodayInput,
    tokenWeekInput,
    tokenMonthInput,
    tokenLimitInput
  },
  supabaseClient: sb,
  getCurrentUserId: () => CURRENT_USER_ID,
  getDiagnosticsContext: getLatestDiagnosticsContext,
  defaultPrompt: DEFAULT_AI_BASE_PROMPT,
  onTokenUsageChange: scheduleUserSettingsSave
});

  btnSettings?.addEventListener('click', ()=>{
    // populate from FLAGS
    flagWeekdayTicks.checked = !!FLAGS.weekdayTicks;
    flagProgressivePills.checked = !!FLAGS.progressivePills;
    if (modelScopeSelect) modelScopeSelect.value = getModelScope();
    if (flagMonthlyGlance) flagMonthlyGlance.checked = !!FLAGS.monthlyGlance;
    if (flagHolidayAdjust) flagHolidayAdjust.checked = !!FLAGS.holidayAdjustments;
    if (flagTrendPills) flagTrendPills.checked = !!FLAGS.trendPills;
    if (flagSameRangeTotals) flagSameRangeTotals.checked = !!FLAGS.sameRangeTotals;
    if (flagHeadlineDigest) flagHeadlineDigest.checked = !!FLAGS.headlineDigest;
    if (flagMixViz) flagMixViz.checked = !!FLAGS.mixViz;
    if (flagBaselineCompare) flagBaselineCompare.checked = !!FLAGS.baselineCompare;
    if (flagQuickEntry) flagQuickEntry.checked = !!FLAGS.quickEntry;
    if (flagSmartSummary) flagSmartSummary.checked = !!FLAGS.smartSummary;
    if (flagDayCompare) flagDayCompare.checked = !!FLAGS.dayCompare;
    if (flagUspsEval) flagUspsEval.checked = !!FLAGS.uspsEval;
    if (flagSleepDrink) flagSleepDrink.checked = !!FLAGS.sleepDrink;
    if (themeSelect) themeSelect.value = CURRENT_THEME;
    // populate USPS eval fields
    try{
      populateEvalProfileSelectUI(USPS_EVAL?.profileId);
    }catch(_){ }
    // populate Vacation Mode
    try{
      const v = VACATION || loadVacation();
      const last = (v.ranges||[])[(v.ranges||[]).length-1];
      if (vacFrom) vacFrom.value = last?.from || '';
      if (vacTo)   vacTo.value   = last?.to   || '';
    }catch(_){ }
    try{
      const p = PEAK_SEASON || loadPeakSeason();
      if (peakFrom) peakFrom.value = p?.from || '';
      if (peakTo) peakTo.value = p?.to || '';
      if (peakExclude) peakExclude.checked = !!p?.excludeFromModel;
    }catch(_){ }
    try{
      if (settingsEmaRate){
        const stored = localStorage.getItem(SECOND_TRIP_EMA_KEY);
        settingsEmaRate.value = stored != null ? stored : (secondTripEmaInput?.value || '');
      }
    }catch(_){ }
    if (settingsOpenAiKey){
      settingsOpenAiKey.value = getOpenAiKey() || '';
    }
    if (aiPromptTextarea){
      aiPromptTextarea.value = getAiBasePrompt(DEFAULT_AI_BASE_PROMPT);
      aiPromptTextarea.placeholder = DEFAULT_AI_BASE_PROMPT;
    }
    aiSummary.populateTokenInputs(loadTokenUsage());
    renderVacationRanges();
    settingsDlg.showModal();
  });

  peakClear?.addEventListener('click', ()=>{
    if (peakFrom) peakFrom.value = '';
    if (peakTo) peakTo.value = '';
    if (peakExclude) peakExclude.checked = false;
    PEAK_SEASON = { from: '', to: '', excludeFromModel: false };
    savePeakSeason(PEAK_SEASON);
    updateModelScopeBadge();
  });

  evalProfileSelect?.addEventListener('change', ()=>{
    const nextId = evalProfileSelect.value;
    applyEvalProfileToInputs(nextId);
    if (evalProfileDeleteBtn){
      evalProfileDeleteBtn.disabled = (EVAL_PROFILES?.length || 0) <= 1;
    }
  });

  evalProfileAddBtn?.addEventListener('click', ()=>{
    try{
      const base = getEvalProfileById(evalProfileSelect?.value) || USPS_EVAL || {};
      const newProfile = createEvalProfile({
        label: `Evaluation ${(EVAL_PROFILES?.length || 0) + 1}`,
        routeId: base.routeId || 'R1',
        evalCode: base.evalCode || '',
        boxes: base.boxes ?? null,
        stops: base.stops ?? null,
        hoursPerDay: base.hoursPerDay ?? null,
        officeHoursPerDay: base.officeHoursPerDay ?? null,
        annualSalary: base.annualSalary ?? null,
        evalDaysPerYear: base.evalDaysPerYear ?? null,
        effectiveFrom: null,
        effectiveTo: null
      });
      saveEval(newProfile);
      syncEvalGlobals();
      populateEvalProfileSelectUI(newProfile.profileId);
      applyEvalProfileToInputs(newProfile.profileId);
      buildEvalCompare(allRows || []);
      scheduleUserSettingsSave();
    }catch(_){ }
  });

  evalProfileDeleteBtn?.addEventListener('click', ()=>{
    const id = evalProfileSelect?.value;
    if (!id) return;
    if ((EVAL_PROFILES?.length || 0) <= 1){
      alert('At least one evaluation profile is required.');
      return;
    }
    if (!confirm('Delete this evaluation profile? You can recreate it later if needed.')) return;
    deleteEvalProfile(id);
    syncEvalGlobals();
    const fallbackId = USPS_EVAL?.profileId || (EVAL_PROFILES && EVAL_PROFILES[0]?.profileId) || null;
    populateEvalProfileSelectUI(fallbackId);
    applyEvalProfileToInputs(fallbackId);
    buildEvalCompare(allRows || []);
    scheduleUserSettingsSave();
  });

  saveSettings?.addEventListener('click', (e)=>{
    e.preventDefault();
    if (modelScopeSelect) setModelScope(modelScopeSelect.value);
    updateModelScopeBadge();
    FLAGS.weekdayTicks = !!flagWeekdayTicks.checked;
    FLAGS.progressivePills = !!flagProgressivePills.checked;
    if (flagMonthlyGlance) FLAGS.monthlyGlance = !!flagMonthlyGlance.checked;
    if (flagHolidayAdjust) FLAGS.holidayAdjustments = !!flagHolidayAdjust.checked;
    if (flagTrendPills) FLAGS.trendPills = !!flagTrendPills.checked;
    if (flagSameRangeTotals) FLAGS.sameRangeTotals = !!flagSameRangeTotals.checked;
    if (flagHeadlineDigest) FLAGS.headlineDigest = !!flagHeadlineDigest.checked;
    if (flagMixViz) FLAGS.mixViz = !!flagMixViz.checked;
    if (flagBaselineCompare) FLAGS.baselineCompare = !!flagBaselineCompare.checked;
    if (flagQuickEntry) FLAGS.quickEntry = !!flagQuickEntry.checked;
    if (flagSmartSummary) FLAGS.smartSummary = !!flagSmartSummary.checked;
    if (flagDayCompare) FLAGS.dayCompare = !!flagDayCompare.checked;
    if (flagUspsEval) FLAGS.uspsEval = !!flagUspsEval.checked;
    if (flagSleepDrink) FLAGS.sleepDrink = !!flagSleepDrink.checked;
    // read USPS eval fields
    try{
      const selectedId = evalProfileSelect?.value || USPS_EVAL?.profileId || null;
      const updated = collectEvalFormValues(selectedId);
      saveEval(updated);
      syncEvalGlobals();
      USPS_EVAL = getEvalProfileById(updated.profileId) || updated;
      populateEvalProfileSelectUI(USPS_EVAL?.profileId);
      if (!evalCompareState.activeId || evalCompareState.activeId === selectedId){
        evalCompareState.activeId = USPS_EVAL?.profileId || selectedId || evalCompareState.activeId;
      }
    }catch(_){ }
    // read Vacation Mode
    try{
      const f = vacFrom?.value;
      const t = vacTo?.value;
      if (f && t) addVacationRange(f, t);
      if (vacFrom) vacFrom.value = '';
      if (vacTo)   vacTo.value   = '';
    }catch(_){ }
    try{
      const from = peakFrom?.value || '';
      const to = peakTo?.value || '';
      const exclude = !!peakExclude?.checked;
      PEAK_SEASON = { from, to, excludeFromModel: exclude };
      savePeakSeason(PEAK_SEASON);
      updateModelScopeBadge();
    }catch(_){ }
    try{
      if (settingsEmaRate){
        const val = settingsEmaRate.value;
        if (val !== ''){
          const parsed = parseFloat(val);
          if (isFinite(parsed) && parsed >= 0){
            localStorage.setItem(SECOND_TRIP_EMA_KEY, String(parsed));
            if (secondTripEmaInput){ secondTripEmaInput.value = parsed; }
            try{ updateSecondTripSummary(); }catch(_){ }
          }
        }
        updateSecondTripSummary();
      }
    }catch(_){ }
    try{
      if (settingsOpenAiKey){
        const val = settingsOpenAiKey.value || '';
        setOpenAiKey(val);
      }
    }catch(_){ }
    try{
      if (aiPromptTextarea){
        setAiBasePrompt(aiPromptTextarea.value || '');
      }
    }catch(_){ }
    if (themeSelect){
      const chosenTheme = normalizeTheme(themeSelect.value);
      if (chosenTheme !== CURRENT_THEME){
        applyThemePreference(chosenTheme);
      }
      persistThemePreference(chosenTheme);
    }
    try{ aiSummary.readTokenInputs(); }catch(_){ }
    saveFlags(FLAGS);
    settingsDlg.close();
    renderVacationRanges();
    rebuildAll();
    renderUspsEvalTag();
    scheduleUserSettingsSave();

    applyTrendPillsVisibility();
    applyRecentEntriesAutoCollapse();
    aiSummary.updateAvailability();
    aiSummary.renderLastSummary();
  });

  evalWindowPrimary?.addEventListener('change', ()=>{
    const next = evalWindowPrimary.value;
    if (next) evalCompareState.activeId = next;
    const activeProfile = getEvalProfileById(evalCompareState.activeId);
    const priorProfiles = getPriorEvalProfiles(activeProfile);
    if (!priorProfiles.find(p => p.profileId === evalCompareState.compareId)){
      const previous = getPreviousEvalProfile(evalCompareState.activeId);
      evalCompareState.compareId = previous?.profileId || priorProfiles[priorProfiles.length - 1]?.profileId || null;
    }
    buildEvalCompare(allRows || []);
  });

  evalWindowRecent14?.addEventListener('change', ()=>{
    evalCompareState.last14 = !!evalWindowRecent14.checked;
    buildEvalCompare(allRows || []);
  });

  evalCompareToggle?.addEventListener('click', ()=>{
    const activeProfile = getEvalProfileById(evalCompareState.activeId);
    const priorProfiles = getPriorEvalProfiles(activeProfile);
    evalCompareState.compareEnabled = priorProfiles.length > 0;
    if (!evalCompareState.compareId || !priorProfiles.find(p => p.profileId === evalCompareState.compareId)){
      const previous = getPreviousEvalProfile(evalCompareState.activeId);
      evalCompareState.compareId = previous?.profileId || priorProfiles[priorProfiles.length - 1]?.profileId || null;
    }
    buildEvalCompare(allRows || []);
  });

  evalCompareClose?.addEventListener('click', ()=>{
    evalCompareState.compareEnabled = false;
    buildEvalCompare(allRows || []);
  });

  evalWindowCompare?.addEventListener('change', ()=>{
    if (evalWindowCompare.value) evalCompareState.compareId = evalWindowCompare.value;
    evalCompareState.compareEnabled = true;
    buildEvalCompare(allRows || []);
  });

  clearOpenAiKeyBtn?.addEventListener('click', ()=>{
    if (settingsOpenAiKey) settingsOpenAiKey.value = '';
    setOpenAiKey('');
    aiSummary.updateAvailability();
    if (aiSummaryStatus) aiSummaryStatus.textContent = 'OpenAI key cleared.';
  });

  aiSummaryBtn?.addEventListener('click', aiSummary.generateSummary);
  toggleAiSummaryBtn?.addEventListener('click', ()=>{
    aiSummary.toggleCollapsed();
  });
  aiSummary.updateAvailability();
  aiSummary.renderLastSummary();
  const initialTokenUsage = loadTokenUsage();
  aiSummary.updateTokenUsageCard(initialTokenUsage);
  aiSummary.populateTokenInputs(initialTokenUsage);

  vacAdd?.addEventListener('click', ()=>{
    try{
      const f = vacFrom?.value;
      const t = vacTo?.value;
      if (f && t){
        addVacationRange(f, t);
        if (vacFrom) vacFrom.value = '';
        if (vacTo)   vacTo.value   = '';
        renderVacationRanges();
        rebuildAll();
      }
    }catch(_){ }
  });

  vacRangesEl?.addEventListener('click', (event)=>{
    const target = event.target;
    if (!target || !target.matches('button.vac-remove[data-index]')) return;
    const idx = parseInt(target.getAttribute('data-index') || '', 10);
    if (!Number.isNaN(idx)){
      removeVacationRange(idx);
      renderVacationRanges();
      rebuildAll();
    }
  });

  // Force Refresh: update SW, clear caches, reload
  document.getElementById('forceRefreshBtn')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    try{
      try{ const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }catch(_){ }
      if ('serviceWorker' in navigator){
        const reg = await navigator.serviceWorker.getRegistration();
        try{ await reg?.update(); }catch(_){ }
        try{ reg?.waiting?.postMessage({ type:'SKIP_WAITING' }); }catch(_){ }
      }
    } finally {
      setTimeout(()=> location.reload(), 200);
    }
  });

  function applyTrendPillsVisibility(){
    const ids = ['tileAdvHours','tileAdvParcels','tileAdvLetters'];
    const show = !!(FLAGS && FLAGS.trendPills);
    ids.forEach(id=>{ const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; });
    const row = document.getElementById('trendPillsRow');
    if (row) row.style.display = show ? 'grid' : 'none';
  }

  // Always collapse Recent Entries by default; header click toggles open/close (independent of Collapsed UI flag)
  function applyRecentEntriesAutoCollapse(){
    try{
      const sec = document.getElementById('recentEntriesCard'); if (!sec) return;
      const headerEl = sec.firstElementChild; if (!headerEl) return;
      const KEY = 'routeStats.collapse.recentEntriesCard';
      const collapseBody = sec.querySelector(':scope > .__collapseBody');
      if (collapseBody) return;
      // Lightweight independent collapse for Recent Entries
      let body = sec.querySelector(':scope > .__rcBody');
      if (!body){
        body = document.createElement('div');
        body.className = '__rcBody';
        const toMove=[]; for(let i=1;i<sec.children.length;i++){ toMove.push(sec.children[i]); }
        toMove.forEach(ch=> body.appendChild(ch));
        sec.appendChild(body);
      }
      function setCollapsed(c){ body.style.display = c ? 'none' : ''; try{ localStorage.setItem(KEY, c?'1':'0'); }catch(_){ } }
      const saved = localStorage.getItem(KEY);
      const initial = (saved==null) ? true : (saved==='1');
      setCollapsed(initial);
      const toggle = ()=> setCollapsed(body.style.display!=='none'? true : false);
      headerEl.style.cursor='pointer';
      headerEl.addEventListener('click', (e)=>{ if (e.target.closest('button,a,input,select,textarea')) return; toggle(); });
      headerEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
    }catch(_){ /* ignore */ }
  }

  sb.auth.onAuthStateChange((_evt, session) => {
    const authed = !!session;
    CURRENT_USER_ID = authed ? session?.user?.id || null : null;
    const signOutBtn = $('signOut');
    if (signOutBtn) signOutBtn.style.display = authed ? 'inline-block' : 'none';
    dAuth.textContent = authed ? 'Session' : 'No session';
    if (authed){
      aiSummary.renderLastSummary();
      ensureUserSettingsSync();
    } else {
      userSettingsSynced = false;
      pendingSettingsPayload = null;
      if (settingsSaveTimer){
        clearTimeout(settingsSaveTimer);
        settingsSaveTimer = null;
      }
    }
  });

  sb.auth.getSession().then(({ data })=>{
    const session = data?.session || null;
    CURRENT_USER_ID = session?.user?.id || null;
    if (CURRENT_USER_ID){
      aiSummary.renderLastSummary();
      ensureUserSettingsSync();
    } else {
      userSettingsSynced = false;
    }
  }).catch(()=>{});

  // ====== APP LOGIC (unchanged beyond tiny UX tweaks) ======

  function routeEndTime(){ return ($('returnTime').value || $('end').value || ''); }

const date=$('date'), route=$('route'), start=$('start'), end=$('end'), departTime=$('departTime'), returnTime=$('returnTime');
const parcels=$('parcels'), misdeliveryInput=$('misdeliveryCount'), parcelHelperInput=$('parcelHelper'), flatsMinutesInput=$('flatsMinutes'), letters=$('letters'), miles=$('miles'), mood=$('mood'), notes=$('notes');
const sleepInput=$('sleepHours'), drinkInput=$('drinkFlag');
const secondTripMilesInput=$('secondTripMiles'), secondTripTimeInput=$('secondTripTime'), secondTripEmaInput=$('secondTripEma');
const breakMinutesInput=$('breakMinutes');
const secondTripPaidEl=$('secondTripPaid'), secondTripActualEl=$('secondTripActual'), secondTripReimburseEl=$('secondTripReimburse'), secondTripEmaRateEl=$('secondTripEmaRate');

function readStoredEma(){
  try{
    const saved = parseFloat(localStorage.getItem(SECOND_TRIP_EMA_KEY));
    if (isFinite(saved) && saved >= 0) return saved;
  }catch(_){ }
  return 0.98;
}

try{
  if (secondTripEmaInput){
    secondTripEmaInput.value = readStoredEma();
  }
}catch(_){ }
setSecondTripInputs(null);
if (breakMinutesInput) breakMinutesInput.value = '0';
if (parcelHelperInput) parcelHelperInput.value = '0';
if (misdeliveryInput) misdeliveryInput.value = '0';
if (flatsMinutesInput) flatsMinutesInput.value = '';
  const weather=$('weather'), temp=$('temp'), boxholders=$('boxholders'), holiday=$('holiday');
  const offDay=$('offDay');
  const officeH=$('officeH'), routeH=$('routeH'), totalH=$('totalH');
  const expEnd=$('expEnd'), expMeta=$('expMeta');
  const badgeVolume=$('badgeVolume'), badgeRouteEff=$('badgeRouteEff'), badgeOverall=$('badgeOverall');
  const dConnEl=$('dConn'), dAuthEl=$('dAuth'), dWriteEl=$('dWrite');

  badgeVolume.title   = 'Volume = parcels + w×letters (learned from data, rank vs recent, 0–10)';
  badgeRouteEff.title = 'Route Efficiency = today’s street hours vs typical for this weekday (0–10)';
  badgeOverall.title  = 'Overall = total hours vs expected (weekday avg)';

  date.value = todayStr();
  route.value = 'R1';

  function computeBreakdown(){
    const trip = getSecondTripInputs();
    const extraHours = trip.actualMinutes ? (trip.actualMinutes / 60) : 0;
    const extraPaidMinutes = trip.miles ? (trip.miles * 2) : 0;
    const breakMinutesVal = parseFloat(breakMinutesInput?.value || '0');
    const breakHours = (Number.isFinite(breakMinutesVal) && breakMinutesVal > 0) ? (breakMinutesVal / 60) : 0;
    if (offDay.checked){
      officeH.textContent='0.00';
      routeH.textContent='0.00';
      totalH.textContent='0.00';
      return 0;
    }
    const d=date.value; const s=start.value||'08:30';
    const off=diffHours(d, s, departTime.value);
    let rte  = diffHours(d, departTime.value, routeEndTime());
    if (rte==null && routeEndTime()){
      const span = diffHours(d, s, routeEndTime());
      if (span!=null && off!=null) rte = Math.max(0, +(span - off).toFixed(2));
    }
    const officeDisplay = (off!=null? off : 0) + extraHours;
    const routeDisplay = rte!=null ? Math.max(0, rte - breakHours) : null;
    const tot = Math.max(0, (off??0) + (rte??0) + extraHours - breakHours);
    officeH.textContent = (off!=null || extraHours) ? officeDisplay.toFixed(2) : '—';
    routeH.textContent  = routeDisplay!=null? routeDisplay.toFixed(2) : '—';
    totalH.textContent  = (off!=null||rte!=null||extraHours||breakHours) ? tot.toFixed(2) : '—';
    const diag=$('diag');
    if (diag){
      const extraTxt = extraHours ? ` · <b>Extra:</b> ${trip.actualMinutes.toFixed(0)}m (${extraPaidMinutes.toFixed(0)}m paid)` : '';
      const breakTxt = breakHours ? ` · <b>Break:</b> ${breakMinutesVal.toFixed(0)}m` : '';
      diag.innerHTML = `ROUTE STATS · Supabase: <b id="dConn">${dConn.textContent}</b> · Auth: <b id="dAuth">${dAuth.textContent}</b> · Write: <b id="dWrite">${dWrite.textContent}</b> · <b>Off:</b> ${off ?? '—'}h · <b>Route:</b> ${rte ?? '—'}h · <b>Total:</b> ${tot.toFixed(2)}h${extraTxt}`;
      if (breakTxt) diag.innerHTML += breakTxt;
    }
    return tot;
  }

  // Boxholder adjustment helpers (does not change stored times; used for efficiency metrics only)
  function parseBoxholdersValue(v){
    if (v == null || v === '') return 0;
    const raw = String(v).trim().toLowerCase();
    if (!raw) return 0;
    if (/none/.test(raw)) return 0;
    if (/light/.test(raw)) return 1;
    if (/medium/.test(raw)) return 2;
    if (/heavy/.test(raw)) return 3;
    const normalized = raw.replace(/×/g,'x').replace(/\s+/g,'');
    if (/^(x?1|1x)$/.test(normalized)) return 1;
    if (/^(x?2|2x)$/.test(normalized)) return 2;
    if (/^(x?3|3x)$/.test(normalized)) return 3;
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0){
      const rounded = Math.round(asNum);
      if (rounded >= 1 && rounded <= 3) return rounded;
    }
    return 0;
  }
  function boxholderAdjMinutes(valOrRow){
    const v = (valOrRow && typeof valOrRow==='object') ? valOrRow.boxholders : valOrRow;
    const n = parseBoxholdersValue(v);
    // Defaults: x1=+30min, x2=+45min (second adds +15), x3=+60min
    return n===1?30 : n===2?45 : n>=3?60 : 0;
  }
  // Consistent: route_minutes are stored in HOURS; adjust by subtracting boxholder minutes converted to hours
  function routeAdjustedHours(row){
    const baseH = (+row.route_minutes||0);
    const adjBox = boxholderAdjMinutes(row);
    const adjBreak = parseBreakMinutesFromRow(row);
    const adjH  = (adjBox + adjBreak) / 60;
    return Math.max(0, +(baseH - adjH).toFixed(2));
  }

  function formatBoxholderLabel(val){
    if (val == null || val === '') return '—';
    const parsed = parseBoxholdersValue(val);
    if (parsed > 0) return `${parsed}x`;
    const raw = String(val).trim().toLowerCase();
    if (/light/.test(raw)) return '1x';
    if (/medium/.test(raw)) return '2x';
    if (/heavy/.test(raw)) return '3x';
    return raw ? raw : '—';
  }

  function inferBoxholderLabel(row){
    if (!row) return '—';
    const direct = formatBoxholderLabel(row.boxholders);
    if (direct !== '—') return direct;
    const weatherStr = row.weather_json ? String(row.weather_json) : '';
    if (weatherStr){
      const weatherMatch = weatherStr.match(/Box:\s*([^·]+)/i);
      if (weatherMatch){
        const normalizedWeather = formatBoxholderLabel(weatherMatch[1].trim());
        if (normalizedWeather !== '—') return normalizedWeather;
      }
    }
    const textSources = [row.reason, row.notes, weatherStr]
      .filter(Boolean)
      .map(v=> String(v).toLowerCase());
    if (!textSources.length) return '—';
    const combined = textSources.join(' ');
    if (!/box/.test(combined)) return '—';
    const match = combined.match(/box(?:holder)?[^a-z0-9]*(light|medium|heavy|x\s*\d|\d\s*x|\d+x)/i);
    if (!match) return '—';
    const token = match[1] ? match[1] : match[0];
    return formatBoxholderLabel(token.replace(/\s+/g,''));
  }

  function roundVal(val, decimals=2){
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    const factor = Math.pow(10, decimals);
    return Math.round(n * factor) / factor;
  }

  function safeNumber(val){
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }

  // === Learned letter weight (OLS) ===
  let CURRENT_LETTER_WEIGHT = 0.33; // default; updated from data

  function __sum(arr, fn){ let s=0; for (const x of arr) s += +fn(x) || 0; return s; }
  function routeAdjustedMinutes(row){
    try{ if (typeof routeAdjustedHours === 'function'){ const h = routeAdjustedHours(row); return isFinite(h) ? h*60 : (+row.route_minutes||0); } }catch(_){ }
    return Math.max(0, (+row.route_minutes||0));
  }
  function computeLetterWeight(sampleRows){
    const rows = (sampleRows||[]).filter(r=> r && r.status !== 'off');
    const n = rows.length; if (!n) return null;
    const mp = __sum(rows, r=> +r.parcels||0) / n;
    const ml = __sum(rows, r=> +r.letters||0) / n;
    const my = __sum(rows, r=> routeAdjustedMinutes(r)) / n;
    let Cpp=0, Cll=0, Cpl=0, Cpy=0, Cly=0;
    for (const r of rows){
      const p=(+r.parcels||0)-mp, l=(+r.letters||0)-ml, y=routeAdjustedMinutes(r)-my;
      Cpp+=p*p; Cll+=l*l; Cpl+=p*l; Cpy+=p*y; Cly+=l*y;
    }
    const det = (Cpp*Cll - Cpl*Cpl);
    if (!isFinite(det) || Math.abs(det) < 1e-6) return null;
    const bp = ( Cpy*Cll - Cpl*Cly ) / det; // minutes per parcel
    const bl = ( Cpp*Cly - Cpl*Cpy ) / det; // minutes per letter
    if (!isFinite(bp) || Math.abs(bp) < 1e-6) return null;
    let w = bl / bp; if (!isFinite(w) || w < 0) w = 0; if (w > 1.5) w = 1.5; // guardrails
    return w;
  }
  function updateCurrentLetterWeight(allRows){
    try{
      const worked = (allRows||[]).filter(r=> r && r.status !== 'off' && ((+r.parcels||0)+(+r.letters||0) > 0))
                                   .sort((a,b)=> a.work_date < b.work_date ? -1 : 1);
      const scoped = rowsForModelScope(worked);
      const w = computeLetterWeight(scoped);
      if (w!=null) CURRENT_LETTER_WEIGHT = +(0.7*CURRENT_LETTER_WEIGHT + 0.3*w).toFixed(4);
      try{ localStorage.setItem('routeStats.letterWeight', String(CURRENT_LETTER_WEIGHT)); }catch(_){ }
    }catch(_){ /* keep default */ }
  }
  (function loadSavedLetterWeight(){
    try{ const v = parseFloat(localStorage.getItem('routeStats.letterWeight')); if (isFinite(v) && v>0) CURRENT_LETTER_WEIGHT = v; }catch(_){ }
  })();

  function combinedVolume(p, l, w){
    const W = (w==null) ? CURRENT_LETTER_WEIGHT : w; return safeNumber(p) + W * safeNumber(l);
  }

  function computeVolume(parcels, letters){
    // All volume uses the current learned weight
    return combinedVolume(parcels, letters);
  }

  function extractReasonTag(weatherStr){
    if (!weatherStr) return null;
    const match = /Reason:\s*([^·]+)/i.exec(String(weatherStr));
    return match ? match[1].trim() : null;
  }

  function colorForDelta(pct){
    if (pct == null) return { fg:'var(--muted)', bg:'transparent', bc:'var(--border)' };
    if (!FLAGS || !FLAGS.progressivePills) {
      return { fg: pct >= 0 ? 'var(--good)' : 'var(--bad)', bg:'transparent', bc:'transparent' };
    }
    const clamp = Math.max(-60, Math.min(60, pct));
    const t = Math.abs(clamp)/60;
    const green = ['#A8E6A3','#4CAF50','#087F23'];
    const red   = ['#F7A6A6','#F44336','#B71C1C'];
    const step = (t < 0.17) ? 0 : (t < 0.42 ? 1 : 2);
    const fg = clamp >= 0 ? green[step] : red[step];
    return { fg, bg:'transparent', bc:'transparent' };
  }

  const {
    getLetterWeightForSummary,
    buildSmartSummary,
    buildTrendingFactors,
    buildHeavinessToday,
    buildWeekHeaviness,
    buildHeadlineDigest
  } = createSummariesFeature({
    getFlags: () => FLAGS,
    filterRowsForView,
    routeAdjustedHours,
    computeLetterWeight,
    getCurrentLetterWeight: () => CURRENT_LETTER_WEIGHT,
    colorForDelta
  });

  // === Diagnostics model & outliers ===
  function setNow(el){ el.value=hhmmNow(); computeBreakdown(); }
  $('btnStartNow').addEventListener('click',()=>{ if(!start.value) setNow(start); });
  $('btnStreetNow').addEventListener('click',()=> setNow(departTime));
  $('btnClockNow').addEventListener('click',()=>{ setNow(end); if(!returnTime.value){ returnTime.value = end.value; } });
  $('btnStartNow2').addEventListener('click',()=> setNow(start));
  $('btnStreetNow2').addEventListener('click',()=> setNow(departTime));
  $('btnReturnNow').addEventListener('click',()=> setNow(returnTime));
  $('btnClockNow2').addEventListener('click',()=>{ setNow(end); if(!returnTime.value){ returnTime.value = end.value; } });

  offDay.addEventListener('change', ()=>{ if(offDay.checked){ end.value=hhmmNow(); parcels.value=letters.value=miles.value=0; if(misdeliveryInput) misdeliveryInput.value='0'; if(flatsMinutesInput) flatsMinutesInput.value=''; mood.value='🛑 off'; computeBreakdown(); }});
;[date,start,departTime,returnTime,end,parcels,misdeliveryInput,letters,miles,offDay,weather,temp,boxholders,flatsMinutesInput].forEach(el=> el?.addEventListener('input', computeBreakdown));
secondTripMilesInput?.addEventListener('input', updateSecondTripSummary);
secondTripTimeInput?.addEventListener('input', updateSecondTripSummary);
secondTripEmaInput?.addEventListener('input', updateSecondTripSummary);

  document.addEventListener('keydown', (e)=>{
    const mod = e.metaKey || e.ctrlKey; if(!mod) return; const k = e.key.toLowerCase();
    if(k==='s'){ e.preventDefault(); $('save')?.click(); }
    else if(k==='d'){ e.preventDefault(); $('btnEditLast')?.click(); }
    else if(e.key==='Backspace'){ e.preventDefault(); $('btnDeleteDay')?.click(); }
  });

  function weatherString(){
    const parts=[]; if(weather?.value) parts.push(weather.value); if(temp?.value) parts.push(`${temp.value}°F`); if(boxholders?.value) parts.push(`Box: ${boxholders.value}`); if (holiday?.checked) parts.push('Holiday'); if (reasonTag?.value) parts.push(`Reason: ${reasonTag.value}`);
    const breakVal = parseFloat(breakMinutesInput?.value || '0'); if (Number.isFinite(breakVal) && breakVal > 0) parts.push(`Break:${breakVal}`);
    const st = getSecondTripPayload();
    if (st){ parts.push(`SecondTrip:${JSON.stringify(st)}`); }
    const helperParcels = readHelperParcelsInput();
    if (helperParcels > 0){
      parts.push(`HelperParcels:${helperParcels}`);
    }
    const misdeliveryCount = readMisdeliveryInput();
    if (misdeliveryCount > 0){
      parts.push(`Misdelivery:${misdeliveryCount}`);
    }
    const flatsMinutes = readFlatsMinutesInput();
    if (flatsMinutes != null){
      parts.push(`FlatsTime:${flatsMinutes}`);
    }
    const sleepValRaw = sleepInput?.value;
    const sleepVal = sleepValRaw === '' || sleepValRaw == null ? null : Number(sleepValRaw);
    if (sleepVal != null && Number.isFinite(sleepVal) && sleepVal >= 0){
      parts.push(`Sleep:${sleepVal}`);
    }
    const drinkVal = drinkInput?.value || '';
    if (drinkVal){
      parts.push(`Drink:${drinkVal}`);
    }
    return parts.length? parts.join(' · ') : null;
  }

  function collectPayload(userId){
    const d=date.value; const s=start.value||'08:30';
    const offRaw = diffHours(d, s, departTime.value);
    let rteRaw   = diffHours(d, departTime.value, routeEndTime());
    if (rteRaw==null && routeEndTime()){
      const span = diffHours(d, s, routeEndTime());
      if (span!=null && offRaw!=null) rteRaw = Math.max(0, +(span - offRaw).toFixed(2));
    }
    const trip = getSecondTripInputs();
    const extraHours = trip.actualMinutes ? (trip.actualMinutes / 60) : 0;
    const breakMinutesVal = parseFloat(breakMinutesInput?.value || '0');
    const breakHours = (Number.isFinite(breakMinutesVal) && breakMinutesVal>0) ? (breakMinutesVal / 60) : 0;
    const off = offDay.checked ? 0 : offRaw;
    const rte = offDay.checked ? 0 : rteRaw;
    const tot = offDay.checked ? 0 : Math.max(0, ((off??0)+(rte??0)+extraHours - breakHours));
    const officeForStore = offDay.checked ? 0 : (offRaw!=null ? +(offRaw + extraHours).toFixed(2) : (extraHours ? +extraHours.toFixed(2) : null));
    return {
      user_id:userId,
      work_date:d,
      route:'R1',
      start_time:   offDay.checked ? null : (s||null),
      end_time:     offDay.checked ? null : (end.value || null),
      hours:        offDay.checked ? 0 : (tot||null),
      parcels:      offDay.checked ? 0 : (+parcels.value||0),
      letters:      offDay.checked ? 0 : (+letters.value||0),
      miles:        offDay.checked ? 0 : (+miles.value||0),
      mood:         offDay.checked ? '🛑 off' : (mood.value||null),
      notes:        notes.value||null,
      status:       offDay.checked ? 'off' : 'worked',
      office_start: s||null,
      depart_time:  departTime.value||null,
      return_time:  returnTime.value||null,
      office_minutes: offDay.checked ? 0 : officeForStore,
      route_minutes:  offDay.checked ? 0 : (rteRaw!=null? +rteRaw.toFixed(2): null),
      weather_json: weatherString()
    };
  }

  function fillForm(r){
    start.value       = r.start_time || '08:30';
    end.value         = r.end_time   || '';
    departTime.value  = r.depart_time || '';
    returnTime.value  = r.return_time || '';
    parcels.value     = r.parcels || 0;
    letters.value     = r.letters || 0;
    miles.value       = r.miles   || 0;
    mood.value        = r.mood    || '';
    notes.value       = r.notes   || '';
    offDay.checked    = (r.status === 'off');

    const raw = r.weather_json || '';
    if (!raw){
      if(temp) temp.value='';
      if(boxholders) boxholders.value='';
      if(holiday) holiday.checked=false;
      weather.value='';
      const reasonTag = document.getElementById('reasonTag'); if (reasonTag) reasonTag.value = '';
      setSecondTripInputs(null);
      if (breakMinutesInput) breakMinutesInput.value = '0';
      if (parcelHelperInput) parcelHelperInput.value = '0';
      if (misdeliveryInput) misdeliveryInput.value = String(Number(r?.misdelivery_count || 0) || 0);
      if (flatsMinutesInput) {
        const flatsMinutes = Number.isFinite(Number(r?.flats_minutes))
          ? Math.max(0, Math.round(Number(r.flats_minutes)))
          : parseFlatsMinutesFromWeatherString(r?.weather_json || '');
        flatsMinutesInput.value = flatsMinutes == null ? '' : String(flatsMinutes);
      }
      if (sleepInput) sleepInput.value = '';
      if (drinkInput) drinkInput.value = '';
    } else {
      const parts = String(raw).split('·').map(s=>s.trim());
      let w='', t='', b=''; let hol=false; let rsn=''; let stData=null; let brk=null; let helperParcels=''; let misdeliveryVal=''; let flatsMinutesVal=''; let sleepVal=''; let drinkVal='';
      for (const p of parts){
        if (/°F$/.test(p)) t = p.replace('°F','').trim();
        else if (/^Box:/i.test(p)) b = p.split(':').slice(1).join(':').trim();
        else if (/^Reason:/i.test(p)) rsn = p.split(':').slice(1).join(':').trim();
        else if (/^SecondTrip:/i.test(p)) {
          try{ stData = JSON.parse(p.split(':').slice(1).join(':')); }catch(_){ stData=null; }
        }
        else if (/^Break:/i.test(p)){
          const val = parseFloat(p.split(':').slice(1).join(':'));
          brk = Number.isFinite(val) && val>=0 ? val : null;
        }
        else if (/^HelperParcels:/i.test(p)){
          helperParcels = p.split(':').slice(1).join(':').trim();
        }
        else if (/^Misdelivery:/i.test(p)){
          misdeliveryVal = p.split(':').slice(1).join(':').trim();
        }
        else if (/^FlatsTime:/i.test(p)){
          flatsMinutesVal = p.split(':').slice(1).join(':').trim();
        }
        else if (/^Sleep:/i.test(p)){
          sleepVal = p.split(':').slice(1).join(':').trim();
        }
        else if (/^Drink:/i.test(p)){
          drinkVal = p.split(':').slice(1).join(':').trim();
        }
        else if (/^Holiday$/i.test(p)) hol = true;
        else w = p;
      }
      weather.value = w || '';
      if (temp) temp.value = t || '';
      if (boxholders) boxholders.value = b || '';
      if (holiday) holiday.checked = !!hol;
      const reasonTag = document.getElementById('reasonTag'); if (reasonTag) reasonTag.value = rsn || '';
      setSecondTripInputs(stData);
      if (breakMinutesInput) breakMinutesInput.value = brk!=null ? String(brk) : '0';
      if (parcelHelperInput) parcelHelperInput.value = helperParcels || '0';
      if (misdeliveryInput){
        const parsed = parseFloat(misdeliveryVal);
        if (Number.isFinite(parsed) && parsed >= 0) misdeliveryInput.value = String(Math.round(parsed));
        else misdeliveryInput.value = String(Number(r?.misdelivery_count || 0) || 0);
      }
      if (flatsMinutesInput){
        const parsed = parseFloat(flatsMinutesVal);
        if (Number.isFinite(parsed) && parsed >= 0) flatsMinutesInput.value = String(Math.round(parsed));
        else {
          const fromRow = Number(r?.flats_minutes);
          flatsMinutesInput.value = Number.isFinite(fromRow) && fromRow >= 0 ? String(Math.round(fromRow)) : '';
        }
      }
      if (sleepInput) sleepInput.value = sleepVal || '';
      if (drinkInput) drinkInput.value = drinkVal || '';
    }
    try { computeBreakdown(); } catch(_){}
  }

  let editingKey = null; let lastDeleted = null; const btnUndoDelete = $('btnUndoDelete');
  function showUndo(show){ if(!btnUndoDelete) return; btnUndoDelete.style.display = show ? 'inline-block' : 'none'; }

const searchBox = $('searchBox'); let allRows = [];
function applySearch(rows){
    const q = (searchBox.value||'').trim().toLowerCase(); if(!q) return rows;
    return rows.filter(r=>{
      const fields=[ r.work_date, r.status, r.mood, r.weather_json, r.notes, String(r.parcels||''), String(r.letters||''), String(r.miles||''), String(r.misdelivery_count||''), String(r.flats_minutes||'') ];
      return fields.some(v=> String(v||'').toLowerCase().includes(q));
    });
  }

function getSecondTripInputs(){
  if (!secondTripMilesInput) return { miles:0, actualMinutes:0, ema:0.98 };
  const miles = parseFloat(secondTripMilesInput.value || '');
  const actual = parseInt(secondTripTimeInput.value || '');
  const emaRaw = secondTripEmaInput ? parseFloat(secondTripEmaInput.value || '') : NaN;
  const ema = isFinite(emaRaw) && emaRaw >= 0 ? emaRaw : readStoredEma();
  if (secondTripEmaInput && (!isFinite(emaRaw) || emaRaw < 0)) {
    secondTripEmaInput.value = ema;
  }
  return {
    miles: isFinite(miles) && miles >= 0 ? miles : 0,
    actualMinutes: isFinite(actual) && actual >= 0 ? actual : 0,
    ema
  };
}

function getSecondTripPayload(){
  const { miles, actualMinutes, ema } = getSecondTripInputs();
  if (!(miles > 0 || actualMinutes > 0)) return null;
  return {
    m: +miles.toFixed(2),
    t: actualMinutes,
    e: +ema.toFixed(2)
  };
}

function readHelperParcelsInput(){
  if (!parcelHelperInput) return 0;
  const val = parseFloat(parcelHelperInput.value || '');
  if (!Number.isFinite(val) || val <= 0) return 0;
  return val;
}

function readMisdeliveryInput(){
  if (!misdeliveryInput) return 0;
  const val = parseFloat(misdeliveryInput.value || '');
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.max(0, Math.round(val));
}

function readFlatsMinutesInput(){
  if (!flatsMinutesInput) return null;
  const raw = String(flatsMinutesInput.value ?? '').trim();
  if (raw === '') return null;
  const val = parseFloat(raw);
  if (!Number.isFinite(val) || val < 0) return null;
  return Math.max(0, Math.round(val));
}

function updateSecondTripSummary(){
  if (!secondTripMilesInput) return;
  const { miles, actualMinutes, ema } = getSecondTripInputs();
  const paidMinutes = miles * 2;
  const gas = miles * ema;
  if (secondTripPaidEl) secondTripPaidEl.textContent = paidMinutes.toFixed(0);
  if (secondTripActualEl) secondTripActualEl.textContent = actualMinutes.toFixed(0);
  if (secondTripReimburseEl) secondTripReimburseEl.textContent = gas.toFixed(2);
  if (secondTripEmaRateEl) secondTripEmaRateEl.textContent = ema.toFixed(2);
  // Persist user EMA preference
  try{ if (ema>0) localStorage.setItem(SECOND_TRIP_EMA_KEY, String(ema)); }catch(_){ }
  scheduleUserSettingsSave();
  try{ computeBreakdown(); }catch(_){ }
}

function setSecondTripInputs(data){
  if (!secondTripMilesInput) return;
  const obj = data || { m:'', t:'', e:readStoredEma() };
  secondTripMilesInput.value = obj.m!=null && obj.m!=='' ? obj.m : '';
  secondTripTimeInput.value  = obj.t!=null && obj.t!=='' ? obj.t : '';
  if (secondTripEmaInput){
    const emaVal = obj.e!=null && obj.e!=='' ? obj.e : readStoredEma();
    secondTripEmaInput.value = emaVal;
  }
  updateSecondTripSummary();
}

function parseSecondTripFromRow(row){
  if (!row || !row.weather_json) return null;
  const part = row.weather_json.split('·').map(s=> s.trim()).find(p => /^SecondTrip:/i.test(p));
  if (!part) return null;
  try{ return JSON.parse(part.split(':').slice(1).join(':')); }catch(_){ return null; }
}

function parseBreakMinutesFromRow(row){
  if (!row || !row.weather_json) return 0;
  try{
    const part = row.weather_json.split('·').map(s=> s.trim()).find(p => /^Break:/i.test(p));
    if (!part) return 0;
    const val = parseFloat(part.split(':').slice(1).join(':'));
    return Number.isFinite(val) && val > 0 ? val : 0;
  }catch(_){ return 0; }
}

function parseHelperParcelsFromWeatherString(weatherStr){
  if (!weatherStr) return 0;
  try{
    const part = String(weatherStr).split('·').map(s => s.trim()).find(p => /^HelperParcels:/i.test(p));
    if (!part) return 0;
    const raw = part.split(':').slice(1).join(':').trim();
    const val = parseFloat(raw);
    return Number.isFinite(val) && val > 0 ? val : 0;
  }catch(_){
    return 0;
  }
}

function parseMisdeliveryFromWeatherString(weatherStr){
  if (!weatherStr) return 0;
  try{
    const part = String(weatherStr).split('·').map(s => s.trim()).find(p => /^Misdelivery:/i.test(p));
    if (!part) return 0;
    const raw = part.split(':').slice(1).join(':').trim();
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return Math.max(0, Math.round(val));
  }catch(_){
    return 0;
  }
}

function parseFlatsMinutesFromWeatherString(weatherStr){
  if (!weatherStr) return null;
  try{
    const part = String(weatherStr).split('·').map(s => s.trim()).find(p => /^FlatsTime:/i.test(p));
    if (!part) return null;
    const raw = part.split(':').slice(1).join(':').trim();
    const val = parseFloat(raw);
    if (!Number.isFinite(val) || val < 0) return null;
    return Math.max(0, Math.round(val));
  }catch(_){
    return null;
  }
}

function parseSleepFromWeatherString(weatherStr){
  if (!weatherStr) return null;
  try{
    const part = String(weatherStr).split('·').map(s => s.trim()).find(p => /^Sleep:/i.test(p));
    if (!part) return null;
    const raw = part.split(':').slice(1).join(':').trim();
    const val = parseFloat(raw);
    return Number.isFinite(val) ? val : null;
  }catch(_){
    return null;
  }
}

function parseDrinkFromWeatherString(weatherStr){
  if (!weatherStr) return null;
  try{
    const part = String(weatherStr).split('·').map(s => s.trim()).find(p => /^Drink:/i.test(p));
    if (!part) return null;
    const raw = part.split(':').slice(1).join(':').trim().toUpperCase();
    if (raw === 'D' || raw === 'ND') return raw;
    return null;
  }catch(_){
    return null;
  }
}

function readTagHistoryForIso(iso){
  if (!iso) return [];
  try{
    const raw = localStorage.getItem('routeStats.tagHistory');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const entry = parsed.find(item => item && (item.iso === iso || item.date === iso));
    if (!entry) return [];
    if (Array.isArray(entry.tags)) return entry.tags.filter(Boolean);
    return [];
  }catch(_){
    return [];
  }
}

function buildForecastSnapshotFromPayload(payload, userId){
  if (!payload || !payload.work_date) return null;
  if (payload.status === 'off') return null;
  const iso = payload.work_date;
  const dt = DateTime.fromISO(iso, { zone: ZONE });
  const weekday = dt.isValid ? (dt.weekday % 7) : (new Date(iso)).getDay();
  const hours = Number(payload.hours);
  const officeHours = Number(payload.office_minutes);
  const snapshot = {
    iso,
    weekday,
    totalTime: Number.isFinite(hours) ? Math.round(hours * 60) : null,
    officeTime: Number.isFinite(officeHours) ? Math.round(officeHours * 60) : null,
    endTime: payload.end_time || payload.return_time || null,
    tags: readTagHistoryForIso(iso),
    user_id: userId || null
  };
  return snapshot;
}

async function persistForecastSnapshot(payload, userId){
  try{
    const snapshot = buildForecastSnapshotFromPayload(payload, userId);
    if (!snapshot) return;
    await saveForecastSnapshot(snapshot, { supabaseClient: sb, silent: true });
  }catch(err){
    console.warn('[Forecast] unable to save snapshot', err);
  }
}

function getHourlyRateFromEval(){
  try{
    const cfg = USPS_EVAL || loadEval();
    if (!cfg || cfg.annualSalary==null || cfg.hoursPerDay==null) return null;
    const weeklyPay = cfg.annualSalary / 52;
    const hoursPerWeek = Math.max(0, (cfg.hoursPerDay||0) * 5);
    if (!hoursPerWeek) return null;
    return weeklyPay / hoursPerWeek;
  }catch(_){ return null; }
}


  function rebuildAll(){
    const rows = allRows || [];
    const rawRows = rows;
    const normalRows = rows.filter(r => r && r.status !== 'off');

    window.__rawRows = rawRows;
    window.allRows = rows;
    window.__holidayCatchupStats = summarizeHolidayCatchups(rawRows);
    recomputeYearlyStats(rawRows);
    updateCurrentLetterWeight(normalRows);
    renderTable(applySearch(rawRows));
    buildCharts(rawRows);
    buildSnapshot(rawRows);
    buildMonthlyGlance(rawRows);
    buildQuickFilter(rawRows);
    buildMixViz(rawRows);
    buildHeadlineDigest(rawRows);
    buildSmartSummary(rawRows);
    buildTrendingFactors(rawRows);
    buildOfficeCompare(rawRows);
    buildDayCompare(rawRows);
    buildHeavinessToday(rawRows);
    buildWeekHeaviness(rawRows);
    buildUspsTiles(rawRows);
    buildEvalCompare(rawRows);
    buildDiagnostics(normalRows);
    buildVolumeLeaderboard(rawRows);
    renderYearlyBadges();
    initParserControls();
    buildYearlySummary(rawRows);
    buildParserChart(rawRows);
    buildSleepDrinkChart(rawRows);
  }

  async function loadByDate(){
    editingKey = null; const { data:{ user } } = await sb.auth.getUser(); if(!user) return; const d=date.value; if(!d) return;
    const { data, error } = await sb.from('entries').select('*').eq('user_id', user.id).eq('work_date', d).limit(1).maybeSingle();
    if (error && error.code !== 'PGRST116') { console.error(error); return; }
    const saveBtn=$('save'); saveBtn.classList.remove('ghost');
    if (data) { editingKey = { user_id:user.id, work_date:d }; fillForm(data); saveBtn.textContent='Update'; }
    else { saveBtn.textContent='Save'; }
  }
  date.addEventListener('change', loadByDate);

  (function replaceSave(){
    const btn=$('save'); const clone=btn.cloneNode(true); btn.parentNode.replaceChild(clone,btn);
    clone.addEventListener('click', async ()=>{
      const { data:{ user } } = await sb.auth.getUser(); if (!user) { alert('No session. Try Link devices or refresh.'); return; }
      const helperParcels = readHelperParcelsInput();
      const payload = collectPayload(user.id); let error;
      try{
        // Guard against duplicates: replace all rows for this user/date with a single fresh payload
        const { data: existing, error: findErr } = await sb
          .from('entries').select('work_date', { count: 'exact', head: false })
          .eq('user_id', user.id).eq('work_date', payload.work_date);
        if (findErr) console.warn('find existing failed', findErr);
        const exists = Array.isArray(existing) && existing.length > 0;
        if (exists){
          const { error: delErr } = await sb.from('entries').delete().eq('user_id', user.id).eq('work_date', payload.work_date);
          if (delErr) { error = delErr; throw delErr; }
          const { error: insErr } = await sb.from('entries').insert(payload);
          if (insErr) { error = insErr; throw insErr; }
        } else {
          const { error: insErr } = await sb.from('entries').insert(payload);
          if (insErr) { error = insErr; throw insErr; }
        }
      }catch(e){ error = e; }
      dWrite.textContent = error ? 'Failed' : 'OK'; if (error){ alert(error.message); return; }
      updateYearlyTotals({ ...payload, date: payload.work_date, parcels: (payload.parcels || 0) + helperParcels });
      renderYearlyBadges();
      await persistForecastSnapshot(payload, user.id);
      clone.textContent = 'Update'; clone.disabled = true; clone.classList.add('saving','savedFlash');
      setTimeout(()=>{ clone.disabled=false; clone.classList.remove('saving'); }, 400); setTimeout(()=> clone.classList.remove('savedFlash'), 700);
      const rows = await fetchEntries();
      allRows = rows;
      rebuildAll();
      renderTomorrowForecast();
      editingKey = { user_id:user.id, work_date:date.value }; clone.classList.remove('ghost');
    });
  })();

  $('btnEditLast')?.addEventListener('click', async ()=>{
    const rows = await fetchEntries(); if(!rows.length){ alert('No entries yet.'); return; }
    const latest = rows[0]; $('date').value = latest.work_date; await loadByDate(); window.scrollTo({ top:0, behavior:'smooth' });
  });

  $('btnDeleteDay')?.addEventListener('click', async ()=>{
    const { data:{ user } } = await sb.auth.getUser(); if(!user){ alert('No session. Try Link devices.'); return; }
    const d = $('date').value; if(!d){ alert('Pick a date first.'); return; }
    const { data: rowToDelete, error: fetchErr } = await sb.from('entries').select('*').eq('user_id',user.id).eq('work_date',d).maybeSingle();
    if(fetchErr && fetchErr.code!=='PGRST116'){ alert(fetchErr.message); return; }
    if(!rowToDelete){ alert('No entry exists for this date.'); return; }
    if(!confirm(`Delete your entry for ${d}? This cannot be undone (unless you press Undo).`)) return;
    const { error } = await sb.from('entries').delete().eq('user_id',user.id).eq('work_date',d); if(error){ alert(error.message); return; }
    lastDeleted = rowToDelete; showUndo(true);
    $('notes').value=''; parcels.value=0; if(parcelHelperInput) parcelHelperInput.value='0'; if(misdeliveryInput) misdeliveryInput.value='0'; if(flatsMinutesInput) flatsMinutesInput.value=''; letters.value=0; miles.value=53; offDay.checked=false; start.value='08:30'; end.value=''; departTime.value=''; returnTime.value=''; mood.value=''; weather.value=''; if(temp) temp.value=''; if(boxholders) boxholders.value=''; if(sleepInput) sleepInput.value=''; if(drinkInput) drinkInput.value=''; computeBreakdown();
    const rows = await fetchEntries();
    allRows = rows;
    rebuildAll();
    alert(`Deleted ${d}. You can Undo now.`);
  });

  btnUndoDelete?.addEventListener('click', async ()=>{
    if(!lastDeleted){ showUndo(false); return; }
    dWrite.textContent='—'; const { error } = await sb.from('entries').insert(lastDeleted);
    if(error){ alert('Undo failed: '+error.message); return; }
    const rows = await fetchEntries();
    allRows = rows;
    rebuildAll();
    alert(`Restored ${lastDeleted.work_date}.`); $('date').value = lastDeleted.work_date; await loadByDate(); lastDeleted=null; showUndo(false);
  });

  async function fetchEntries(){
    const { data:{ user } } = await sb.auth.getUser(); if(!user) return [];
    const { data, error } = await sb.from('entries').select('*').eq('user_id',user.id).order('work_date',{ascending:false}).limit(365);
    if(error){ console.error(error); return []; }
    return applyHelperParcels(ensurePostHolidayTags(dedupeEntriesByDate(data || [])));
  }

  function dedupeEntriesByDate(rows){
    const byDate = new Map();
    const scoreRow = (row) => {
      let score = 0;
      if (row?.status === 'worked') score += 2;
      if (row?.start_time) score += 1;
      if (row?.depart_time) score += 1;
      if (row?.end_time) score += 1;
      if (row?.return_time) score += 1;
      if (Number(row?.hours) > 0) score += 2;
      if (Number(row?.parcels) > 0) score += 1;
      if (Number(row?.letters) > 0) score += 1;
      return score;
    };
    const rowStamp = (row) => {
      const t = Date.parse(row?.updated_at || row?.created_at || '');
      return Number.isFinite(t) ? t : 0;
    };
    for (const row of rows || []){
      const key = row?.work_date;
      if (!key) continue;
      const prev = byDate.get(key);
      if (!prev){
        byDate.set(key, row);
        continue;
      }
      const prevStamp = rowStamp(prev);
      const nextStamp = rowStamp(row);
      if (nextStamp !== prevStamp){
        byDate.set(key, nextStamp > prevStamp ? row : prev);
        continue;
      }
      byDate.set(key, scoreRow(row) >= scoreRow(prev) ? row : prev);
    }
    return [...byDate.values()].sort((a,b)=> a.work_date < b.work_date ? 1 : -1);
  }

  function applyHelperParcels(rows){
    return (rows || []).map(row=>{
      const helper = parseHelperParcelsFromWeatherString(row.weather_json || '');
      const misdelivery = Number.isFinite(Number(row?.misdelivery_count))
        ? Math.max(0, Math.round(Number(row.misdelivery_count)))
        : parseMisdeliveryFromWeatherString(row.weather_json || '');
      const flatsMinutes = Number.isFinite(Number(row?.flats_minutes))
        ? Math.max(0, Math.round(Number(row.flats_minutes)))
        : parseFlatsMinutesFromWeatherString(row.weather_json || '');
      const base = Number(row.parcels) || 0;
      return {
        ...row,
        misdelivery_count: misdelivery,
        flats_minutes: flatsMinutes,
        parcels_helper: helper,
        parcels_base: base,
        parcels: base + helper
      };
    });
  }

  function classifyRow(total, avg){ if(total==null||avg==null) return ''; const diff=(total-avg)/avg; if(diff<=-0.15) return 'light'; if(diff>=0.15) return 'heavy'; return 'typical'; }

  function renderTable(rows){
    rows = rows || [];
    const tbody=document.querySelector('#tbl tbody'); tbody.innerHTML='';
    resetDiagnosticsCache();
    const model = getResidualModel(rows);
    const byDow=Array.from({length:7},()=>[]);
    rows.forEach(r=>{ if(r.status==='off') return; const h=Number(r.hours||0); const d=dowIndex(r.work_date); if(h>0) byDow[d].push(h); });
    const avgByDow=byDow.map(list=> list.length? (list.reduce((a,b)=>a+b,0)/list.length) : null);

    for(const r of rows){
      const tot=Number(r.hours||0)||null;
      const offH=(r.office_minutes!=null)? Number(r.office_minutes).toFixed(2):'';
      const rteH=(r.route_minutes!=null)? Number(r.route_minutes).toFixed(2):'';

      // NEW: weekday shorthand + moon phase
      const dObj = DateTime.fromISO(r.work_date, { zone: ZONE });
      const dowShort = dObj.toFormat('ccc').charAt(0); // M, T, W, T, F, S, S
      const moon = moonPhaseEmoji(r.work_date);

      const d=dowIndex(r.work_date);
      const avg=avgByDow[d];
      const cls=classifyRow(tot,avg);

      const tr=document.createElement('tr');
      tr.classList.add('rowLink');
      if(cls) tr.classList.add(cls);
      tr.dataset.date=r.work_date;
      tr.tabIndex=0;

      tr.innerHTML = `<td>${r.work_date}${vacMark(r.work_date)} (${dowShort}) ${moon}</td><td>R1</td><td>${r.status||'worked'}</td>
        <td class="right">${offH}</td><td class="right">${rteH}</td><td class="right">${tot!=null? tot.toFixed(2):''}</td>
        <td class="right">${r.parcels||0}</td><td class="right">${r.letters||0}</td><td class="right">${r.miles||0}</td>
        <td>${r.weather_json||''}</td><td></td>`;
      tbody.appendChild(tr);
  }
}

  function renderYearlyBadges(){
    const container = document.getElementById('milestoneBadges');
    const toggleBtn = document.getElementById('milestoneHistoryToggle');
    const historyContainer = document.getElementById('milestoneHistory');
    if (!container) return;
    try{
      const year = new Date().getFullYear();
      const badges = getStored('routeStats.badges', []) || [];
      const totals = getStored('routeStats.yearlyTotals', {}) || {};
      const thresholds = Object.entries(YEARLY_THRESHOLDS || {});
      if (!thresholds.length){
        container.innerHTML = '<p class="muted">Milestones coming soon.</p>';
        return;
      }
      const markup = thresholds.map(([id, { label, key, threshold }])=>{
        const unlocked = badges.find(b => b && b.id === id && b.year === year);
        const progressRaw = totals?.[year]?.[key];
        const progressVal = Number(progressRaw);
        const progress = Number.isFinite(progressVal) ? progressVal : 0;
        const status = unlocked ? 'unlocked' : 'locked';
        const metricTitle = key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
        const progressDisplay = Math.max(0, progress).toLocaleString();
        const infoBlock = unlocked
          ? `<div class="badge-info"><h4>${label}</h4><p>${unlocked.message}</p></div>`
          : '';
        return `<div class="badge-card ${status}">
  <div class="badge-count">
    ${progressDisplay}
    <small>${metricTitle}</small>
  </div>
  ${infoBlock}
</div>`;
      }).join('');
      container.innerHTML = markup || '<p class="muted">No milestones defined.</p>';

      const historyYears = Object.keys(totals)
        .map(y => Number(y))
        .filter(y => y && y !== year)
        .sort((a,b) => b - a);

      if (toggleBtn){
        toggleBtn.style.display = historyYears.length ? '' : 'none';
        toggleBtn.textContent = showMilestoneHistory ? 'Hide previous years' : 'Show previous years';
        toggleBtn.onclick = ()=>{
          showMilestoneHistory = !showMilestoneHistory;
          renderYearlyBadges();
        };
      }

      if (historyContainer){
        if (!showMilestoneHistory || !historyYears.length){
          historyContainer.style.display = 'none';
          historyContainer.innerHTML = '';
        } else {
          const historyMarkup = historyYears.map(y => {
            const stats = totals[y] || { parcels:0, letters:0, hours:0 };
            const entries = Object.entries(YEARLY_THRESHOLDS).map(([id, { label, key, threshold }]) => {
              const value = Number(stats[key]) || 0;
              const unlocked = badges.find(b => b && b.id === id && b.year === y);
              const metricTitle = key.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
              const remaining = Math.max(0, (threshold || 0) - value);
              const statusCls = unlocked ? 'achieved' : '';
              const note = unlocked
                ? unlocked.message
                : (threshold ? `${remaining.toLocaleString()} to go (goal ${threshold.toLocaleString()})` : '');
              const labelBlock = unlocked ? `<div class="badge-history-note">${note}</div>` : (note ? `<div class="badge-history-note">${note}</div>` : '');
              return `<div class="badge-history-item ${statusCls}">
  <span class="badge-history-value">${Math.max(0, value).toLocaleString()}</span>
  <small>${metricTitle}</small>
  ${unlocked ? `<div class="badge-history-name">${label}</div>` : ''}
  ${labelBlock}
</div>`;
            }).join('');
            return `<div class="badge-history-year">
  <h5>${y}</h5>
  <div class="badge-history-grid">${entries}</div>
</div>`;
          }).join('');
          historyContainer.innerHTML = historyMarkup;
          historyContainer.style.display = '';
        }
      }
    }catch(err){
      console.warn('renderYearlyBadges error', err);
      container.innerHTML = '<p class="muted">Unable to load milestones.</p>';
      if (historyContainer) historyContainer.style.display = 'none';
      if (toggleBtn) toggleBtn.style.display = 'none';
    }
  }

  // Dynamic version tag with today's date (for exports)
  const VERSION_TAG = (function(){ try{ return 'v' + DateTime.now().setZone(ZONE).toFormat('yyyy-MM-dd'); }catch(_){ return 'v-current'; } })();
  function toCsv(rows){
    const headers=['work_date','route','status','start_time','depart_time','return_time','end_time','hours','office_minutes','route_minutes','parcels','letters','miles','misdelivery_count','flats_minutes','mood','notes','weather_json','created_at'];
    const lines=[headers.join(',')];
    for(const r of rows){
      const vals=headers.map(h=>{
        let v;
        if(h==='route') v='R1';
        else if (h === 'misdelivery_count') {
          const fromRow = Number(r?.misdelivery_count);
          v = Number.isFinite(fromRow) ? Math.max(0, Math.round(fromRow)) : parseMisdeliveryFromWeatherString(r?.weather_json || '');
        } else if (h === 'flats_minutes') {
          const fromRow = Number(r?.flats_minutes);
          const parsed = Number.isFinite(fromRow) && fromRow >= 0 ? Math.round(fromRow) : parseFlatsMinutesFromWeatherString(r?.weather_json || '');
          v = (parsed == null ? '' : parsed);
        } else v=r[h];
        if(v==null) return '';
        const s=String(v).replace(/"/g,'""');
        return /[",\n]/.test(s)? '"'+s+'"': s;
      });
      lines.push(vals.join(','));
    }
    return lines.join('\n');
  }

  $('exportCsv').addEventListener('click', async ()=>{ const rows = allRows.length? allRows : await fetchEntries(); const blob=new Blob([toCsv(rows)],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`route-stats-all_${VERSION_TAG}.csv`; a.click(); });
  $('exportCsvFiltered').addEventListener('click', async ()=>{ const rows = applySearch(allRows.length? allRows : await fetchEntries()); const blob=new Blob([toCsv(rows)],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`route-stats-filtered_${VERSION_TAG}.csv`; a.click(); });

  const showUidBtn=$('showUid');
  showUidBtn?.addEventListener('click', async ()=>{ const { data:{ user } } = await sb.auth.getUser(); if(!user){ alert('No session. Use Link devices.'); return; } alert(`Current user id (account key):\n${user.id}\n\nEntries are filtered by this id.`); });

  const importFile=$('importFile'); $('importCsv')?.addEventListener('click', ()=> importFile.click());
  importFile?.addEventListener('change', async ()=>{
    const file=importFile.files?.[0]; if(!file) return; const text=await file.text();
    const lines=text.split(/\r?\n/).filter(Boolean); if(lines.length<2){ alert('CSV is empty'); return; }
    const headers=lines[0].split(',').map(h=> h.trim().replace(/^"|"$/g,'')); const idx=(n)=> headers.indexOf(n);
    const splitCsv=(row)=> row.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/); const unq=(v)=> (/^".*"$/.test(v)? v.slice(1,-1).replace(/""/g,'"') : v);
    const { data:{ user } } = await sb.auth.getUser(); if(!user){ alert('No session. Use Link devices.'); return; }
    const rows=[]; for(let i=1;i<lines.length;i++){ const cols=splitCsv(lines[i]); const get=(name)=> unq(cols[idx(name)] ?? ''); const misRaw = +(get('misdelivery_count')||0); const misCount = Number.isFinite(misRaw) && misRaw > 0 ? Math.round(misRaw) : 0; const flatsRaw = +(get('flats_minutes')||0); const flatsMinutes = Number.isFinite(flatsRaw) && flatsRaw >= 0 ? Math.round(flatsRaw) : null; let weatherJson = get('weather_json')||null; if (misCount > 0 && !/Misdelivery:/i.test(String(weatherJson||''))) weatherJson = weatherJson ? `${weatherJson} · Misdelivery:${misCount}` : `Misdelivery:${misCount}`; if (flatsMinutes != null && !/FlatsTime:/i.test(String(weatherJson||''))) weatherJson = weatherJson ? `${weatherJson} · FlatsTime:${flatsMinutes}` : `FlatsTime:${flatsMinutes}`; const r={ user_id:user.id, work_date:get('work_date'), route:'R1', status:get('status')||'worked', start_time:get('start_time')||null, depart_time:get('depart_time')||null, return_time:get('return_time')||null, end_time:get('end_time')||null, hours:+(get('hours')||0)||null, office_minutes:get('office_minutes')||null, route_minutes:get('route_minutes')||null, parcels:+(get('parcels')||0)||0, letters:+(get('letters')||0)||0, miles:+(get('miles')||0)||0, mood:get('mood')||null, notes:get('notes')||null, weather_json:weatherJson }; if(r.work_date) rows.push(r); }
    if(!rows.length){ alert('No rows detected'); return; }
    const chunk=200; for(let i=0;i<rows.length;i+=chunk){ const slice=rows.slice(i,i+chunk); const { error } = await sb.from('entries').insert(slice); if(error){ alert('Import failed: '+error.message); return; } }
    const fresh = await fetchEntries();
    allRows = fresh;
    rebuildAll();
    alert(`Imported ${rows.length} rows into this account.`);
  });


  function hhmmFrom(baseDateStr, hours){ if(hours==null) return '—'; const d=DateTime.fromISO(baseDateStr,{zone:ZONE}).set({hour:8,minute:0}); return d.plus({hours}).toFormat('h:mm a'); }

  function buildSnapshot(rows){
    rows = filterRowsForView(rows||[]);
    const today=DateTime.now().setZone(ZONE);
    const dow=today.weekday%7; // 0=Sun
    const workRows=rows.filter(r=>r.status!=='off');

    // Baselines by DOW for expected end
    const byDow=Array.from({length:7},()=>({h:0,c:0}));
    for(const r of workRows){ const h=Number(r.hours||0); if(h>0){ const d=dowIndex(r.work_date); byDow[d].h+=h; byDow[d].c++; } }
    const avgH=byDow.map(x=> x.c? x.h/x.c : null); const todayAvgH=avgH[dow];
    expEnd.textContent = todayAvgH? hhmmFrom(today.toISODate(), todayAvgH) : '—';
    expMeta.textContent = `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]} avg ${todayAvgH? todayAvgH.toFixed(2)+'h':'—'}`;
    // Enable click-to-toggle help on snapshot tiles (once)
    (function enableTileHelp(){
      try{
        const pairs = [
          { id:'badgeVolume', help:'helpVolume' },
          { id:'badgeRouteEff', help:'helpRouteEff' },
          { id:'badgeOverall', help:'helpOverall' },
        ];
        pairs.forEach(p => {
          const badge = document.getElementById(p.id);
          const help = document.getElementById(p.help);
          const tile = badge?.closest('.stat');
          if (!badge || !help || !tile) return;
          if (tile.dataset.helpReady) return; // attach once
          tile.dataset.helpReady = '1';
          tile.style.cursor = 'pointer';
          tile.setAttribute('tabindex','0');
          const toggle = ()=>{ help.style.display = (help.style.display==='none'||!help.style.display)? 'block':'none'; };
          tile.addEventListener('click', (e)=>{
            // ignore clicks on links/buttons inside
            if (e.target.closest('button,a,input,select,textarea')) return;
            toggle();
          });
          tile.addEventListener('keydown', (e)=>{ if (e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
        });
      }catch(_){ }
    })();

    // Badges (volume, route eff, overall) — align with leaderboard (all worked days, learned letter weight)
    const letterW = CURRENT_LETTER_WEIGHT || 0.33;
    const volMetric = (r)=> combinedVolume(r.parcels||0, r.letters||0, letterW);
    const vols = workRows.map(volMetric);
    const v = vols.length? volMetric(workRows[0]||{}):0;
    const rank = (arr,x)=>{
      const s=[...arr].sort((a,b)=>a-b);
      let idx = s.findIndex(n=> x <= n);
      if (idx < 0) idx = s.length - 1;
      return (idx + 1) / s.length;
    };
    const volScore10 = vols.length? Math.round(rank(vols,v)*10) : null;
    if (volScore10==null) badgeVolume.textContent = '—'; else badgeVolume.textContent = `${volScore10}/10`;
    try{
    if (vols.length){
        const s=[...vols].sort((a,b)=>a-b); const min=s[0], max=s[s.length-1];
        const mid = Math.floor(s.length/2); const med = s.length%2? s[mid] : (s[mid-1]+s[mid])/2;
        const pct = Math.round(rank(vols,v)*100);
        const volTip = `Volume today: ${v.toFixed(1)} (parcels + ${letterW.toFixed(2)}×letters)\nScore: ${volScore10}/10 ≈ ${pct}th percentile of ${vols.length} worked day(s)\nRange: min ${min.toFixed(1)} • median ${med.toFixed(1)} • max ${max.toFixed(1)}`;
        badgeVolume.title = volTip;
        try{ const tile = badgeVolume.closest('.stat'); if (tile) tile.title = volTip; }catch(_){ }
        const hv = document.getElementById('helpVolume');
        if (hv) hv.textContent = `Rank (all-time): ${volScore10}/10 (~${pct}th percentile). Today ${v.toFixed(1)}; min ${min.toFixed(1)}, median ${med.toFixed(1)}, max ${max.toFixed(1)}.`;
      }
    }catch(_){ }
    const rhs = workRows
      .filter(r=> dowIndex(r.work_date)===dow)
      .map(r=> routeAdjustedHours(r))
      .filter(n=>n>0);
    const rteAvg = rhs.length? (rhs.reduce((a,b)=>a+b,0)/rhs.length) : null;
    const todayRoute = workRows[0]? routeAdjustedHours(workRows[0]) : null;
    const rteScore = (rteAvg && todayRoute!=null && rteAvg>0)? Math.max(0, Math.min(10, Math.round((1 - (todayRoute - rteAvg)/Math.max(1,rteAvg))*10))) : 0;
    badgeRouteEff.textContent = `${rteScore}/10`;
    try{
      const deltaPct = (rteAvg && todayRoute!=null && rteAvg>0)? Math.round(((todayRoute - rteAvg)/rteAvg)*100) : null;
      const adjNote = `adjusted −${boxholderAdjMinutes(workRows[0])||0}m (≈${(boxholderAdjMinutes(workRows[0])||0)/60}h) for boxholders`;
      badgeRouteEff.title = `Route minutes (adjusted): ${todayRoute!=null?Math.round(todayRoute):'—'} vs weekday avg ${rteAvg!=null?Math.round(rteAvg):'—'}\nΔ vs avg: ${deltaPct==null?'—':(deltaPct>=0?('+'+deltaPct):('−'+Math.abs(deltaPct)))}%\nScore: ${rteScore}/10 (higher is better)\nNote: ${adjNote}`;
      const hr = document.getElementById('helpRouteEff');
      if (hr){
        hr.innerHTML = `Adjusted route min vs weekday avg.<br>Today ${todayRoute!=null?Math.round(todayRoute):'—'} vs avg ${rteAvg!=null?Math.round(rteAvg):'—'}. Score ${rteScore}/10.
          <br><button id=\"linkRouteEffDetails\" class=\"ghost btn-compact\" type=\"button\">Open Weekly Compare</button>`;
        setTimeout(()=>{
          const btn = document.getElementById('linkRouteEffDetails');
          if (btn){ btn.onclick = (e)=>{ e.preventDefault(); try{ document.getElementById('mixVizCard')?.scrollIntoView({ behavior:'smooth', block:'start' }); }catch(_){ } }; }
        },0);
      }
    }catch(_){ }
    const totToday = workRows[0]? (+workRows[0].hours||0) : 0; const exp = todayAvgH || 0; const overallScore = exp>0? Math.max(0, Math.min(10, Math.round((1 - (totToday - exp)/Math.max(1,exp))*10))) : 0; badgeOverall.textContent = `${overallScore}/10`;
    try{
      const deltaPctTot = exp>0? Math.round(((totToday - exp)/exp)*100) : null;
      badgeOverall.title = `Total hours: ${totToday.toFixed(2)} vs expected ${exp?exp.toFixed(2):'—'} (weekday avg)\nΔ vs expected: ${deltaPctTot==null?'—':(deltaPctTot>=0?('+'+deltaPctTot):('−'+Math.abs(deltaPctTot)))}%\nScore: ${overallScore}/10 (higher is better)`;
      const ho = document.getElementById('helpOverall');
      if (ho) ho.textContent = `Total hours vs weekday expected. Today ${totToday.toFixed(2)}h vs exp ${exp?exp.toFixed(2)+'h':'—'}. Score ${overallScore}/10.`;
    }catch(_){ }

    const todayRow = workRows[0] || null;
    const tripRaw = todayRow ? parseSecondTripFromRow(todayRow) : null;
    const evalHourly = getHourlyRateFromEval();
    let extraTrip = null;
    if (tripRaw){
      const miles = Math.max(0, +tripRaw.m || 0);
      const actual = Math.max(0, +tripRaw.t || 0);
      const emaRaw = (tripRaw.e!=null && tripRaw.e!=='') ? +tripRaw.e : NaN;
      const emaVal = Number.isFinite(emaRaw) && emaRaw >= 0 ? emaRaw : readStoredEma();
      if ((miles > 0) || (actual > 0)){
        const paidMinutes = miles * 2;
        const gas = miles * emaVal;
        const timePay = evalHourly!=null ? (paidMinutes/60) * evalHourly : null;
        const payout = gas + (timePay || 0);
        extraTrip = {
          miles,
          actual,
          ema: emaVal,
          paidMinutes,
          gas,
          timePay,
          payout
        };
      }
    }

    try{
      const tile = document.getElementById('extraTripTodayTile');
      const valEl = document.getElementById('extraTripTodayVal');
      const metaEl = document.getElementById('extraTripTodayMeta');
      if (tile && valEl && metaEl){
        if (!extraTrip){
          tile.style.display = 'none';
        } else {
          tile.style.display = '';
          valEl.textContent = `$${extraTrip.payout.toFixed(2)}`;
          const metaParts = [];
          metaParts.push(`${extraTrip.miles.toFixed(1)} mi`);
          metaParts.push(`Paid ${extraTrip.paidMinutes.toFixed(0)}m`);
          if (extraTrip.actual > 0) metaParts.push(`Actual ${extraTrip.actual.toFixed(0)}m`);
          metaParts.push(`Gas $${extraTrip.gas.toFixed(2)}`);
          if (extraTrip.timePay != null) metaParts.push(`Time $${extraTrip.timePay.toFixed(2)}`);
          metaEl.textContent = metaParts.join(' · ');
          tile.title = `Miles ${extraTrip.miles.toFixed(2)} · Paid ${extraTrip.paidMinutes.toFixed(0)}m · Actual ${extraTrip.actual.toFixed(0)}m · EMA $${extraTrip.ema.toFixed(2)}/mi`;
        }
      }
    }catch(_){ }

    try{
      const tile = document.getElementById('todayHourlyTile');
      const valEl = document.getElementById('todayHourlyRate');
      const metaEl = document.getElementById('todayHourlyMeta');
      if (tile && valEl && metaEl){
        if (evalHourly == null || !(totToday > 0)){
          tile.style.display = 'none';
        } else {
          const basePay = evalHourly * totToday;
          const extraPay = extraTrip ? extraTrip.payout : 0;
          const runRate = (basePay + extraPay) / Math.max(totToday, 0.01);
          tile.style.display = '';
          valEl.textContent = `$${runRate.toFixed(2)}`;
          const metaParts = [`Base $${basePay.toFixed(2)}`];
          if (extraPay > 0){
            metaParts.push(`Extra $${extraPay.toFixed(2)}`);
          }
          metaParts.push(`${totToday.toFixed(2)}h`);
          metaEl.textContent = metaParts.join(' · ');
          const lines = [`Base pay (est.): $${basePay.toFixed(2)} for ${totToday.toFixed(2)}h (@ $${evalHourly.toFixed(2)}/h)`];
          if (extraTrip){
            const timeLine = extraTrip.timePay != null ? `Time $${extraTrip.timePay.toFixed(2)}` : null;
            const extras = [`Gas $${extraTrip.gas.toFixed(2)}`];
            if (timeLine) extras.push(timeLine);
            lines.push(`Extra trip payout: $${extraTrip.payout.toFixed(2)} (${extras.join(' + ')})`);
          }
          tile.title = lines.join('\n');
        }
      }
    }catch(_){ }

    // ===== Weekly tiles (Monday-based) =====
    const weekStart = startOfWeekMonday(today);
    const weekEnd   = today.endOf('day');
    const prevWeekStart = startOfWeekMonday(today.minus({weeks:1}));
    const prevWeekEnd   = endOfWeekSunday(today.minus({weeks:1}));
    const priorWeekStart = startOfWeekMonday(today.minus({weeks:2}));
    const priorWeekEnd   = endOfWeekSunday(today.minus({weeks:2}));

    const inRange=(r,from,to)=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); return d>=from && d<=to; };
    const sum=(arr,fn)=>arr.reduce((t,x)=>t+(fn(x)||0),0);

    const thisW = workRows.filter(r=> inRange(r,weekStart,weekEnd));
    const lastW = workRows.filter(r=> inRange(r,prevWeekStart,prevWeekEnd));
    const priorW= workRows.filter(r=> inRange(r,priorWeekStart,priorWeekEnd));

    const daysWorked = arr=> arr.filter(r=> (r.hours||0)>0).length;
    const dThis = daysWorked(thisW), dLast = daysWorked(lastW), dPrior = daysWorked(priorW);

    const hThis=sum(thisW,r=>+r.hours||0), pThis=sum(thisW,r=>+r.parcels||0), lThis=sum(thisW,r=>+r.letters||0);
    const hLast=sum(lastW,r=>+r.hours||0), pLast=sum(lastW,r=>+r.parcels||0), lLast=sum(lastW,r=>+r.letters||0);

    // Show live totals as "thisWeek / lastWeek"
    $('wkHours').textContent   = `${(hThis||0).toFixed(2)} / ${(hLast||0).toFixed(2)}`;
    $('wkParcels').textContent = `${pThis||0} / ${pLast||0}`;
    $('wkLetters').textContent = `${lThis||0} / ${lLast||0}`;

    // Carry-forward percentage = last full week's % vs prior week (per-worked-day averages)
    const avgOrNull=(tot,days)=> days? tot/days : null;
    const pct=(a,b)=> (a==null||b==null||b===0)? null : ((a-b)/b)*100;

    const hCarry = pct(avgOrNull(hLast,dLast), avgOrNull(sum(priorW,r=>+r.hours||0), dPrior));
    const pCarry = pct(avgOrNull(pLast,dLast), avgOrNull(sum(priorW,r=>+r.parcels||0), dPrior));
    const lCarry = pct(avgOrNull(lLast,dLast), avgOrNull(sum(priorW,r=>+r.letters||0), dPrior));

    // ===== Advanced Weekly Metrics (Phase 1) =====
    // Day-by-day comparison Mon..today vs same weekday last week,
    // then compute weighted average and cumulative impact (percent).
    const dayIndexToday = (today.weekday + 6) % 7; // Mon=0..Sun=6

    // Build arrays for this week and last week by weekday index (Mon..Sun)
    const toWeekArray = (from, to) => {
      const out = Array.from({ length: 7 }, () => ({ h: 0, p: 0, l: 0 }));
      const inRange = (r) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };
      workRows.filter(inRange).forEach(r => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        const idx = (d.weekday + 6) % 7; // Mon=0
        const h = +r.hours || 0;
        const p = +r.parcels || 0;
        const l = +r.letters || 0;
        out[idx].h += h; out[idx].p += p; out[idx].l += l;
      });
      return out;
    };
    const thisWeek = toWeekArray(weekStart, weekEnd);
    const lastWeek = toWeekArray(prevWeekStart, prevWeekEnd);

    // Holiday adjustment detection: if Monday of this week is an explicit off day,
    // treat Tuesday's baseline as (Mon+Tue of last week). Controlled by flag.
    const holidayAdjEnabled = !!(FLAGS && FLAGS.holidayAdjustments);
    // Detect holiday off-days within current week. If found, adjust the NEXT day's baseline
    const carryNext = new Set();
    if (holidayAdjEnabled) {
      try{
        const inWeek = (r)=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); return d>=weekStart && d<=weekEnd; };
        const isHolidayMarked = (r)=> /(^|\\b)Holiday(\\b|$)/i.test(String(r.weather_json||''));
        rows.filter(r=> r.status==='off' && inWeek(r) && isHolidayMarked(r)).forEach(r=>{
          const d=DateTime.fromISO(r.work_date,{zone:ZONE}); const idx=(d.weekday+6)%7; if (idx<6) carryNext.add(idx+1);
        });
      }catch(_){ /* ignore */ }
    }

    // Off-day detection for current week (so we don't show -100% on off days)
    const offIdxThisWeek = new Set(rows
      .filter(r => r.status === 'off' && inRange(r, weekStart, weekEnd))
      .map(r => (DateTime.fromISO(r.work_date, { zone: ZONE }).weekday + 6) % 7));

    const normalizedTotals = (key)=>{
      let curTotal = 0;
      let baseTotal = 0;
      for (let i = 0; i <= dayIndexToday && i < 7; i++){
        if (offIdxThisWeek.has(i)) continue; // skip days not worked this week
        const curVal = thisWeek[i]?.[key] || 0;
        let baseVal = lastWeek[i]?.[key] || 0;
        if (holidayAdjEnabled && carryNext && carryNext.has(i)){
          baseVal = (lastWeek[i-1]?.[key] || 0) + (lastWeek[i]?.[key] || 0);
        }
        curTotal += curVal || 0;
        baseTotal += baseVal || 0;
      }
      return { cur: curTotal, base: baseTotal };
    };

    const normHours = normalizedTotals('h');
    const normParcels = normalizedTotals('p');
    const normLetters = normalizedTotals('l');

    // Current-week target % vs last week, normalized by matched day counts
    const hTarget = pct(normHours.cur, normHours.base);
    const pTarget = pct(normParcels.cur, normParcels.base);
    const lTarget = pct(normLetters.cur, normLetters.base);

    // Weekly pills should reflect the live week-to-date comparison (no smoothing).
    const dh = hTarget;
    const dp = pTarget;
    const dl = lTarget;

    const fmt = p => {
      if (p == null) return '—';
      const rounded = Math.round(p);
      return rounded >= 0 ? `↑ ${rounded}%` : `↓ ${Math.abs(rounded)}%`;
    };

    const setPill=(el,delta)=>{
      el.textContent = fmt(delta);
      el.className = 'pill';
      const { fg } = colorForDelta(delta || 0);
      el.style.color = fg || 'var(--text)';
      el.style.background = 'transparent';
      el.style.borderColor = 'transparent';
    };
    setPill($('wkHoursDelta'),   dh);
    setPill($('wkParcelsDelta'), dp);
    setPill($('wkLettersDelta'), dl);

    // Extra trip weekly totals
    const extraMilesEl = document.getElementById('extraMilesWeekVal');
    const extraTimeEl = document.getElementById('extraTimeWeekVal');
    const extraPayoutEl = document.getElementById('extraPayoutWeekVal');
    const extraTiles = [document.getElementById('extraMilesWeek'), document.getElementById('extraTimeWeek'), document.getElementById('extraPayoutWeek')];
    const tripsThisWeek = (rows||[]).map(r=> ({ row:r, data: parseSecondTripFromRow(r) }))
      .filter(entry => entry.data && inRange(entry.row, weekStart, weekEnd));
    if (!tripsThisWeek.length){
      extraTiles.forEach(el=>{ if (el) el.style.display=''; });
      if (extraMilesEl) extraMilesEl.textContent = '0 mi';
      if (extraTimeEl){
        extraTimeEl.textContent = '0 min';
        extraTimeEl.title = 'No extra trips logged yet';
      }
      if (extraPayoutEl){
        extraPayoutEl.textContent = '$0.00';
        extraPayoutEl.title = 'No extra trips logged yet';
      }
    } else {
      const totalMiles = tripsThisWeek.reduce((sum, entry)=> sum + (+entry.data.m || 0), 0);
      const totalActual = tripsThisWeek.reduce((sum, entry)=> sum + (+entry.data.t || 0), 0);
      const totalPaid = tripsThisWeek.reduce((sum, entry)=> sum + ((+entry.data.m || 0) * 2), 0);
      const totalGas = tripsThisWeek.reduce((sum, entry)=>{
        const miles = +entry.data.m || 0;
        const emaRaw = entry.data?.e;
        const ema = Number.isFinite(+emaRaw) && +emaRaw >= 0 ? +emaRaw : readStoredEma();
        return sum + (miles * ema);
      }, 0);
      const hourlyRate = getHourlyRateFromEval();
      const timeComp = hourlyRate!=null ? (totalPaid/60) * hourlyRate : null;
      const payout = (timeComp!=null ? timeComp : 0) + totalGas;

      if (extraTiles[0]) extraTiles[0].style.display = '';
      if (extraTiles[1]) extraTiles[1].style.display = '';
      if (extraTiles[2]) extraTiles[2].style.display = '';

      if (extraMilesEl) extraMilesEl.textContent = `${totalMiles.toFixed(1)} mi`;
      if (extraTimeEl) {
        const paidNote = totalPaid.toFixed(0);
        extraTimeEl.textContent = `${totalActual.toFixed(0)} min`;
        extraTimeEl.title = `Actual minutes: ${totalActual.toFixed(0)} · Paid minutes: ${paidNote}`;
      }
      if (extraPayoutEl){
        extraPayoutEl.textContent = `$${payout.toFixed(2)}`;
        extraPayoutEl.title = timeComp!=null
          ? `Gas: $${totalGas.toFixed(2)} · Time pay: $${timeComp.toFixed(2)}`
          : `Gas: $${totalGas.toFixed(2)} · Add salary in Settings to include paid time`; 
      }
    }

    const dailyDeltas = (key) => {
      const arr = [];
      for (let i = 0; i <= dayIndexToday && i < 7; i++) {
        const cur = offIdxThisWeek.has(i) ? null : thisWeek[i][key];
        let base = lastWeek[i][key];
        if (holidayAdjEnabled && carryNext.has(i)) {
          // Baseline for day after a holiday off-day = last week (prev day + this day)
          base = ((lastWeek[i-1]?.[key] || 0) + (lastWeek[i]?.[key] || 0));
        }
        arr.push(cur == null ? null : pct(cur || 0, base || 0));
      }
      return arr; // may include nulls
    };
    const dH = dailyDeltas('h');
    const dP = dailyDeltas('p');
    const dL = dailyDeltas('l');

    const weightedAvg = (arr) => {
      let s = 0, wsum = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i]; if (v == null || !isFinite(v)) continue;
        const w = i + 1; s += v * w; wsum += w;
      }
      return wsum ? (s / wsum) : null;
    };
    const cumulative = (arr) => {
      let s = 0, seen = false;
      for (const v of arr) { if (v == null || !isFinite(v)) continue; s += v; seen = true; }
      return seen ? s : null;
    };

    const advH = weightedAvg(dH);
    const advP = weightedAvg(dP);
    const advL = weightedAvg(dL);
    const cumH = cumulative(dH);
    const cumP = cumulative(dP);
    const cumL = cumulative(dL);

    // Same-Count Weekly Average: compare N worked days this week vs first N worked days last week
    function sameCountDelta(key){
      const cur = [];
      for (let i = 0; i <= dayIndexToday && i < 7; i++){
        const v = thisWeek[i]?.[key] || 0; if (v>0) cur.push(v);
      }
      const N = cur.length;
      const prior = [];
      for (let i = 0; i < 7; i++){
        const v = lastWeek[i]?.[key] || 0; if (v>0) prior.push(v);
      }
      const M = prior.length;
      if (!N || !M) return { delta:null, n:N, m:M, avgThis:null, avgLast:null };
      const nUse = Math.min(N, M);
      const sumArr = a => a.reduce((t,x)=>t+(+x||0),0);
      const avgThis = sumArr(cur) / N;
      const avgLast = sumArr(prior.slice(0, nUse)) / nUse;
      const delta = pct(avgThis, avgLast);
      return { delta, n:N, m:M, avgThis, avgLast };
    }
    const scH = sameCountDelta('h');
    const scP = sameCountDelta('p');
    const scL = sameCountDelta('l');

    // Display as combined cue: prefer weighted average; fallback to cumulative
    const pick = (sc, w, c) => (sc!=null ? sc : (w != null ? w : c));
    setPill($('advHoursTrend'),   pick(scH.delta, advH, cumH));
    setPill($('advParcelsTrend'), pick(scP.delta, advP, cumP));
    setPill($('advLettersTrend'), pick(scL.delta, advL, cumL));

    // ===== Populate Weekly Hours Details panel =====
    try {
      const panelBody = document.getElementById('wkHoursDetailsBody');
      if (panelBody) {
        // Use precomputed Mon..Sun buckets from Advanced Weekly Metrics
        
        const dNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const rowsHtml = [];
        let tThis = 0, tLast = 0;
        for (let i = 0; i < 7; i++) {
          const cur = (i <= dayIndexToday) ? (offIdxThisWeek.has(i) ? null : (thisWeek[i]?.h || 0)) : null; // only Mon..today for this week; off-day shows as null
          let base = lastWeek[i]?.h || 0;
          let adjMark = '';
          if (holidayAdjEnabled && carryNext && carryNext.has(i)) { base = (lastWeek[i-1]?.h||0) + (lastWeek[i]?.h||0); adjMark = ' (adj)'; }
          if (cur != null) tThis += cur;
          if (i <= dayIndexToday) tLast += base;
          const delta = (cur == null || base === 0) ? null : ((cur - base) / base) * 100;
          const curTxt = (cur == null) ? 'Off' : cur.toFixed(2);
          const baseTxt = (base === 0) ? 'Off' : base.toFixed(2);
          const { fg } = colorForDelta(delta || 0);
          const deltaTxt = (delta == null) ? '—' : (delta >= 0 ? `↑ ${Math.round(delta)}%` : `↓ ${Math.abs(Math.round(delta))}%`);
          rowsHtml.push(`<tr><td>${dNames[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${deltaTxt}</td></tr>`);
        }
        const totalDelta = (tLast === 0) ? null : ((tThis - tLast) / tLast) * 100;
        const { fg:totFg } = colorForDelta(totalDelta || 0);
        const totalRow = `<tr><th>Total</th><th class="right">${tThis.toFixed(2)}</th><th class="right">${tLast.toFixed(2)}</th><th class="right" style="color:${totFg}">${totalDelta==null?'—':(totalDelta>=0?`↑ ${Math.round(totalDelta)}%`:`↓ ${Math.abs(Math.round(totalDelta))}%`)}</th></tr>`;

        const summaryHtml = `<small><span>This week so far: </span><span style=\"color:var(--warn)\">${tThis.toFixed(2)}h over ${dThis} day(s). Last week: ${tLast.toFixed(2)}h over ${dLast} day(s).</span></small>`;

        panelBody.innerHTML = `
          <div style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">${summaryHtml}</div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr><th>Day</th><th class="right">This week</th><th class="right">Baseline</th><th class="right">Δ%</th></tr>
            </thead>
            <tbody>
              ${rowsHtml.join('')}
            </tbody>
            <tfoot>
              ${totalRow}
            </tfoot>
          </table>
        `;
      }
    } catch (e) {
      console.warn('Failed to populate weekly hours details', e);
    }

    // ===== Populate Weekly Parcels Details panel =====
    try {
      const panelBody = document.getElementById('wkParcelsDetailsBody');
      if (panelBody) {
        const dNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const rowsHtml = [];
        let tThis = 0, tLast = 0;
        for (let i = 0; i < 7; i++) {
          const cur = (i <= dayIndexToday) ? (offIdxThisWeek.has(i) ? null : (thisWeek[i]?.p || 0)) : null;
          let base = lastWeek[i]?.p || 0;
          let adjMark = '';
          if (holidayAdjEnabled && carryNext && carryNext.has(i)) { base = (lastWeek[i-1]?.p||0) + (lastWeek[i]?.p||0); adjMark=' (adj)'; }
          if (cur != null) tThis += cur;
          if (i <= dayIndexToday) tLast += base;
          const delta = (cur == null || base === 0) ? null : ((cur - base) / base) * 100;
          const curTxt = (cur == null) ? '—' : String(cur);
          const baseTxt = String(base); // show 0 explicitly
          const { fg } = colorForDelta(delta || 0);
          const deltaTxt = (delta == null) ? '—' : (delta >= 0 ? `↑ ${Math.round(delta)}%` : `↓ ${Math.abs(Math.round(delta))}%`);
          rowsHtml.push(`<tr><td>${dNames[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${deltaTxt}</td></tr>`);
        }
        const totalDelta = (tLast === 0) ? null : ((tThis - tLast) / tLast) * 100;
        const { fg:totFg } = colorForDelta(totalDelta || 0);
        const totalRow = `<tr><th style=\"color:var(--brand)\">Total (this week vs last)</th><th class=\"right\">${tThis}</th><th class=\"right\">${tLast}</th><th class=\"right\" style=\"color:${totFg}\">${totalDelta==null?'—':(totalDelta>=0?`↑ ${Math.round(totalDelta)}%`:`↓ ${Math.abs(Math.round(totalDelta))}%`)}</th></tr>`;
        const summaryHtml = `<small><span>This week so far: </span><span style=\"color:var(--warn)\">${tThis} parcels over ${dThis} day(s). Last week: ${tLast} parcels over ${dLast} day(s).</span></small>`;
        panelBody.innerHTML = `
          <div style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">${summaryHtml}</div>
          <table style=\"width:100%;border-collapse:collapse\">
            <thead><tr><th>Day</th><th class=\"right\">This week</th><th class=\"right\">Baseline</th><th class=\"right\">Δ%</th></tr></thead>
            <tbody>${rowsHtml.join('')}</tbody>
            <tfoot>${totalRow}</tfoot>
          </table>`;
      }
    } catch (e) {
      console.warn('Failed to populate weekly parcels details', e);
    }

    // ===== Populate Weekly Letters Details panel =====
    try {
      const panelBody = document.getElementById('wkLettersDetailsBody');
      if (panelBody) {
        const dNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        const rowsHtml = [];
        let tThis = 0, tLast = 0;
        for (let i = 0; i < 7; i++) {
          const cur = (i <= dayIndexToday) ? (offIdxThisWeek.has(i) ? null : (thisWeek[i]?.l || 0)) : null;
          let base = lastWeek[i]?.l || 0;
          let adjMark = '';
          if (holidayAdjEnabled && carryNext && carryNext.has(i)) { base = (lastWeek[i-1]?.l||0) + (lastWeek[i]?.l||0); adjMark=' (adj)'; }
          if (cur != null) tThis += cur;
          if (i <= dayIndexToday) tLast += base;
          const delta = (cur == null || base === 0) ? null : ((cur - base) / base) * 100;
          const curTxt = (cur == null) ? '—' : String(cur);
          const baseTxt = String(base); // show 0 explicitly
          const { fg } = colorForDelta(delta || 0);
          const deltaTxt = (delta == null) ? '—' : (delta >= 0 ? `↑ ${Math.round(delta)}%` : `↓ ${Math.abs(Math.round(delta))}%`);
          rowsHtml.push(`<tr><td>${dNames[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${deltaTxt}</td></tr>`);
        }
        const totalDelta = (tLast === 0) ? null : ((tThis - tLast) / tLast) * 100;
        const { fg:totFg } = colorForDelta(totalDelta || 0);
        const totalRow = `<tr><th style=\"color:var(--brand)\">Total (this week vs last)</th><th class=\"right\">${tThis}</th><th class=\"right\">${tLast}</th><th class=\"right\" style=\"color:${totFg}\">${totalDelta==null?'—':(totalDelta>=0?`↑ ${Math.round(totalDelta)}%`:`↓ ${Math.abs(Math.round(totalDelta))}%`)}</th></tr>`;
        const summaryHtml = `<small><span>This week so far: </span><span style=\"color:var(--warn)\">${tThis} letters over ${dThis} day(s). Last week: ${tLast} letters over ${dLast} day(s).</span></small>`;
        panelBody.innerHTML = `
          <div style=\"padding:8px 10px;border-bottom:1px solid var(--border)\">${summaryHtml}</div>
          <table style=\"width:100%;border-collapse:collapse\">
            <thead><tr><th>Day</th><th class=\"right\">This week</th><th class=\"right\">Baseline</th><th class=\"right\">Δ%</th></tr></thead>
            <tbody>${rowsHtml.join('')}</tbody>
            <tfoot>${totalRow}</tfoot>
          </table>`;
      }
    } catch (e) {
      console.warn('Failed to populate weekly letters details', e);
    }

    // ===== Populate Advanced Weekly Trend panels (H/P/L) =====
    const renderTrendPanel = (bodyId, dailyArr, weightedVal, cumulativeVal, key, sc) => {
      const body = document.getElementById(bodyId);
      if (!body) return;
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const rows = [];
      for (let i = 0; i <= dayIndexToday && i < 7; i++) {
        const v = dailyArr[i];
        const cur = offIdxThisWeek.has(i) ? null : (thisWeek[i]?.[key] || 0);
        let base = lastWeek[i]?.[key] || 0;
        let adjMark = '';
        if (holidayAdjEnabled && carryNext && carryNext.has(i)) { base = (lastWeek[i-1]?.[key]||0) + (lastWeek[i]?.[key]||0); adjMark=' (adj)'; }
        const pctTxt = (v == null || !isFinite(v)) ? '—' : (v >= 0 ? `↑ ${Math.round(v)}%` : `↓ ${Math.abs(Math.round(v))}%`);
        const { fg } = colorForDelta(v || 0);
        const fmt = key === 'h' ? (n)=> n.toFixed(2) : (n)=> String(n);
        const curTxt = (i <= dayIndexToday) ? (cur==null ? (key==='h'?'Off':'—') : fmt(cur)) : '—';
        const baseTxt = (key === 'h') ? ((base === 0) ? 'Off' : fmt(base)) : fmt(base);
        rows.push(`<tr><td>${days[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${pctTxt}</td></tr>`);
      }
      const pickUsed = (sc && sc.delta != null && isFinite(sc.delta)) ? `Weekly Avg (N=${sc.n}${(sc.m&&sc.m!==sc.n)?`, last N=${Math.min(sc.n, sc.m)}`:''})` : ((weightedVal != null && isFinite(weightedVal)) ? 'Weighted' : 'Cumulative');
      const wTxt = (weightedVal == null || !isFinite(weightedVal)) ? '—' : `${weightedVal>=0?'↑':'↓'} ${Math.abs(Math.round(weightedVal))}%`;
      const cTxt = (cumulativeVal == null || !isFinite(cumulativeVal)) ? '—' : `${cumulativeVal>=0?'↑':'↓'} ${Math.abs(Math.round(cumulativeVal))}%`;
      const sTxt = (!sc || sc.delta == null || !isFinite(sc.delta)) ? '—' : `${sc.delta>=0?'↑':'↓'} ${Math.abs(Math.round(sc.delta))}%`;
      const { fg: sFg } = colorForDelta((sc && sc.delta) || 0);
      const { fg: wFg } = colorForDelta(weightedVal || 0);
      const { fg: cFg } = colorForDelta(cumulativeVal || 0);
      body.innerHTML = `
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th>Day</th><th class=\"right\">This week</th><th class=\"right\">Baseline</th><th class=\"right\">Δ%</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
          <tfoot>
            <tr><th colspan=\"3\" class=\"right\">Weekly Avg Δ% ${sc ? `<small class=\\"muted\\">(N=${sc.n}${(sc.m&&sc.m!==sc.n)?`, last N=${Math.min(sc.n, sc.m)}`:''})</small>` : ''}</th><th class=\"right\" style=\"color:${sFg}\">${sTxt}</th></tr>
            <tr><th colspan=\"3\" class=\"right\">Weighted avg Δ%</th><th class=\"right\" style=\"color:${wFg}\">${wTxt}</th></tr>
            <tr><th colspan=\"3\" class=\"right\">Cumulative Δ%</th><th class=\"right\" style=\"color:${cFg}\">${cTxt}</th></tr>
            <tr><th colspan=\"4\" class=\"right\"><small class=\"muted\">Using: ${pickUsed}</small></th></tr>
          </tfoot>
        </table>`;
    };
    try {
      renderTrendPanel('advHoursDetailsBody', dH, advH, cumH, 'h', scH);
      renderTrendPanel('advParcelsDetailsBody', dP, advP, cumP, 'p', scP);
      renderTrendPanel('advLettersDetailsBody', dL, advL, cumL, 'l', scL);
    } catch (e) {
      console.warn('Failed to populate trend panels', e);
    }

    // Today vs same-weekday baseline (worked days only)
    const todayIso = today.toISODate();
    const todaysRow = workRows.find(r => r.work_date === todayIso);
    const sameDow = workRows.filter(r => r.work_date !== todayIso && (dowIndex(r.work_date) === dow));
    // Use last same-weekday (most recent prior) as baseline instead of multi-week average
    const lastSame = sameDow.length ? sameDow[0] : null;
    const baseParcels = lastSame ? (+lastSame.parcels||0) : null;
    const baseLetters = lastSame ? (+lastSame.letters||0) : null;
    const todayParcels = todaysRow? (+todaysRow.parcels||0): null;
    const todayLetters = todaysRow? (+todaysRow.letters||0): null;
    const dayPct=(val,base)=> (val==null || !base)? null : ((val-base)/base)*100;
    const tdp=dayPct(todayParcels, baseParcels), tdl=dayPct(todayLetters, baseLetters);
    const wkNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    document.querySelector('#todayParcelsDelta')?.closest('.stat')?.querySelector('small.muted')?.replaceChildren(document.createTextNode(`vs last ${wkNames[dow]} (worked)`));
    document.querySelector('#todayLettersDelta')?.closest('.stat')?.querySelector('small.muted')?.replaceChildren(document.createTextNode(`vs last ${wkNames[dow]} (worked)`));
    document.querySelector('#todayOfficeDelta')?.closest('.stat')?.querySelector('small.muted')?.replaceChildren(document.createTextNode(`vs last ${wkNames[dow]} (worked)`));
    const baseOffice = lastSame ? (+lastSame.office_minutes||0) : null;
    const todayOffice = todaysRow ? (+todaysRow.office_minutes||0) : null;
    const fmtTiny=p=> p==null? '—' : (p>=0? `↑ ${p.toFixed(0)}%` : `↓ ${Math.abs(p).toFixed(0)}%`);
    const tdo=dayPct(todayOffice, baseOffice);
    $('todayParcelsDelta').textContent = fmtTiny(tdp);
    $('todayLettersDelta').textContent = fmtTiny(tdl);
    $('todayOfficeDelta').textContent = fmtTiny(tdo);
    // Minimal color-only styling for today's deltas
    (() => {
      const tp = document.getElementById('todayParcelsDelta');
      const tl = document.getElementById('todayLettersDelta');
      const to = document.getElementById('todayOfficeDelta');
      const { fg:fgP } = colorForDelta(tdp);
      const { fg:fgL } = colorForDelta(tdl);
      const { fg:fgO } = colorForDelta(tdo);
      if (tp) { tp.className='pill statDelta'; tp.style.color=fgP; tp.style.background='transparent'; tp.style.borderColor='transparent'; }
      if (tl) { tl.className='pill statDelta'; tl.style.color=fgL; tl.style.background='transparent'; tl.style.borderColor='transparent'; }
      if (to) { to.className='pill statDelta'; to.style.color=fgO; to.style.background='transparent'; to.style.borderColor='transparent'; }
    })();
}

  function buildEvalCompare(rows){
    try{
      if (!evalCompareCard) return;
      syncEvalGlobals();
      const profiles = EVAL_PROFILES || [];
      const enabled = profiles.length >= 1;
      evalCompareCard.style.display = enabled ? '' : 'none';
      if (!enabled){
        if (evalCompareSummary) evalCompareSummary.textContent = 'Add evaluation profiles in Settings.';
        return;
      }
      const activeByDateId = findActiveEvalProfileId();
      if (!evalCompareState.activeId || !getEvalProfileById(evalCompareState.activeId)){
        evalCompareState.activeId = activeByDateId || USPS_EVAL?.profileId || profiles[0].profileId;
      }
      setActiveEvalId(evalCompareState.activeId);
      const activeProfile = getEvalProfileById(evalCompareState.activeId);
      const priorProfiles = getPriorEvalProfiles(activeProfile);
      const previousProfile = getPreviousEvalProfile(evalCompareState.activeId);
      if (
        !evalCompareState.compareId ||
        evalCompareState.compareId === evalCompareState.activeId ||
        !getEvalProfileById(evalCompareState.compareId) ||
        !priorProfiles.find(p => p.profileId === evalCompareState.compareId)
      ){
        evalCompareState.compareId = previousProfile?.profileId || priorProfiles[priorProfiles.length - 1]?.profileId || null;
      }

      if (evalWindowPrimary){
        evalWindowPrimary.innerHTML = profiles.map(profile => `<option value="${profile.profileId}">${getEvalProfileDisplayName(profile)}</option>`).join('');
        if (evalCompareState.activeId) evalWindowPrimary.value = evalCompareState.activeId;
      }
      if (evalWindowCompare){
        evalWindowCompare.innerHTML = priorProfiles
          .map(profile => `<option value="${profile.profileId}">${getEvalProfileDisplayName(profile)}</option>`)
          .join('');
        if (evalCompareState.compareId && evalWindowCompare.querySelector(`option[value="${evalCompareState.compareId}"]`)){
          evalWindowCompare.value = evalCompareState.compareId;
        }
      }
      if (evalWindowRecent14) evalWindowRecent14.checked = !!evalCompareState.last14;

      if (!activeProfile){
        if (evalCompareSummary) evalCompareSummary.textContent = 'Select an evaluation window to view details.';
        return;
      }

      const scopedRows = filterRowsForView(rows || []);
      const activeMetrics = computeWindowMetrics(activeProfile, scopedRows, {
        last14: !!evalCompareState.last14,
        baselineFallbackToWindow: false
      });
      const compareProfile = evalCompareState.compareEnabled ? getEvalProfileById(evalCompareState.compareId) : null;
      const compareMetrics = compareProfile ? computeWindowMetrics(compareProfile, scopedRows, {
        last14: !!evalCompareState.last14,
        baselineFallbackToWindow: true
      }) : null;

      const modeLabel = evalCompareState.last14 ? 'Last 14 worked days' : 'Full evaluation window';
      const activeLabel = getEvalHeaderLabel(activeProfile);
      const activeDays = activeMetrics.workedDays;
      if (evalCompareSummary){
        const baselineMode =
          compareMetrics?.sampleMode === 'windowFallback'
            ? ' • Baseline uses full-window average (fewer than 14 worked days)'
            : '';
        evalCompareSummary.textContent = `${activeLabel} • ${modeLabel} • ${activeDays} worked day(s)${baselineMode}`;
      }

      const deltaText = Number.isFinite(activeMetrics.avgDeltaHoursPerDay)
        ? `${formatSigned(activeMetrics.avgDeltaHoursPerDay, 2)} hrs ${activeMetrics.avgDeltaHoursPerDay >= 0 ? 'over' : 'under'} evaluation`
        : 'No eval hours/day set';
      if (evalPrimaryDelta){
        evalPrimaryDelta.textContent = deltaText;
        evalPrimaryDelta.className = `value ${metricClassByDelta(activeMetrics.avgDeltaHoursPerDay, 'overUnder')}`;
      }
      if (evalPrimaryMeta){
        const progress = computeEvaluationProgress(activeProfile);
        const block = computeTwoWeekBlock(progress);
        const progressText = progress.hasActiveWindow
          ? `Evaluation progress: ${formatNumber(progress.progressPct, 1)}% (${progress.elapsedDays}/${progress.totalDays} days, ${progress.remainingDays} remaining)`
          : 'Evaluation progress: No active eval window';
        const blockText = block
          ? `2-week check: Block ${block.blockNumber} (${block.blockStart.toFormat('LLL d')} - ${block.blockEnd.toFormat('LLL d')}), ${block.daysRemaining} day(s) left${block.nextCheck ? ` • Next check around ${block.nextCheck.toFormat('LLL d')}` : ''}`
          : '2-week check: No active eval window';
        evalPrimaryMeta.innerHTML = `
          <span>Over-eval days: <b>${activeMetrics.overEvalDays}</b></span>
          <span>Under-eval days: <b>${activeMetrics.underEvalDays}</b></span>
          <span>Days logged: <b>${activeMetrics.workedDays}</b></span>
          <span>${progressText}</span>
          <span>${blockText}</span>
        `;
      }

      if (evalSingleGrid){
        const avgHoursCls = metricClassByDelta((activeMetrics.averages.hoursPerDay ?? 0) - (activeMetrics.evalHoursPerDay ?? 0), 'overUnder');
        evalSingleGrid.innerHTML = [
          { k:'Avg hours/worked day', v: formatMaybe(activeMetrics.averages.hoursPerDay, 2, 'h'), cls: avgHoursCls },
          { k:'Evaluated hours/day', v: formatMaybe(activeMetrics.evalHoursPerDay, 2, 'h'), cls: 'eval-neutral' },
          { k:'Effective $/hour', v: formatMoney(activeMetrics.effectiveHourly), cls: 'eval-neutral' },
          { k:'Avg volume/day', v: formatMaybe(activeMetrics.averages.volumePerDay, 1), cls: 'eval-neutral' },
          { k:'Avg parcels/day', v: formatMaybe(activeMetrics.averages.parcelsPerDay, 1), cls: 'eval-neutral' },
          { k:'Avg letters/day', v: formatMaybe(activeMetrics.averages.lettersPerDay, 1), cls: 'eval-neutral' },
          { k:'Avg flats/day', v: formatMaybe(activeMetrics.averages.flatsPerDay, 1), cls: 'eval-neutral' },
          { k:'Total hours', v: formatMaybe(activeMetrics.totals.hours, 1, 'h'), cls: 'eval-neutral' },
          { k:'Days logged', v: formatNumber(activeMetrics.workedDays, 0), cls: 'eval-neutral' },
          { k:'Quarterly pay', v: formatMoney(activeMetrics.quarterlyPay, 0), cls: 'eval-neutral' },
          { k:'Volume/hour', v: formatMaybe(activeMetrics.density.volumePerHour, 2), cls: 'eval-neutral' },
          { k:'Parcels/hour', v: formatMaybe(activeMetrics.density.parcelsPerHour, 2), cls: 'eval-neutral' },
          { k:'Avg delta/day', v: formatSignedMaybe(activeMetrics.avgDeltaHoursPerDay, 2, 'h'), cls: metricClassByDelta(activeMetrics.avgDeltaHoursPerDay, 'overUnder') }
        ].map(item => `<div class="eval-box"><span class="k">${item.k}</span><span class="v ${item.cls}">${item.v}</span></div>`).join('');
      }

      const canCompare = !!compareProfile && priorProfiles.length > 0;
      if (evalCompareToggle) evalCompareToggle.style.display = priorProfiles.length > 0 ? '' : 'none';
      if (evalCompareControls) evalCompareControls.style.display = evalCompareState.compareEnabled && canCompare ? '' : 'none';
      if (evalSingleDashboard) evalSingleDashboard.style.display = (evalCompareState.compareEnabled && canCompare) ? 'none' : '';
      if (evalCompareDashboard) evalCompareDashboard.style.display = (evalCompareState.compareEnabled && canCompare) ? '' : 'none';

      if (evalCompareState.compareEnabled && canCompare && compareMetrics){
        const comparison = buildComparisonSummary(activeMetrics, compareMetrics);
        const topDelta = comparison?.topDelta?.delta;
        if (evalComparePrimaryDelta){
          evalComparePrimaryDelta.textContent = `${formatSignedMaybe(topDelta, 2, ' hrs/day')}`;
          evalComparePrimaryDelta.className = `value ${metricClassByDelta(topDelta, 'overUnder')}`;
        }
        if (evalComparePrimaryMeta){
          evalComparePrimaryMeta.innerHTML = `<span>${activeLabel} minus ${getEvalHeaderLabel(compareProfile)} (Active - Baseline)</span>`;
        }

        const paneItems = (metrics) => ([
          { label: 'Days logged', value: formatNumber(metrics.workedDays, 0) },
          { label: 'Total volume', value: formatNumber(metrics.totals.volume, 0) },
          { label: 'Total hours', value: formatMaybe(metrics.totals.hours, 1, 'h') },
          { label: 'Avg volume/day', value: formatMaybe(metrics.averages.volumePerDay, 1) },
          { label: 'Avg hours/day', value: formatMaybe(metrics.averages.hoursPerDay, 2, 'h') },
          { label: 'Avg delta/day', value: formatSignedMaybe(metrics.avgDeltaHoursPerDay, 2, 'h'), cls: metricClassByDelta(metrics.avgDeltaHoursPerDay, 'overUnder') },
          { label: 'Effective $/hour', value: formatMoney(metrics.effectiveHourly) },
          { label: 'Evaluated pay', value: formatMoney(metrics.profile?.annualSalary, 0) }
        ]);
        renderEvalList(evalPaneA, paneItems(compareMetrics));
        renderEvalList(evalPaneB, paneItems(activeMetrics));

        const orderedGroups = ['time', 'workload', 'efficiency', 'pay'];
        const deltaRows = orderedGroups.flatMap((group) => {
          const groupRows = (comparison?.rows || []).filter(row => row.group === group);
          return groupRows.map((row) => {
            const deltaText = formatSignedMaybe(row.delta, row.digits, row.suffix);
            const pctText = row.pct == null ? '' : ` (${formatSignedMaybe(row.pct, 1, '%')})`;
            return {
              label: `${row.label}`,
              value: `${deltaText}${pctText}`,
              cls: metricClassByDelta(row.delta, row.meaning)
            };
          });
        });
        renderEvalList(evalPaneDelta, deltaRows);
        if (evalCompareNarrative){
          evalCompareNarrative.textContent = buildEvalNarrative(comparison);
        }
        renderEvalTrendList(evalTrendList, profiles, scopedRows, { last14: !!evalCompareState.last14 });
      } else {
        renderEvalTrendList(evalTrendList, profiles, scopedRows, { last14: !!evalCompareState.last14 });
      }
    }catch(err){
      console.warn('buildEvalCompare error', err);
      if (evalCompareSummary) evalCompareSummary.textContent = 'Unable to render evaluation comparison.';
    }
  }

  function getCssVar(name, fallback){
    try{
      const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
      return raw?.trim() || fallback;
    }catch(_){
      return fallback;
    }
  }

  function getBaseParcels(row){
    const base = row?.parcels_base != null ? Number(row.parcels_base) : Number(row?.parcels);
    return Number.isFinite(base) ? base : 0;
  }

  function combinedVolumeBase(row, weight){
    return combinedVolume(getBaseParcels(row), Number(row?.letters||0), weight);
  }

  function filterRowsForParser(rows, includePeak){
    const filtered = filterRowsForView(rows || []);
    if (includePeak || !PEAK_SEASON?.from || !PEAK_SEASON?.to) return filtered;
    return filtered.filter(r=> !isPeakSeasonDate(r.work_date));
  }

  function getAvailableYears(rows){
    const years = new Set();
    (rows || []).forEach(r=>{
      if (!r?.work_date) return;
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      if (d.isValid) years.add(d.year);
    });
    return Array.from(years).sort((a,b)=> b-a);
  }

  function buildPeriods(granularity, count, rows){
    const now = DateTime.now().setZone(ZONE);
    const periods = [];
    const asCount = count === 'all' ? null : Number(count || 0);
    const minDate = (rows || []).reduce((min, r)=>{
      if (!r?.work_date) return min;
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      if (!d.isValid) return min;
      return (!min || d < min) ? d : min;
    }, null) || now;

    if (granularity === 'year'){
      const startYear = asCount ? now.year - (asCount - 1) : minDate.year;
      for (let y = startYear; y <= now.year; y += 1){
        const from = DateTime.fromObject({ year: y, month:1, day:1 }, { zone: ZONE }).startOf('day');
        const to = from.endOf('year');
        periods.push({ label: String(y), from, to });
      }
      return periods;
    }

    if (granularity === 'week'){
      const start = asCount ? startOfWeekMonday(now.minus({ weeks: asCount - 1 })) : startOfWeekMonday(minDate);
      for (let cur = start; cur <= startOfWeekMonday(now); cur = cur.plus({ weeks:1 })){
        const from = startOfWeekMonday(cur);
        const to = endOfWeekSunday(cur);
        const label = from.toFormat('LLL d');
        periods.push({ label, from, to });
      }
      return periods;
    }

    const spanAcrossYears = minDate.year !== now.year;
    const start = asCount ? now.startOf('month').minus({ months: asCount - 1 }) : minDate.startOf('month');
    for (let cur = start; cur <= now.startOf('month'); cur = cur.plus({ months:1 })){
      const from = cur.startOf('month');
      const to = cur.endOf('month');
      const label = spanAcrossYears ? cur.toFormat('MMM yy') : cur.toFormat('MMM');
      periods.push({ label, from, to });
    }
    return periods;
  }

  function buildYearlySummary(rows){
    if (!yearlySummaryCard || !yearlySummaryStats || !yearlySummaryYear) return;
    const peakConfigured = !!(PEAK_SEASON?.from && PEAK_SEASON?.to);
    if (yearlySummaryIncludePeak){
      yearlySummaryIncludePeak.disabled = !peakConfigured;
      if (!peakConfigured) yearlySummaryIncludePeak.checked = false;
    }
    const includePeak = !!yearlySummaryIncludePeak?.checked;
    const filtered = filterRowsForParser(rows, includePeak).filter(r=> r.status !== 'off');
    const years = getAvailableYears(filtered);
    if (!years.length){
      yearlySummaryStats.textContent = 'No data yet.';
      return;
    }
    const current = Number(yearlySummaryYear.value) || years[0];
    if (yearlySummaryYear.options.length !== years.length || !yearlySummaryYear.value){
      yearlySummaryYear.innerHTML = years.map(y=> `<option value="${y}">${y}</option>`).join('');
      yearlySummaryYear.value = String(current);
    }

    const yearRows = filtered.filter(r=>{
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      return d.isValid && d.year === current;
    });
    const normalizeHoursLocal = (value)=>{
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      if (Math.abs(n) > 24) return n / 60;
      return n;
    };
    const salary = USPS_EVAL?.annualSalary != null ? Number(USPS_EVAL.annualSalary) : null;
    const totals = {
      parcels: yearRows.reduce((t,r)=> t + (Number(r.parcels)||0), 0),
      letters: yearRows.reduce((t,r)=> t + (Number(r.letters)||0), 0),
      hours: yearRows.reduce((t,r)=> t + (Number(r.hours)||0), 0),
      misdeliveries: yearRows.reduce((t,r)=> t + (Number(r.misdelivery_count)||0), 0)
    };
    const misdeliveryRate = totals.parcels > 0 ? (totals.misdeliveries / totals.parcels) * 100 : null;
    const monthsWithData = Math.max(0, new Set(yearRows.map(r=>{
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      return d.isValid ? d.month : null;
    }).filter(Boolean)).size);
    const proratedSalary = (salary && monthsWithData > 0) ? ((salary / 12) * monthsWithData) : null;
    const hourlyRate = (proratedSalary && totals.hours > 0) ? (proratedSalary / totals.hours) : null;

    const byMonth = Array.from({ length:12 }, (_, idx)=>({
      idx,
      label: DateTime.fromObject({ year: current, month: idx + 1, day:1 }, { zone: ZONE }).toFormat('MMM'),
      parcels: 0,
      letters: 0,
      hours: 0,
      officeHours: 0,
      routeHours: 0,
      volumeBase: 0
    }));
    const letterW = CURRENT_LETTER_WEIGHT || 0.33;
    yearRows.forEach(r=>{
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      if (!d.isValid) return;
      const bucket = byMonth[d.month - 1];
      bucket.parcels += Number(r.parcels)||0;
      bucket.letters += Number(r.letters)||0;
      bucket.hours += Number(r.hours)||0;
      bucket.officeHours += normalizeHoursLocal(r.office_minutes ?? r.officeMinutes);
      bucket.routeHours += routeAdjustedHours(r);
      bucket.volumeBase += combinedVolumeBase(r, letterW);
    });
    const activeMonths = byMonth.filter(m => (m.parcels + m.letters + m.hours) > 0);
    const monthVolume = (m)=> m.parcels;
    const heaviest = activeMonths.reduce((max, m)=> (monthVolume(m) > (max ? monthVolume(max) : -1)) ? m : max, null);
    const lightest = activeMonths.reduce((min, m)=> (monthVolume(m) < (min ? monthVolume(min) : Infinity)) ? m : min, null);
    const efficient = activeMonths.reduce((best, m)=>{
      const eff = m.volumeBase > 0 ? (m.routeHours / m.volumeBase) : null;
      if (eff == null) return best;
      if (!best) return { ...m, eff };
      return eff < best.eff ? { ...m, eff } : best;
    }, null);

    const workedDays = yearRows.filter(r=> (Number(r.hours)||0) > 0).length;
    const weekKeys = new Set(yearRows.map(r=>{
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      return d.isValid ? startOfWeekMonday(d).toISODate() : null;
    }).filter(Boolean));
    const weeksWithData = weekKeys.size || 0;
    const totalOfficeHours = byMonth.reduce((t,m)=> t + m.officeHours, 0);
    const totalRouteHours = byMonth.reduce((t,m)=> t + m.routeHours, 0);
    const avgWeeklyHours = weeksWithData > 0 ? (totals.hours / weeksWithData) : null;
    const avgOfficeHours = workedDays > 0 ? (totalOfficeHours / workedDays) : null;
    const avgRouteHours = workedDays > 0 ? (totalRouteHours / workedDays) : null;

    const blocks = [
      { label:'Total parcels', value: totals.parcels.toLocaleString() },
      { label:'Misdeliveries', value: totals.misdeliveries.toLocaleString() },
      { label:'Misdelivery rate', value: misdeliveryRate != null ? `${misdeliveryRate.toFixed(2)}%` : '—' },
      { label:'Total letters', value: totals.letters.toLocaleString() },
      { label:'Total hours', value: totals.hours.toFixed(1) },
      { label:'Hourly rate (prorated)', value: hourlyRate ? `$${hourlyRate.toFixed(2)}` : '—' },
      { label:'Heaviest month (parcels)', value: heaviest ? `${heaviest.label} (${monthVolume(heaviest).toLocaleString()})` : '—' },
      { label:'Lightest month (parcels)', value: lightest ? `${lightest.label} (${monthVolume(lightest).toLocaleString()})` : '—' },
      { label:'Avg weekly hours', value: avgWeeklyHours != null ? avgWeeklyHours.toFixed(1) : '—' },
      { label:'Avg office time (per day)', value: avgOfficeHours != null ? avgOfficeHours.toFixed(2) : '—' },
      { label:'Avg route time (per day)', value: avgRouteHours != null ? avgRouteHours.toFixed(2) : '—' },
      { label:'Most efficient', value: efficient ? `${efficient.label}` : '—' }
    ];
    yearlySummaryStats.innerHTML = blocks.map(b=> `<span class="pill"><small>${b.label}</small> <b>${b.value}</b></span>`).join('');
    const note = document.getElementById('yearlySummaryNote');
    if (note){
      note.textContent = 'Hourly rate uses salary paid ÷ logged hours, so vacations/holidays can raise the rate.';
    }
  }

  function buildParserChart(rows){
    if (!parserCard || !parserGranularity || !parserCount || !parserChartCanvas) return;
    const peakConfigured = !!(PEAK_SEASON?.from && PEAK_SEASON?.to);
    if (parserIncludePeak){
      parserIncludePeak.disabled = !peakConfigured;
      if (!peakConfigured) parserIncludePeak.checked = false;
    }
    const includePeak = !!parserIncludePeak?.checked;
    const filtered = filterRowsForParser(rows, includePeak).filter(r=> r.status !== 'off');
    const granularity = parserGranularity.value || 'month';
    const count = parserCount.value || '12';
    const periods = buildPeriods(granularity, count, filtered);
    const letterW = CURRENT_LETTER_WEIGHT || 0.33;

    const series = periods.map(period=>{
      const inPeriod = filtered.filter(r=> dateInRangeISO(r.work_date, period.from.toISODate(), period.to.toISODate()));
      const parcels = inPeriod.reduce((t,r)=> t + (Number(r.parcels)||0), 0);
      const letters = inPeriod.reduce((t,r)=> t + (Number(r.letters)||0), 0);
      const hours = inPeriod.reduce((t,r)=> t + (Number(r.hours)||0), 0);
      const routeHours = inPeriod.reduce((t,r)=> t + routeAdjustedHours(r), 0);
      const volumeBase = inPeriod.reduce((t,r)=> t + combinedVolumeBase(r, letterW), 0);
      const efficiency = (routeHours > 0 && volumeBase > 0) ? (volumeBase / routeHours) : 0;
      return { label: period.label, parcels, letters, hours, efficiency };
    });

    const labels = series.map(s=> s.label);
    const parcelsRaw = series.map(s=> s.parcels);
    const lettersRaw = series.map(s=> s.letters);
    const hoursRaw = series.map(s=> s.hours);
    const effRaw = series.map(s=> s.efficiency);
    const zScore = (values)=>{
      const valid = values.filter(v => Number.isFinite(v));
      const mean = valid.length ? (valid.reduce((a,b)=> a + b, 0) / valid.length) : 0;
      const variance = valid.length ? (valid.reduce((a,b)=> a + Math.pow(b - mean, 2), 0) / valid.length) : 0;
      const std = variance > 0 ? Math.sqrt(variance) : 0;
      const z = values.map(v => (std > 0 && Number.isFinite(v)) ? (v - mean) / std : 0);
      return { z, mean, std };
    };

    const view = parserView?.value || 'relationship';
    if (view === 'efficiency'){
      [parserShowParcels, parserShowLetters, parserShowHours].forEach(el=>{
        if (!el) return;
        el.checked = false;
        el.disabled = true;
      });
      if (parserShowEfficiency){
        parserShowEfficiency.checked = true;
        parserShowEfficiency.disabled = false;
      }
    }else{
      [parserShowParcels, parserShowLetters, parserShowHours, parserShowEfficiency].forEach(el=>{
        if (el) el.disabled = false;
      });
    }

    if (parserNote){
      parserNote.textContent = view === 'efficiency'
        ? 'Efficiency view: z-score of volume per route hour. Helper parcels excluded from efficiency.'
        : 'Relationship view: z-score per metric (mean 0, std 1). Helper parcels excluded from efficiency.';
    }

    if (!window.Chart){
      if (parserNote) parserNote.textContent = 'Chart.js missing — unable to render parser view.';
      return;
    }
    if (parserChart && typeof parserChart.destroy === 'function'){
      try{ parserChart.destroy(); }catch(_){ }
    }
    const metrics = [];
    if (view === 'efficiency'){
      metrics.push({
        label: 'Efficiency',
        color: getCssVar('--rs-eff','#22c55e'),
        raw: effRaw
      });
    }else{
      if (parserShowParcels?.checked !== false){
        metrics.push({ label:'Parcels', color:getCssVar('--rs-parcels','#2b7fff'), raw: parcelsRaw });
      }
      if (parserShowLetters?.checked !== false){
        metrics.push({ label:'Letters', color:getCssVar('--rs-letters','#f5c542'), raw: lettersRaw });
      }
      if (parserShowHours?.checked !== false){
        metrics.push({ label:'Hours', color:getCssVar('--rs-hours','#f59e0b'), raw: hoursRaw });
      }
      if (parserShowEfficiency?.checked !== false){
        metrics.push({ label:'Efficiency', color:getCssVar('--rs-eff','#22c55e'), raw: effRaw });
      }
    }
    if (!metrics.length){
      if (parserNote) parserNote.textContent = 'Select at least one metric.';
      return;
    }
    metrics.forEach(metric=>{
      const stats = zScore(metric.raw);
      metric.z = stats.z;
    });
    const allZ = metrics.flatMap(m => m.z || []).filter(v => Number.isFinite(v));
    const minZ = allZ.length ? Math.min(...allZ) : -2;
    const maxZ = allZ.length ? Math.max(...allZ) : 2;
    const pad = 0.5;
    let yMin = Math.floor(minZ - pad);
    let yMax = Math.ceil(maxZ + pad);
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin){
      yMin = -2;
      yMax = 2;
    }
    yMin = Math.max(-4, yMin);
    yMax = Math.min(4, yMax);
    if (yMax <= yMin){
      yMin = -2;
      yMax = 2;
    }
    const baselineColor = 'rgba(154,160,170,0.6)';
    const datasets = metrics.map(metric=> ({
      label: metric.label,
      data: metric.z,
      borderColor: metric.color,
      backgroundColor: metric.color,
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 4,
      fill: false,
      _raw: metric.raw,
      _z: metric.z
    }));
    datasets.push({
      label: 'Baseline',
      data: labels.map(()=> 0),
      borderColor: baselineColor,
      borderDash: [4,4],
      pointRadius: 0,
      pointHoverRadius: 0,
      borderWidth: 1,
      fill: false,
      _baseline: true
    });

    parserChart = new Chart(parserChartCanvas, {
      type:'line',
      data:{
        labels,
        datasets
      },
      options:{
        responsive:true,
        plugins:{
          legend:{
            display:true,
            labels:{
              filter:(item, data)=> !(data?.datasets?.[item.datasetIndex]?._baseline)
            }
          },
          tooltip:{
            callbacks:{
              label:(ctx)=>{
                const dataset = ctx.dataset;
                const raw = Array.isArray(dataset._raw) ? dataset._raw[ctx.dataIndex] : null;
                if (raw == null) return null;
                const val = typeof raw === 'number' ? raw : Number(raw);
                if (!Number.isFinite(val)) return `${dataset.label}: —`;
                const z = Array.isArray(dataset._z) ? dataset._z[ctx.dataIndex] : null;
                const zTxt = Number.isFinite(z) ? ` (z ${z.toFixed(2)})` : '';
                return `${dataset.label}: ${val.toFixed(1)}${zTxt}`;
              }
            }
          }
        },
        scales:{
          y:{ beginAtZero:false, min: yMin, max: yMax, ticks:{ stepSize:1 } }
        }
      }
    });
  }

  function initParserControls(){
    if (parserCard?.dataset.ready) return;
    if (parserCard) parserCard.dataset.ready = '1';
    const rerender = ()=>{ buildYearlySummary(allRows || []); buildParserChart(allRows || []); };
    [parserGranularity, parserCount, parserView, parserIncludePeak, parserShowParcels, parserShowLetters, parserShowHours, parserShowEfficiency, yearlySummaryYear, yearlySummaryIncludePeak].forEach(el=>{
      el?.addEventListener('change', rerender);
    });
  }

  function buildSleepDrinkChart(rows){
    if (!sleepDrinkCard || !drinkWeekBadge) return;
    if (!FLAGS.sleepDrink){
      sleepDrinkCard.style.display = 'none';
      if (sleepTrendChart && typeof sleepTrendChart.destroy === 'function'){
        try{ sleepTrendChart.destroy(); }catch(_){ }
      }
      if (sleepWeekdayChart && typeof sleepWeekdayChart.destroy === 'function'){
        try{ sleepWeekdayChart.destroy(); }catch(_){ }
      }
      if (drinkWeekdayChart && typeof drinkWeekdayChart.destroy === 'function'){
        try{ drinkWeekdayChart.destroy(); }catch(_){ }
      }
      sleepTrendChart = null;
      sleepWeekdayChart = null;
      drinkWeekdayChart = null;
      return;
    }
    sleepDrinkCard.style.display = '';
    const list = (rows || []).map(r=>{
      const sleep = parseSleepFromWeatherString(r.weather_json || '');
      const drink = parseDrinkFromWeatherString(r.weather_json || '');
      return { work_date: r.work_date, sleep, drink };
    }).filter(r=> r.work_date);

    const now = DateTime.now().setZone(ZONE);
    const start = startOfWeekMonday(now);
    const end = endOfWeekSunday(now);
    const weekDrinkDays = new Set();
    list.forEach(r=>{
      if (r.drink !== 'D') return;
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      if (!d.isValid) return;
      if (d >= start && d <= end) weekDrinkDays.add(r.work_date);
    });
    const weekCount = weekDrinkDays.size;
    const weekSleepValues = list
      .filter(r=>{
        if (r.sleep == null || !Number.isFinite(r.sleep)) return false;
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d.isValid && d >= start && d <= end;
      })
      .map(r=> Number(r.sleep));
    const weekSleepAvg = weekSleepValues.length
      ? (weekSleepValues.reduce((sum, v)=> sum + v, 0) / weekSleepValues.length)
      : null;

    const sleepLogged = list
      .filter(r=> r.sleep != null && Number.isFinite(r.sleep))
      .sort((a,b)=> String(a.work_date).localeCompare(String(b.work_date)));
    const recentSleep = sleepLogged.slice(-14).map(r=> Number(r.sleep));
    const recentSleepAvg = recentSleep.length
      ? (recentSleep.reduce((sum, v)=> sum + v, 0) / recentSleep.length)
      : null;

    const weeksWithData = new Set();
    const drinkDaysAll = new Set();
    list.forEach(r=>{
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      if (!d.isValid) return;
      const wk = startOfWeekMonday(d).toISODate();
      if (wk) weeksWithData.add(wk);
      if (r.drink === 'D') drinkDaysAll.add(r.work_date);
    });
    const avg = weeksWithData.size > 0 ? (drinkDaysAll.size / weeksWithData.size) : null;

    drinkWeekBadge.textContent = `${weekCount}/7`;
    if (drinkWeekMeta) drinkWeekMeta.textContent = 'Drink days (this week)';
    if (sleepWeekBadge){
      sleepWeekBadge.textContent = weekSleepAvg != null ? `${weekSleepAvg.toFixed(1)}h` : '—';
      sleepWeekBadge.title = weekSleepAvg != null ? `Average sleep this week: ${weekSleepAvg.toFixed(1)} hours` : 'No sleep values logged this week';
    }
    if (sleepWeekMeta) sleepWeekMeta.textContent = 'Avg sleep (this week)';
    if (sleepRecentBadge){
      sleepRecentBadge.textContent = recentSleepAvg != null ? `${recentSleepAvg.toFixed(1)}h` : '—';
      sleepRecentBadge.title = recentSleepAvg != null ? `Average across last ${recentSleep.length} logged sleep entries` : 'No sleep values logged yet';
    }
    if (sleepRecentMeta) sleepRecentMeta.textContent = 'Avg sleep (last 14 logged)';
    if (sleepDrinkNote){
      const drinkText = avg != null ? `Drink avg: ${avg.toFixed(1)} days/week` : 'Drink avg: —';
      const sleepText = recentSleep.length ? `Sleep logs: ${recentSleep.length} recent values` : 'Sleep logs: none yet';
      sleepDrinkNote.textContent = `${drinkText} · ${sleepText}`;
    }
    drinkWeekBadge.title = avg != null ? `Avg = ${avg.toFixed(1)} days per week` : '';

    if (typeof Chart === 'undefined'){
      if (sleepDrinkNote){
        sleepDrinkNote.textContent += ' · Chart.js missing';
      }
      return;
    }

    if (sleepTrendChart && typeof sleepTrendChart.destroy === 'function'){
      try{ sleepTrendChart.destroy(); }catch(_){ }
      sleepTrendChart = null;
    }
    if (sleepWeekdayChart && typeof sleepWeekdayChart.destroy === 'function'){
      try{ sleepWeekdayChart.destroy(); }catch(_){ }
      sleepWeekdayChart = null;
    }
    if (drinkWeekdayChart && typeof drinkWeekdayChart.destroy === 'function'){
      try{ drinkWeekdayChart.destroy(); }catch(_){ }
      drinkWeekdayChart = null;
    }

    const cutoff = now.minus({ days:56 }).startOf('day');
    const trendRows = sleepLogged
      .map(r=>{
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return { date: d, sleep: Number(r.sleep) };
      })
      .filter(r=> r.date.isValid && r.date >= cutoff)
      .sort((a,b)=> a.date.toMillis() - b.date.toMillis());
    const trendLabels = trendRows.map(r=> r.date.toFormat('LLL d'));
    const trendValues = trendRows.map(r=> r.sleep);
    const targetValues = trendRows.map(()=> 7.0);

    if (sleepTrendCanvas){
      sleepTrendChart = new Chart(sleepTrendCanvas, {
        type:'line',
        data:{
          labels: trendLabels,
          datasets:[
            {
              label:'Sleep (h)',
              data: trendValues,
              borderColor: '#4ea8de',
              backgroundColor: 'rgba(78,168,222,0.2)',
              tension:0.28,
              fill:false,
              pointRadius:2,
              pointHoverRadius:3
            },
            {
              label:'Target 7h',
              data: targetValues,
              borderColor:'rgba(245,199,89,0.9)',
              borderDash:[4,4],
              pointRadius:0,
              tension:0,
              fill:false
            }
          ]
        },
        options:{
          responsive:true,
          plugins:{
            legend:{ display:true },
            tooltip:{
              callbacks:{
                label:(ctx)=>{
                  const val = Number(ctx.raw);
                  if (!Number.isFinite(val)) return `${ctx.dataset.label}: —`;
                  return `${ctx.dataset.label}: ${val.toFixed(1)}h`;
                }
              }
            }
          },
          scales:{
            y:{
              beginAtZero:false,
              min:2,
              max:10,
              ticks:{
                callback:(v)=> `${v}h`
              }
            }
          }
        }
      });
    }

    const weekdaySlots = Array.from({ length:7 }, ()=> ({ sum:0, count:0 }));
    const weekdayCutoff = now.minus({ days:120 }).startOf('day');
    sleepLogged.forEach(r=>{
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      if (!d.isValid || d < weekdayCutoff) return;
      const idx = (d.weekday + 6) % 7;
      weekdaySlots[idx].sum += Number(r.sleep);
      weekdaySlots[idx].count += 1;
    });
    const weekdayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const weekdayData = weekdaySlots.map(slot => slot.count ? +(slot.sum / slot.count).toFixed(2) : null);
    const drinkWeekdaySlots = Array.from({ length:7 }, ()=> ({ drinks:0, total:0 }));
    list.forEach(r=>{
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      if (!d.isValid || d < weekdayCutoff) return;
      const idx = (d.weekday + 6) % 7;
      drinkWeekdaySlots[idx].total += 1;
      if (r.drink === 'D') drinkWeekdaySlots[idx].drinks += 1;
    });
    const drinkWeekdayRate = drinkWeekdaySlots.map(slot=>{
      if (!slot.total) return null;
      return +((slot.drinks / slot.total) * 100).toFixed(1);
    });

    if (sleepWeekdayCanvas){
      sleepWeekdayChart = new Chart(sleepWeekdayCanvas, {
        type:'bar',
        data:{
          labels: weekdayLabels,
          datasets:[{
            label:'Avg sleep (h)',
            data: weekdayData,
            backgroundColor:'rgba(111,207,151,0.55)',
            borderColor:'rgba(111,207,151,0.9)',
            borderWidth:1
          }]
        },
        options:{
          responsive:true,
          plugins:{
            legend:{ display:false },
            tooltip:{
              callbacks:{
                label:(ctx)=>{
                  const val = Number(ctx.raw);
                  if (!Number.isFinite(val)) return 'No data';
                  return `Avg: ${val.toFixed(2)}h`;
                }
              }
            }
          },
          scales:{
            y:{
              beginAtZero:true,
              suggestedMax:10,
              ticks:{ callback:(v)=> `${v}h` }
            }
          }
        }
      });
    }

    if (drinkWeekdayCanvas){
      drinkWeekdayChart = new Chart(drinkWeekdayCanvas, {
        type:'bar',
        data:{
          labels: weekdayLabels,
          datasets:[{
            label:'Drink day rate (%)',
            data: drinkWeekdayRate,
            backgroundColor:'rgba(245,199,89,0.45)',
            borderColor:'rgba(245,199,89,0.9)',
            borderWidth:1
          }]
        },
        options:{
          responsive:true,
          plugins:{
            legend:{ display:false },
            tooltip:{
              callbacks:{
                label:(ctx)=>{
                  const val = Number(ctx.raw);
                  if (!Number.isFinite(val)) return 'No data';
                  return `${val.toFixed(1)}% drink days`;
                }
              }
            }
          },
          scales:{
            y:{
              beginAtZero:true,
              min:0,
              max:100,
              ticks:{ callback:(v)=> `${v}%` }
            }
          }
        }
      });
    }
  }

  try{
    sb.channel('entries-feed').on('postgres_changes',{event:'*',schema:'public',table:'entries'}, async ()=>{
      const rows = await fetchEntries();
      allRows = rows;
      rebuildAll();
    }).subscribe();
  }catch(e){ console.warn('Realtime not enabled:', e?.message||e); }

  $('fab').addEventListener('click',()=>{ window.scrollTo({ top:0, behavior:'smooth' }); $('departTime').focus(); });
  $('searchBox').addEventListener('input', ()=>{ renderTable(applySearch(allRows)); });

  (function enableRowNavigation(){
    const tbody=document.querySelector('#tbl tbody'); if(!tbody) return; function activate(e){ const tr=e.target.closest('tr.rowLink'); if(!tr) return; $('date').value=tr.dataset.date; loadByDate(); window.scrollTo({ top:0, behavior:'smooth' }); }
    tbody.addEventListener('click', activate);
    tbody.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ if(e.target.closest('tr.rowLink')){ e.preventDefault(); activate(e); } } });
  })();

  // Quick Entry (experimental): show Hit Street / Return buttons when Add Entry is collapsed
  function ensureQuickEntryControls(headerEl){
    if (!FLAGS.quickEntry) return;
    let bar = document.getElementById('quickEntryBar');
    if (!bar){
      bar = document.createElement('span');
      bar.id = 'quickEntryBar';
      bar.style.cssText = 'float:right; display:none; gap:8px; align-items:center; font-size:12px';
      bar.className = 'row';
      const hitBtn = document.createElement('button'); hitBtn.id='quickHitBtn'; hitBtn.className='ghost btn-compact'; hitBtn.type='button'; hitBtn.textContent='Hit Street (now)';
      const retBtn = document.createElement('button'); retBtn.id='quickReturnBtn'; retBtn.className='ghost btn-compact'; retBtn.type='button'; retBtn.textContent='Return (now)';
      bar.appendChild(hitBtn); bar.appendChild(retBtn);
      try{ headerEl.appendChild(bar); }catch(_){ /* no-op */ }
      hitBtn.onclick = ()=>{ try{ $('departTime').value = hhmmNow(); computeBreakdown(); }catch(_){ } };
      retBtn.onclick = ()=>{ try{ $('returnTime').value = hhmmNow(); computeBreakdown(); }catch(_){ } };
    }
    updateQuickEntryVisibility(localStorage.getItem('routeStats.collapse.addEntryCard') === '1');
  }
  function updateQuickEntryVisibility(isCollapsed){
    const bar = document.getElementById('quickEntryBar');
    if (!bar){ return; }
    const show = !!FLAGS.quickEntry && !!isCollapsed;
    bar.style.display = show ? 'inline-flex' : 'none';
  }

  (function bindVolumeLeaderboard(){
    const openBtn = document.getElementById('openVolumeLeaderboard');
    const closeBtn = document.getElementById('closeVolumeLeaderboard');
    const panel = document.getElementById('volumeLeaderboard');
    const showPanel = ()=>{
      if (!panel) return;
      buildVolumeLeaderboard(window.__rawRows || allRows || []);
      panel.style.display = 'block';
      panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
    };
    openBtn?.addEventListener('click', showPanel);
    openBtn?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); showPanel(); } });
    closeBtn?.addEventListener('click', ()=>{ if(panel) panel.style.display='none'; });
  })();

  // Toggle Weekly details panels (hours, parcels, letters)
  (function enableWeeklyPanels(){
    const panels = ['wkHoursDetails','wkParcelsDetails','wkLettersDetails','advHoursDetails','advParcelsDetails','advLettersDetails'];
    function hideOthers(except){ panels.forEach(id => { if(id!==except){ const el=document.getElementById(id); if(el) el.style.display='none'; } }); }
    function enable(tileId, panelId, closeId){
      const tile=document.getElementById(tileId);
      const panel=document.getElementById(panelId);
      const close=document.getElementById(closeId);
      const toggle=()=>{
        if(!panel) return;
        const show = panel.style.display==='none';
        if(show){ hideOthers(panelId); panel.style.display='block'; panel.scrollIntoView({behavior:'smooth', block:'nearest'}); }
        else { panel.style.display='none'; }
      };
      tile?.addEventListener('click', toggle);
      tile?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
      close?.addEventListener('click', ()=>{ if(panel) panel.style.display='none'; });
    }
    enable('tileWkHours','wkHoursDetails','closeWkHoursDetails');
    enable('tileWkParcels','wkParcelsDetails','closeWkParcelsDetails');
    enable('tileWkLetters','wkLettersDetails','closeWkLettersDetails');
    enable('tileAdvHours','advHoursDetails','closeAdvHoursDetails');
    enable('tileAdvParcels','advParcelsDetails','closeAdvParcelsDetails');
    enable('tileAdvLetters','advLettersDetails','closeAdvLettersDetails');
  })();

  (async()=>{
    $('date').value = todayStr();
    await loadByDate();

    const sessionFromCallback = await authReadyPromise.catch(()=>null);
    const session = sessionFromCallback || await sb.auth.getSession().then(r=> r.data.session).catch(()=>null);
    let rows = [];
    if (session) {
      try {
        rows = await fetchEntries();
      } catch (err) {
        console.warn('Initial fetchEntries failed:', err);
        rows = [];
      }
    }

    allRows = rows;
    window.allRows = rows;
    rebuildAll();
    computeBreakdown();
    applyTrendPillsVisibility();
    applyRecentEntriesAutoCollapse();
  })();

  console.log('Route Stats loaded —', VERSION_TAG);
  // 🔒 Force Supabase authentication to verify or refresh on boot
  window.__sb.auth.getUser().then(async ({ data, error }) => {
    if (error || !data?.user) {
      console.warn("[Auth] No valid session found — refreshing...");
      await window.__sb.auth.refreshSession();
    } else {
      console.log("[Auth] Valid session:", data.user.id);
    }
  });

  // Developer helper: log diagnostics to the console on demand
  window.showDiagnostics = function(){
    try{
      if (typeof fitVolumeTimeModel !== 'function'){ console.log('Model not loaded'); return; }
      const rows = rowsForModelScope((window.allRows||[])
        .filter(r=> r && r.status!=='off' && ((+r.parcels||0)+(+r.letters||0)>0))
        .sort((a,b)=> a.work_date < b.work_date ? -1 : 1));
      const m = fitVolumeTimeModel(rows);
      if (!m){ console.log('Not enough data for diagnostics'); return; }
      console.table(m.residuals
        .map(d=>({
          date:d.iso,
          parcels:d.parcels,
          letters:d.letters,
          routeH:(d.routeMin/60).toFixed(2),
          predH:(d.predMin/60).toFixed(2),
          residMin:+d.residMin.toFixed(0)
        }))
        .sort((a,b)=> Math.abs(b.residMin) - Math.abs(a.residMin))
        .slice(0,5));
      console.log('bp=', m.bp.toFixed(2), 'bl=', m.bl.toFixed(3), 'w=', (m.bl/m.bp).toFixed(2), 'R^2=', (Math.max(0, Math.min(1, m.r2))*100).toFixed(0)+'%');
      return m;
    }catch(err){ console.warn('showDiagnostics error', err); return null; }
  };

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').catch(function(err) {
        console.error('Service worker registration failed:', err);
      });
    });
  }


  // USPS tiles: Route Eff. vs eval, and Weekly $/h
  function buildUspsTiles(rows){
    try{
      rows = filterRowsForView(rows||[]);
      const routeTile = document.getElementById('tileUspsRouteEff');
      const hourlyTile= document.getElementById('tileUspsHourly');
      if (!routeTile || !hourlyTile) return;
      const show = !!(FLAGS && FLAGS.uspsEval);
      routeTile.style.display = show ? '' : 'none';
      hourlyTile.style.display= show ? '' : 'none';
      if (!show) return;
      const cfg = USPS_EVAL || loadEval();
      // Hours vs eval (this week, running total Mon..today) — includes office time
      try{
        const now = DateTime.now().setZone(ZONE);
        const start = startOfWeekMonday(now);
        const end   = now.endOf('day');
        const inRange=(r)=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); return d>=start && d<=end; };
        const worked = (rows||[]).filter(r=> r.status!=='off' && inRange(r));
        const days = Array.from(new Set(worked.map(r=> r.work_date))).length;
        const valEl = document.getElementById('uspsRouteEffVal');
        if (!days || cfg.hoursPerDay==null){ valEl.textContent='—'; valEl.style.color=''; }
        else {
          const expHoursTotal = Math.max(0, cfg.hoursPerDay) * days;
          const hoursTotal = worked.reduce((t,r)=> t + (+r.hours||0), 0);
          const progress = (expHoursTotal>0) ? (hoursTotal / expHoursTotal) * 100 : null;
          if (progress==null || !isFinite(progress)) { valEl.textContent='—'; valEl.style.color=''; }
          else {
            const s = Math.round(progress);
            valEl.textContent = `${s}%`;
            valEl.style.color = '';
            valEl.title = `${(Math.round(hoursTotal*100)/100).toFixed(2)}h of ${(Math.round(expHoursTotal*100)/100).toFixed(2)}h eval over ${days} day(s)`;
          }
        }
      }catch(_){ /* ignore */ }
      // Weekly hourly rate — 4-week rolling average of $/h
      try{
        const now = DateTime.now().setZone(ZONE);
        const weeksBack = 4;
        const ranges = [];
        for (let w=1; w<=weeksBack; w++){
          ranges.push({ s: startOfWeekMonday(now.minus({weeks:w})), e: endOfWeekSunday(now.minus({weeks:w})) });
        }
        const val = document.getElementById('uspsHourlyRateVal');
        if (!cfg || cfg.annualSalary==null){ val.textContent='—'; val.style.color=''; }
        else {
          const weeklyPay = cfg.annualSalary / 52;
          let totalHours = 0, usedWeeks = 0;
          for (const rg of ranges){
            const wk = (rows||[]).filter(r=> r.status!=='off' && (()=>{ const d=DateTime.fromISO(r.work_date,{zone:ZONE}); return d>=rg.s && d<=rg.e; })());
            const h = wk.reduce((t,r)=> t + (+r.hours||0), 0);
            if (h > 0){ totalHours += h; usedWeeks++; }
          }
          if (!usedWeeks || totalHours<=0){
            val.textContent='—'; val.style.color='';
          } else {
            // Weighted average across weeks: (usedWeeks * weeklyPay) / totalHours
            const rate = (usedWeeks * weeklyPay) / totalHours;
            val.textContent = `$${(Math.round(rate*100)/100).toFixed(2)}`;
            val.title = `${usedWeeks}wk avg: ${totalHours.toFixed(2)}h total`;
            val.style.color='';
          }
        }
      }catch(_){ /* ignore */ }
    }catch(_){ /* ignore */ }
  }

  
