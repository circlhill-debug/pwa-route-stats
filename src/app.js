const DEBUG_VERSION = '2025-11-22-3';
window.logToScreen = function(message) {
  try {
    const panel = document.getElementById('debug-panel');
    if (panel) {
      const p = document.createElement('p');
      const timestamp = new Date().toLocaleTimeString();
      p.textContent = `[${timestamp}] ${message}`;
      p.style.margin = '0';
      p.style.borderBottom = '1px solid #eee';
      p.style.padding = '2px 0';
      panel.appendChild(p);
    }
  } catch (e) {
    console.error('logToScreen failed:', e);
  }
  console.log(message);
};
window.addEventListener('DOMContentLoaded', () => {
  logToScreen(`App version: ${DEBUG_VERSION}`);
});

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
import { computeForecastText, storeForecastSnapshot, saveForecastSnapshot, syncForecastSnapshotsFromSupabase } from './modules/forecast.js';

import { createDiagnostics } from './features/diagnostics.js';
import { createAiSummary } from './features/aiSummary.js';
import { createCharts } from './features/charts.js';
import { createSummariesFeature } from './features/summaries.js';
import { parseDismissReasonInput } from './utils/diagnostics.js';
import './modules/forecast.js';

// Reset any stored theme and data-theme to enforce current selection
try{
  localStorage.removeItem('routeStats.theme');
  document.documentElement?.removeAttribute('data-theme');
}catch(_){ /* ignore */ }

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
  let CURRENT_THEME = 'classic';

  function loadThemePreference(){
    try{
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'night' ? 'night' : 'classic';
    }catch(_){
      return 'classic';
    }
  }
  function applyThemePreference(theme){
    const root = document.documentElement;
    const next = theme === 'night' ? 'night' : 'classic';
    if (!root) return;
    if (next === 'classic'){
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', next);
    }
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

  function groupRowsByTimeframeForEval(rows, timeframe){
    const buckets = new Map();
    (rows||[]).forEach(row=>{
      if (!row || row.status === 'off') return;
      if (!row.work_date) return;
      let dt;
      try{
        dt = DateTime.fromISO(row.work_date, { zone: ZONE });
      }catch(_){ return; }
      if (!dt || !dt.isValid) return;
      let key, label;
      if (timeframe === 'day'){
        key = dt.toISODate();
        label = dt.toFormat('LLL dd, yyyy');
      }else if (timeframe === 'month'){
        key = dt.toFormat('yyyy-MM');
        label = dt.toFormat('LLLL yyyy');
      }else{
        const start = startOfWeekMonday(dt);
        const end = endOfWeekSunday(dt);
        key = start.toISODate();
        label = `${start.toFormat('LLL dd')} → ${end.toFormat('LLL dd')}`;
      }
      const bucket = buckets.get(key) || { key, label, count:0, hours:0, parcels:0, letters:0, miles:0 };
      bucket.count += 1;
      bucket.hours += Number(row.hours || 0);
      bucket.parcels += Number(row.parcels || 0);
      bucket.letters += Number(row.letters || 0);
      bucket.miles += Number(row.miles || 0);
      buckets.set(key, bucket);
    });
    return Array.from(buckets.values()).map(b=>({
      ...b,
      volume: b.parcels + b.letters
    }));
  }

  function combineEvalGroups(groupsA, groupsB){
    const mapA = new Map((groupsA||[]).map(g=> [g.key, g]));
    const mapB = new Map((groupsB||[]).map(g=> [g.key, g]));
    const keys = new Set([...mapA.keys(), ...mapB.keys()]);
    const merged = [];
    keys.forEach(key=>{
      const a = mapA.get(key);
      const b = mapB.get(key);
      merged.push({
        key,
        label: (a && a.label) || (b && b.label) || key,
        volumeA: a ? a.volume : 0,
        volumeB: b ? b.volume : 0,
        deltaVolume: (b ? b.volume : 0) - (a ? a.volume : 0),
        hoursA: a ? a.hours : 0,
        hoursB: b ? b.hours : 0,
        deltaHours: (b ? b.hours : 0) - (a ? a.hours : 0),
        countA: a ? a.count : 0,
        countB: b ? b.count : 0
      });
    });
    return merged;
  }

  function summarizeEvalGroups(groups){
    return (groups||[]).reduce((acc, g)=>{
      acc.volume += g.volume || 0;
      acc.hours += g.hours || 0;
      acc.parcels += g.parcels || 0;
      acc.letters += g.letters || 0;
      acc.miles += g.miles || 0;
      acc.days += g.count || 0;
      acc.periods += 1;
      return acc;
    }, { volume:0, hours:0, parcels:0, letters:0, miles:0, days:0, periods:0 });
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

  function formatDeltaCell(value, digits){
    const num = Number(value || 0);
    const cls = num > 0 ? 'delta pos' : num < 0 ? 'delta neg' : 'delta zero';
    const prefix = num > 0 ? '+' : '';
    return `<span class="${cls}">${prefix}${formatNumber(num, digits)}</span>`;
  }

  function populateEvalCompareSelect(selectEl, selectedId){
    if (!selectEl) return;
    selectEl.innerHTML = '';
    (EVAL_PROFILES || []).forEach(profile=>{
      const opt = document.createElement('option');
      opt.value = profile.profileId;
      opt.textContent = getEvalProfileDisplayName(profile);
      selectEl.appendChild(opt);
    });
    if (selectedId && getEvalProfileById(selectedId)){
      selectEl.value = selectedId;
    }else if (EVAL_PROFILES && EVAL_PROFILES[0]){
      selectEl.value = EVAL_PROFILES[0].profileId;
    }
  }

  function renderEvalCompareRow(row){
    return `<tr>
      <td>${row.label}</td>
      <td class="right">${formatNumber(row.volumeA, 0)}</td>
      <td class="right">${formatNumber(row.volumeB, 0)}</td>
      <td class="right">${formatDeltaCell(row.deltaVolume, 0)}</td>
      <td class="right">${formatNumber(row.hoursA, 1)}</td>
      <td class="right">${formatNumber(row.hoursB, 1)}</td>
      <td class="right">${formatDeltaCell(row.deltaHours, 1)}</td>
      <td class="right">${row.countA}/${row.countB}</td>
    </tr>`;
  }

  function formatEvalCompareSummary(profileA, summaryA, profileB, summaryB){
    const tf = evalCompareState.timeframe === 'month' ? 'month' : (evalCompareState.timeframe === 'week' ? 'week' : 'day');
    const labelA = getEvalProfileDisplayName(profileA);
    const labelB = getEvalProfileDisplayName(profileB);
    const volumeDiff = summaryB.volume - summaryA.volume;
    const hoursDiff = summaryB.hours - summaryA.hours;
    const avgVolumeA = summaryA.periods ? summaryA.volume / summaryA.periods : 0;
    const avgVolumeB = summaryB.periods ? summaryB.volume / summaryB.periods : 0;
    const avgHoursA = summaryA.periods ? summaryA.hours / summaryA.periods : 0;
    const avgHoursB = summaryB.periods ? summaryB.hours / summaryB.periods : 0;
    return `${labelB} vs ${labelA} (${tf}s). Volume change ${formatSigned(volumeDiff, 0)} (${formatNumber(avgVolumeB, 1)} vs ${formatNumber(avgVolumeA, 1)} avg/${tf}). Hours change ${formatSigned(hoursDiff, 1)} (${formatNumber(avgHoursB, 1)} vs ${formatNumber(avgHoursA, 1)} avg/${tf}). Days logged ${summaryB.days} vs ${summaryA.days}.`;
  }

  // === Feature Flags (localStorage) ===
  let FLAGS = loadFlags();
  let evalCompareState = {
    timeframe:'week',
    sortKey:'deltaVolume',
    sortDir:'desc',
    aId: USPS_EVAL?.profileId || null,
    bId: null
  };

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
    if (scope !== 'rolling') return rows;
    const cutoff = DateTime.now().setZone(ZONE).minus({ days:120 }).startOf('day');
    return rows.filter(r=>{
      try{
        if (!r || !r.work_date) return false;
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= cutoff;
      }catch(_){ return false; }
    });
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
      if (CURRENT_USER_ID){
        try {
          await syncForecastSnapshotsFromSupabase(sb, CURRENT_USER_ID, { silent: true });
        } catch (err) {
          console.warn('renderTomorrowForecast: snapshot sync failed, using local cache', err);
        }
      }
      const tomorrowDate = DateTime.now().setZone(ZONE).plus({ days: 1 });
      const tomorrowDow = tomorrowDate.weekday === 7 ? 0 : tomorrowDate.weekday;

      // --- SUNDAY PATCH: Skip forecasting and show day-off message ---
      if (tomorrowDow === 0) {
        const container = document.querySelector('#forecastBadgeContainer') || document.body;
        if (container) {
          const existingBadges = container.querySelectorAll('.forecast-badge');
          existingBadges.forEach(node => node.remove());
          const forecastBadge = document.createElement('div');
          forecastBadge.className = 'forecast-badge';
          const titleEl = document.createElement('h3');
          titleEl.textContent = '🌤 Tomorrow’s Forecast';
          const bodyEl = document.createElement('p');
          bodyEl.textContent = "Enjoy your day off ❤️";
          forecastBadge.appendChild(titleEl);
          forecastBadge.appendChild(bodyEl);
          container.appendChild(forecastBadge);
        }
        return {
          message: "Enjoy your day off ❤️",
          type: "rest",
          iso: null,
          weekday: 0,
          total_time: null,
          office_time: null,
          end_time: null,
          tags: []
        };
      }
      // ---------------------------------------------------------------

      const forecastText = computeForecastText({ targetDow: tomorrowDow }) || 'Forecast unavailable';
      storeForecastSnapshot(tomorrowDate.toISODate(), forecastText);
      if (CURRENT_USER_ID){
        try{
          await saveForecastSnapshot({
            iso: tomorrowDate.toISODate(),
            weekday: tomorrowDow,
            totalTime: null,
            officeTime: null,
            endTime: null,
            tags: readTagHistoryForIso(tomorrowDate.toISODate()),
            user_id: CURRENT_USER_ID
          }, { supabaseClient: sb, silent: true });
        }catch(err){ console.warn('saveForecastSnapshot (remote) failed', err); }
      }
      const container = document.querySelector('#forecastBadgeContainer') || document.body;
      if (!container) return;
      const existingBadges = container.querySelectorAll('.forecast-badge');
      existingBadges.forEach(node => node.remove());
      const forecastBadge = document.createElement('div');
      forecastBadge.className = 'forecast-badge';
      const titleEl = document.createElement('h3');
      titleEl.textContent = '🌤 Tomorrow’s Forecast';
      const bodyEl = document.createElement('p');
      bodyEl.textContent = forecastText;
      forecastBadge.appendChild(titleEl);
      forecastBadge.appendChild(bodyEl);
      container.appendChild(forecastBadge);
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
    logToScreen("Init: Awaiting auth promise...");
    const session = await authReadyPromise;
    CURRENT_USER_ID = session?.user?.id || null;
    logToScreen(`Init: Auth complete. User ID: ${CURRENT_USER_ID || 'null'}`);
  
    if (window.__sb && CURRENT_USER_ID) {
      try {
        logToScreen("Sync: Attempting forecast sync...");
        const snapshots = await syncForecastSnapshotsFromSupabase(window.__sb, CURRENT_USER_ID, { silent: true });
        logToScreen(`Sync: Success. Loaded ${snapshots ? snapshots.length : 0} snapshots from Supabase.`);
      } catch (e) {
        logToScreen(`Sync: FAILED. Error: ${e.message}`);
        console.warn("[Forecast] Snapshot sync failed:", e);
      }
    } else {
      logToScreen("Sync: Skipped. No user or Supabase client.");
    }
    // Now that sync is complete, render the forecast
    logToScreen("Render: Calling renderTomorrowForecast().");
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
  const flagCollapsedUi = document.getElementById('flagCollapsedUi');
  const flagQuickEntry = document.getElementById('flagQuickEntry');
  const flagSmartSummary = document.getElementById('flagSmartSummary');
  const flagDayCompare = document.getElementById('flagDayCompare');
  const flagUspsEval = document.getElementById('flagUspsEval');
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
const evalCompareSelectA = document.getElementById('evalCompareSelectA');
const evalCompareSelectB = document.getElementById('evalCompareSelectB');
const evalCompareSummary = document.getElementById('evalCompareSummary');
const evalCompareBody = document.getElementById('evalCompareBody');
const evalCompareTable = document.getElementById('evalCompareTable');
const evalCompareTfButtons = Array.from(document.querySelectorAll('#evalCompareCard .eval-tf-btn'));
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
    if (flagCollapsedUi) flagCollapsedUi.checked = !!FLAGS.collapsedUi;
    if (flagQuickEntry) flagQuickEntry.checked = !!FLAGS.quickEntry;
    if (flagSmartSummary) flagSmartSummary.checked = !!FLAGS.smartSummary;
    if (flagDayCompare) flagDayCompare.checked = !!FLAGS.dayCompare;
    if (flagUspsEval) flagUspsEval.checked = !!FLAGS.uspsEval;
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
    if (flagCollapsedUi) FLAGS.collapsedUi = !!flagCollapsedUi.checked;
    if (flagQuickEntry) FLAGS.quickEntry = !!flagQuickEntry.checked;
    if (flagSmartSummary) FLAGS.smartSummary = !!flagSmartSummary.checked;
    if (flagDayCompare) FLAGS.dayCompare = !!flagDayCompare.checked;
    if (flagUspsEval) FLAGS.uspsEval = !!flagUspsEval.checked;
    // read USPS eval fields
    try{
      const selectedId = evalProfileSelect?.value || USPS_EVAL?.profileId || null;
      const updated = collectEvalFormValues(selectedId);
      saveEval(updated);
      syncEvalGlobals();
      USPS_EVAL = getEvalProfileById(updated.profileId) || updated;
      populateEvalProfileSelectUI(USPS_EVAL?.profileId);
      if (!evalCompareState.aId || evalCompareState.aId === selectedId){
        evalCompareState.aId = USPS_EVAL?.profileId || selectedId || evalCompareState.aId;
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
      const chosenTheme = themeSelect.value === 'night' ? 'night' : 'classic';
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
    applyCollapsedUi();
    applyRecentEntriesAutoCollapse();
    aiSummary.updateAvailability();
    aiSummary.renderLastSummary();
  });

  evalCompareSelectA?.addEventListener('change', ()=>{
    evalCompareState.aId = evalCompareSelectA.value;
    if (evalCompareState.aId === evalCompareState.bId){
      const alternative = (EVAL_PROFILES || []).find(p => p.profileId !== evalCompareState.aId);
      if (alternative){
        evalCompareState.bId = alternative.profileId;
        if (evalCompareSelectB) evalCompareSelectB.value = evalCompareState.bId;
      }
    }
    buildEvalCompare(allRows || []);
  });

  evalCompareSelectB?.addEventListener('change', ()=>{
    evalCompareState.bId = evalCompareSelectB.value;
    if (evalCompareState.bId === evalCompareState.aId){
      const alternative = (EVAL_PROFILES || []).find(p => p.profileId !== evalCompareState.aId);
      if (alternative){
        evalCompareState.aId = alternative.profileId;
        if (evalCompareSelectA) evalCompareSelectA.value = evalCompareState.aId;
      }
    }
    buildEvalCompare(allRows || []);
  });

  evalCompareTfButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const tf = btn.dataset.tf || 'week';
      if (tf === evalCompareState.timeframe) return;
      evalCompareState.timeframe = tf;
      evalCompareTfButtons.forEach(b => b.classList.toggle('active', b === btn));
      buildEvalCompare(allRows || []);
    });
  });

  evalCompareTable?.addEventListener('click', (event)=>{
    const th = event.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.getAttribute('data-sort');
    if (!key) return;
    if (evalCompareState.sortKey === key){
      evalCompareState.sortDir = evalCompareState.sortDir === 'asc' ? 'desc' : 'asc';
    }else{
      evalCompareState.sortKey = key;
      evalCompareState.sortDir = 'desc';
    }
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
      const collapsedUiOn = !!(FLAGS && FLAGS.collapsedUi);
      if (collapseBody || collapsedUiOn){
        // Defer to Collapsed UI system: ensure default collapsed and let its handler manage toggling
        if (localStorage.getItem(KEY) == null){ try{ localStorage.setItem(KEY, '1'); }catch(_){ } }
        try{ (window.__collapse_set||(()=>{}))('recentEntriesCard', true); }catch(_){ }
        return;
      }
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
const parcels=$('parcels'), letters=$('letters'), miles=$('miles'), mood=$('mood'), notes=$('notes');
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
    const d=date.value; const s=start.value||'08:00';
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

  offDay.addEventListener('change', ()=>{ if(offDay.checked){ end.value=hhmmNow(); parcels.value=letters.value=miles.value=0; mood.value='🛑 off'; computeBreakdown(); }});
;[date,start,departTime,returnTime,end,parcels,letters,miles,offDay,weather,temp,boxholders].forEach(el=> el.addEventListener('input', computeBreakdown));
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
    return parts.length? parts.join(' · ') : null;
  }

  function collectPayload(userId){
    const d=date.value; const s=start.value||'08:00';
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
    start.value       = r.start_time || '08:00';
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
    } else {
      const parts = String(raw).split('·').map(s=>s.trim());
      let w='', t='', b=''; let hol=false; let rsn=''; let stData=null; let brk=null;
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
    }
    try { computeBreakdown(); } catch(_){}
  }

  let editingKey = null; let lastDeleted = null; const btnUndoDelete = $('btnUndoDelete');
  function showUndo(show){ if(!btnUndoDelete) return; btnUndoDelete.style.display = show ? 'inline-block' : 'none'; }

const searchBox = $('searchBox'); let allRows = [];
function applySearch(rows){
    const q = (searchBox.value||'').trim().toLowerCase(); if(!q) return rows;
    return rows.filter(r=>{
      const fields=[ r.work_date, r.status, r.mood, r.weather_json, r.notes, String(r.parcels||''), String(r.letters||''), String(r.miles||'') ];
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
      updateYearlyTotals({ ...payload, date: payload.work_date });
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
    $('notes').value=''; parcels.value=0; letters.value=0; miles.value=53; offDay.checked=false; start.value='08:00'; end.value=''; departTime.value=''; returnTime.value=''; mood.value=''; weather.value=''; if(temp) temp.value=''; if(boxholders) boxholders.value=''; computeBreakdown();
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
    return ensurePostHolidayTags(data || []);
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
    const headers=['work_date','route','status','start_time','depart_time','return_time','end_time','hours','office_minutes','route_minutes','parcels','letters','miles','mood','notes','weather_json','created_at'];
    const lines=[headers.join(',')];
    for(const r of rows){
      const vals=headers.map(h=>{ let v; if(h==='route') v='R1'; else v=r[h]; if(v==null) return ''; const s=String(v).replace(/"/g,'""'); return /[",\n]/.test(s)? '"'+s+'"': s; });
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
    const rows=[]; for(let i=1;i<lines.length;i++){ const cols=splitCsv(lines[i]); const get=(name)=> unq(cols[idx(name)] ?? ''); const r={ user_id:user.id, work_date:get('work_date'), route:'R1', status:get('status')||'worked', start_time:get('start_time')||null, depart_time:get('depart_time')||null, return_time:get('return_time')||null, end_time:get('end_time')||null, hours:+(get('hours')||0)||null, office_minutes:get('office_minutes')||null, route_minutes:get('route_minutes')||null, parcels:+(get('parcels')||0)||0, letters:+(get('letters')||0)||0, miles:+(get('miles')||0)||0, mood:get('mood')||null, notes:get('notes')||null, weather_json:get('weather_json')||null }; if(r.work_date) rows.push(r); }
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
              <tr><th>Day</th><th class="right">This week</th><th class="right">Last week</th><th class="right">Δ%</th></tr>
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
            <thead><tr><th>Day</th><th class=\"right\">This week</th><th class=\"right\">Last week</th><th class=\"right\">Δ%</th></tr></thead>
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
            <thead><tr><th>Day</th><th class=\"right\">This week</th><th class=\"right\">Last week</th><th class=\"right\">Δ%</th></tr></thead>
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
          <thead><tr><th>Day</th><th class=\"right\">This week</th><th class=\"right\">Last week</th><th class=\"right\">Δ%</th></tr></thead>
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
      const enabled = FLAGS.uspsEval && profiles.length >= 2;
      evalCompareCard.style.display = enabled ? '' : 'none';
      if (!enabled){
        if (evalCompareSummary) evalCompareSummary.textContent = profiles.length ? 'Add another evaluation profile to compare.' : 'Add evaluation profiles in Settings.';
        if (evalCompareBody) evalCompareBody.innerHTML = '';
        return;
      }
      if (!evalCompareState.aId || !getEvalProfileById(evalCompareState.aId)){
        evalCompareState.aId = USPS_EVAL?.profileId || profiles[0].profileId;
      }
      if (!evalCompareState.bId || evalCompareState.bId === evalCompareState.aId || !getEvalProfileById(evalCompareState.bId)){
        const fallback = profiles.find(p => p.profileId !== evalCompareState.aId);
        evalCompareState.bId = fallback ? fallback.profileId : profiles[0].profileId;
        if (evalCompareState.bId === evalCompareState.aId && profiles.length > 1){
          evalCompareState.bId = profiles[1].profileId;
        }
      }
      populateEvalCompareSelect(evalCompareSelectA, evalCompareState.aId);
      populateEvalCompareSelect(evalCompareSelectB, evalCompareState.bId);
      evalCompareTfButtons.forEach(btn=>{
        btn.classList.toggle('active', btn.dataset.tf === evalCompareState.timeframe);
      });
      const profileA = getEvalProfileById(evalCompareState.aId);
      const profileB = getEvalProfileById(evalCompareState.bId);
      if (!profileA || !profileB){
        if (evalCompareSummary) evalCompareSummary.textContent = 'Select two evaluation profiles to compare.';
        if (evalCompareBody) evalCompareBody.innerHTML = '';
        return;
      }
      const scopedRows = filterRowsForView(rows || []);
      const rowsA = rowsForEvaluationRange(scopedRows, profileA);
      const rowsB = rowsForEvaluationRange(scopedRows, profileB);
      const groupsA = groupRowsByTimeframeForEval(rowsA, evalCompareState.timeframe);
      const groupsB = groupRowsByTimeframeForEval(rowsB, evalCompareState.timeframe);
      const combined = combineEvalGroups(groupsA, groupsB);
      const summaryA = summarizeEvalGroups(groupsA);
      const summaryB = summarizeEvalGroups(groupsB);
      if (evalCompareSummary){
        evalCompareSummary.textContent = formatEvalCompareSummary(profileA, summaryA, profileB, summaryB);
      }
      const sortKey = evalCompareState.sortKey;
      const sortDir = evalCompareState.sortDir === 'asc' ? 1 : -1;
      combined.sort((a,b)=>{
        if (sortKey === 'label'){
          const cmp = (a.label||'').localeCompare(b.label||'');
          return sortDir * cmp;
        }
        const valA = Number(a[sortKey] || 0);
        const valB = Number(b[sortKey] || 0);
        return sortDir * (valA - valB);
      });
      if (evalCompareBody){
        if (!combined.length){
          evalCompareBody.innerHTML = `<tr><td colspan="8" class="muted">No worked entries for these evaluations in the selected window.</td></tr>`;
        }else{
          evalCompareBody.innerHTML = combined.map(renderEvalCompareRow).join('');
        }
      }
    }catch(err){
      console.warn('buildEvalCompare error', err);
      if (evalCompareSummary) evalCompareSummary.textContent = 'Unable to render evaluation comparison.';
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

  // Collapsed UI scaffolding (experimental): add toggle buttons to collapse sections
  function applyCollapsedUi(){
    const enabled = !!(FLAGS && FLAGS.collapsedUi);
    const targets = [
      { id:'addEntryCard' },
      { id:'dowCard' },
      { id:'parcelsOverTimeCard' },
      { id:'lettersOverTimeCard' },
      { id:'monthlyGlanceCard' },
      { id:'evalCompareCard' },
      { id:'quickFilterCard' },
      { id:'milestoneCard' },
      { id:'dayCompareCard' },
      { id:'recentEntriesCard' },
    ];
    const storeKey = (id)=> `routeStats.collapse.${id}`;
    const $body = (id)=> document.querySelector('#'+id+' > .__collapseBody');
    const $btn  = (id)=> document.querySelector('#'+id+' .__collapseToggle');

    function setSectionCollapsed(id, collapsed){
      const body = $body(id);
      const btn = $btn(id);
      if (body) body.style.display = collapsed ? 'none' : '';
      if (btn){
        btn.textContent = collapsed ? 'Expand' : 'Collapse';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        const ctrl = btn.getAttribute('aria-controls');
        if (!ctrl && body && body.id) btn.setAttribute('aria-controls', body.id);
      }
      try{ localStorage.setItem(storeKey(id), collapsed ? '1' : '0'); }catch(_){ }
      if (id==='addEntryCard') updateQuickEntryVisibility(collapsed);
    }

    for (const t of targets){
      const sec = document.getElementById(t.id);
      if (!sec) continue;
      try{
        if (enabled) sec.setAttribute('data-collapsible-active', 'true');
        else sec.removeAttribute('data-collapsible-active');
      }catch(_){ }
      // Ensure a header element to host the toggle
      const headerEl = sec.firstElementChild; // usually h3 or header row
      if (!headerEl) continue;
      // Ensure a body wrapper containing all non-header children for reliable show/hide
      let body = sec.querySelector(':scope > .__collapseBody');
      if (!body){
        body = document.createElement('div');
        body.className = '__collapseBody';
        // Move all non-header children into body
        const toMove = [];
        for (let i = 1; i < sec.children.length; i++) toMove.push(sec.children[i]);
        toMove.forEach(node => body.appendChild(node));
        // Assign a unique id for aria-controls linkage
        try{ if (!body.id) body.id = `__cb_${t.id}`; }catch(_){ }
        sec.appendChild(body);
      }
      // Cleanup any stray toggles created previously in the wrong place
      try{
        const toggles = sec.querySelectorAll('.__collapseToggle');
        if (toggles && toggles.length > 1){
          toggles.forEach((b, idx)=>{ if (!headerEl.contains(b) || idx>0) b.remove(); });
        }
      }catch(_){ /* ignore */ }
      // Find or create toggle button (inside header only)
      let btn = headerEl.querySelector('.__collapseToggle');
      if (!btn){
        btn = document.createElement('button');
        btn.className = 'ghost __collapseToggle';
        btn.type = 'button';
        btn.style.marginLeft = 'auto';
        btn.style.float = 'right';
        btn.style.fontSize = '12px';
        btn.textContent = 'Collapse';
        btn.setAttribute('aria-expanded', 'true');
        if (body && body.id) btn.setAttribute('aria-controls', body.id);
        // Append to header (h3 or row)
        try{ headerEl.appendChild(btn); }catch(_){ sec.insertBefore(btn, sec.firstChild); }
      }
      // Handler
      const setCollapsed = (collapsed)=> setSectionCollapsed(t.id, collapsed);
      const saved = (localStorage.getItem(storeKey(t.id)) === '1');
      // Enable/disable per flag
      btn.style.display = enabled ? 'none' : 'none'; // hide explicit button; use header click instead
      if (!enabled){
        // Ensure everything is visible in normal mode
        setCollapsed(false);
        continue;
      }
      // Default: collapse Add Entry and Recent Entries the first time when feature enabled
      if ((t.id==='addEntryCard' || t.id==='recentEntriesCard') && localStorage.getItem(storeKey(t.id)) == null){
        try{ localStorage.setItem(storeKey(t.id), '1'); }catch(_){ }
      }
      const initialCollapsed = (localStorage.getItem(storeKey(t.id)) === '1');
      setCollapsed(initialCollapsed);
      // Header click toggles collapse (ignore clicks on interactive controls inside header)
      const headerToggle = (ev)=>{
        const trg = ev.target;
        if (trg.closest && (trg.closest('#quickEntryBar') || trg.closest('button') || trg.closest('input') || trg.closest('a'))) return;
        const bodyNow = $body(t.id);
        const nowCollapsed = bodyNow && bodyNow.style.display !== 'none' ? true : false;
        setCollapsed(nowCollapsed);
      };
      headerEl.style.cursor = 'pointer';
      headerEl.title = 'Click to expand/collapse';
      headerEl.addEventListener('click', headerToggle);
      headerEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); headerToggle(e); } });
      if (t.id==='addEntryCard') ensureQuickEntryControls(headerEl);
    }
    // removed global Collapse All in favor of Focus Mode
    // expose helpers for Focus Mode
  window.__collapse_targets = targets.map(t=> t.id);
  window.__collapse_set = setSectionCollapsed;
}

  // Focus Mode: collapse everything except snapshot tiles
  function applyFocusMode(){
    try{
      const btn = document.getElementById('btnFocusMode');
      const enabled = !!(FLAGS && FLAGS.collapsedUi);
      if (!btn) return;
      if (!enabled){ btn.style.display='none'; return; }
      btn.style.display='';
      const on = !!(FLAGS && FLAGS.focusMode);
      btn.textContent = `Focus Mode: ${on?'On':'Off'}`;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.onclick = ()=>{
        FLAGS.focusMode = !FLAGS.focusMode; saveFlags(FLAGS);
        applyFocusMode();
      };
      const targets = window.__collapse_targets || [];
      if (!targets.length) return;
      if (on){
        targets.forEach(id=>{
          if (id==='snapshotCard') return;
          try{ (window.__collapse_set||(()=>{}))(id, true); }catch(_){ }
        });
      } else {
        // Leave sections as-is when Focus Mode is off to preserve user + default collapsed states
      }
    }catch(_){ /* no-op */ }
  }

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
    applyCollapsedUi();
    applyRecentEntriesAutoCollapse();
    applyFocusMode();
  })();

  console.log('Route Stats loaded —', VERSION_TAG);

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

  
