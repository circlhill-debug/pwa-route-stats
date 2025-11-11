// LocalStorage adapters and baseline helpers used by multiple features.
import { DateTime, ZONE, startOfWeekMonday, endOfWeekSunday } from './date.js';
import { TAGS } from '../features/tagLibrary.js';

export const FLAG_KEY = 'routeStats.flags.v1';
export const EVAL_KEY = 'routeStats.uspsEval.v1';
export const EVAL_PROFILES_KEY = 'routeStats.uspsEvalProfiles.v1';
export const ACTIVE_EVAL_ID_KEY = 'routeStats.uspsEval.activeId.v1';
export const VACAY_KEY = 'routeStats.vacation.v1';
export const BASELINE_KEY = 'routeStats.baseline.v1';
export const MODEL_SCOPE_KEY = 'routeStats.modelScope';
export const RESIDUAL_WEIGHT_PREF_KEY = 'routeStats.residual.downweightHoliday';
export const RESIDUAL_DISMISS_KEY = 'routeStats.diagnostics.dismissed';
export const OPENAI_KEY_STORAGE = 'routeStats.ai.openaiKey';
export const AI_LAST_SUMMARY_KEY = 'routeStats.ai.lastSummary';
export const AI_SUMMARY_COLLAPSED_KEY = 'routeStats.ai.summaryCollapsed';
export const TOKEN_USAGE_STORAGE = 'routeStats.ai.tokenUsage';
export const AI_BASE_PROMPT_KEY = 'routeStats.ai.basePrompt';

const REASON_TO_TAG_ID_MAP = {
  'heavy parcels': 'workload-heavy-parcels',
  'heavy letters': 'workload-heavy-letters',
  'late start': 'workload-late-start',
  'vehicle issue': 'workload-vehicle-issue',
  'sick': 'personal-sick',
  'appointment': 'personal-appointment',
  'holiday': 'other-holiday',
  'rain': 'weather-rain',
  'snow': 'weather-snow',
  'heat': 'weather-heat',
  'cold': 'weather-cold',
};

const DEFAULT_FLAGS = {
  weekdayTicks:true,
  progressivePills:false,
  monthlyGlance:true,
  holidayAdjustments:true,
  trendPills:false,
  sameRangeTotals:true,
  quickFilter:true,
  headlineDigest:false,
  smartSummary:true,
  mixViz:true,
  baselineCompare:true,
  collapsedUi:false,
  focusMode:false,
  quickEntry:false,
  uspsEval:true,
  dayCompare:true
};

export function getModelScope(){
  try{
    const v = localStorage.getItem(MODEL_SCOPE_KEY);
    return (v === 'all' || v === 'rolling') ? v : 'rolling';
  }catch(_){
    return 'rolling';
  }
}

export function setModelScope(v){
  try{
    localStorage.setItem(MODEL_SCOPE_KEY, v);
  }catch(_){
    // ignore storage errors
  }
}

export function loadDismissedResiduals() {
  try {
    const raw = localStorage.getItem(RESIDUAL_DISMISS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const iso = item.iso || item.date || null;
        if (!iso) return null;
        let sourceTags = [];
        if (Array.isArray(item.tags)) {
          sourceTags = item.tags;
        } else if (item.reason) {
          // Backward compatibility for old string reasons
          const reason = String(item.reason || '').trim().toLowerCase();
          const tagId = REASON_TO_TAG_ID_MAP[reason];
          if (tagId) {
            sourceTags = [{
              id: tagId,
              minutes: item.minutes,
              notedAt: item.notedAt
            }];
          } else {
            // If no mapping found, create a custom tag
            sourceTags = [{
              id: `custom-${reason.replace(/\s+/g, '-')}`,
              label: item.reason,
              minutes: item.minutes,
              notedAt: item.notedAt
            }];
          }
        }
        const tags = sourceTags
          .map(tag => {
            if (!tag) return null;
            const id = String(tag.id || '').trim();
            if (!id) return null;
            const minutes = (tag.minutes != null && tag.minutes !== '') ? Number(tag.minutes) : null;
            const notedAt = tag.notedAt || item.notedAt || new Date().toISOString();
            const tagData = { id, minutes: Number.isFinite(minutes) ? minutes : null, notedAt };
            if (tag.label) {
              tagData.label = tag.label;
            }
            return tagData;
          })
          .filter(Boolean);
        return tags.length ? { iso, tags } : null;
      })
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

export function saveDismissedResiduals(list) {
  try {
    const sanitizedList = (list || []).map(item => {
      if (!item || !item.iso || !Array.isArray(item.tags)) return null;
      const tags = item.tags.map(tag => {
        if (!tag || !tag.id) return null;
        const sanitizedTag = { id: tag.id };
        if (tag.minutes != null) {
          sanitizedTag.minutes = tag.minutes;
        }
        if (tag.notedAt) {
          sanitizedTag.notedAt = tag.notedAt;
        }
        if (tag.label) {
          sanitizedTag.label = tag.label;
        }
        return sanitizedTag;
      }).filter(Boolean);
      return { iso: item.iso, tags };
    }).filter(Boolean);
    localStorage.setItem(RESIDUAL_DISMISS_KEY, JSON.stringify(sanitizedList));
  } catch (_) {
    // ignore storage errors
  }
}

export function getOpenAiKey(){
  try{
    const val = localStorage.getItem(OPENAI_KEY_STORAGE);
    if (!val) return null;
    const trimmed = val.trim();
    return trimmed ? trimmed : null;
  }catch(_){
    return null;
  }
}

export function setOpenAiKey(val){
  try{
    if (val && val.trim()) localStorage.setItem(OPENAI_KEY_STORAGE, val.trim());
    else localStorage.removeItem(OPENAI_KEY_STORAGE);
  }catch(_){
    // ignore storage errors
  }
}

export function getAiBasePrompt(defaultPrompt){
  try{
    const val = localStorage.getItem(AI_BASE_PROMPT_KEY);
    if (!val) return defaultPrompt;
    const trimmed = val.trim();
    return trimmed ? trimmed : defaultPrompt;
  }catch(_){
    return defaultPrompt;
  }
}

export function setAiBasePrompt(val){
  try{
    if (val && val.trim()) localStorage.setItem(AI_BASE_PROMPT_KEY, val.trim());
    else localStorage.removeItem(AI_BASE_PROMPT_KEY);
  }catch(_){
    // ignore storage errors
  }
}

function tokenUsageDefaults(now){
  return {
    today: 0,
    week: 0,
    month: 0,
    monthlyLimit: null,
    todayDate: now.toISODate(),
    weekStart: startOfWeekMonday(now).toISODate(),
    monthKey: now.toFormat('yyyy-MM'),
    updatedAt: null
  };
}

function normalizeTokenUsageSource(source, now){
  const base = tokenUsageDefaults(now);
  if (!source || typeof source !== 'object') return { ...base };
  const out = { ...base };
  if (source.today !== undefined && source.today !== null && source.today !== ''){
    const val = Number(source.today);
    out.today = Number.isFinite(val) ? val : out.today;
  }
  if (source.week !== undefined && source.week !== null && source.week !== ''){
    const val = Number(source.week);
    out.week = Number.isFinite(val) ? val : out.week;
  }
  if (source.month !== undefined && source.month !== null && source.month !== ''){
    const val = Number(source.month);
    out.month = Number.isFinite(val) ? val : out.month;
  }
  if (source.monthlyLimit !== undefined && source.monthlyLimit !== null && source.monthlyLimit !== ''){
    const val = Number(source.monthlyLimit);
    out.monthlyLimit = Number.isFinite(val) ? val : out.monthlyLimit;
  } else if (source.monthlyLimit === null){
    out.monthlyLimit = null;
  }
  if (typeof source.todayDate === 'string' && source.todayDate.trim()){
    out.todayDate = source.todayDate;
  }
  if (typeof source.weekStart === 'string' && source.weekStart.trim()){
    out.weekStart = source.weekStart;
  }
  if (typeof source.monthKey === 'string' && source.monthKey.trim()){
    out.monthKey = source.monthKey;
  }
  if (source.updatedAt !== undefined && source.updatedAt !== null){
    if (typeof source.updatedAt === 'string' && source.updatedAt.trim()){
      const stamp = Date.parse(source.updatedAt);
      if (!Number.isNaN(stamp)){
        out.updatedAt = new Date(stamp).toISOString();
      }
    } else {
      out.updatedAt = null;
    }
  }
  return out;
}

function tokenUsageTimestamp(usage){
  if (!usage || typeof usage !== 'object') return 0;
  const stamp = Date.parse(usage.updatedAt || '');
  return Number.isNaN(stamp) ? 0 : stamp;
}

export function loadTokenUsage(){
  try{
    const raw = localStorage.getItem(TOKEN_USAGE_STORAGE);
    const now = DateTime.now().setZone(ZONE);
    const today = now.toISODate();
    const weekStart = startOfWeekMonday(now).toISODate();
    const monthKey = now.toFormat('yyyy-MM');
    let usage;
    let changed = false;
    if (raw){
      usage = normalizeTokenUsageSource(JSON.parse(raw) || {}, now);
    } else {
      usage = normalizeTokenUsageSource(null, now);
      changed = true;
    }
    if (usage.todayDate !== today){
      usage.today = 0;
      usage.todayDate = today;
      changed = true;
    }
    if (usage.weekStart !== weekStart){
      usage.week = 0;
      usage.weekStart = weekStart;
      changed = true;
    }
    if (usage.monthKey !== monthKey){
      usage.month = 0;
      usage.monthKey = monthKey;
      changed = true;
    }
    if (!usage.updatedAt){
      usage.updatedAt = new Date().toISOString();
      changed = true;
    }
    if (changed){
      localStorage.setItem(TOKEN_USAGE_STORAGE, JSON.stringify(usage));
    }
    return usage;
  }catch(_){
    const now = DateTime.now().setZone(ZONE);
    const usage = normalizeTokenUsageSource(null, now);
    usage.updatedAt = new Date().toISOString();
    try{
      localStorage.setItem(TOKEN_USAGE_STORAGE, JSON.stringify(usage));
    }catch(__){ /* ignore */ }
    return usage;
  }
}

export function saveTokenUsage(obj, options={}){
  const { preserveTimestamp=false } = options || {};
  try{
    const now = DateTime.now().setZone(ZONE);
    const usage = normalizeTokenUsageSource(obj || {}, now);
    if (!preserveTimestamp || !usage.updatedAt){
      usage.updatedAt = new Date().toISOString();
    }
    localStorage.setItem(TOKEN_USAGE_STORAGE, JSON.stringify(usage));
    return usage;
  }catch(_){
    // ignore storage errors
    return null;
  }
}

export function mergeTokenUsage(localUsage, incomingUsage){
  const now = DateTime.now().setZone(ZONE);
  const local = normalizeTokenUsageSource(localUsage || {}, now);
  const incoming = normalizeTokenUsageSource(incomingUsage || {}, now);
  const hasIncoming = incomingUsage && typeof incomingUsage === 'object';
  const hasLocal = localUsage && typeof localUsage === 'object';
  if (!hasIncoming && hasLocal) return { merged: local, source: 'local' };
  if (hasIncoming && !hasLocal) return { merged: incoming, source: 'incoming' };
  if (!hasIncoming && !hasLocal) return { merged: local, source: 'local' };
  const localStamp = tokenUsageTimestamp(local);
  const incomingStamp = tokenUsageTimestamp(incoming);
  if (incomingStamp > localStamp) return { merged: incoming, source: 'incoming' };
  if (incomingStamp < localStamp) return { merged: local, source: 'local' };
  const localScore = (local.month || 0) + (local.week || 0) + (local.today || 0);
  const incomingScore = (incoming.month || 0) + (incoming.week || 0) + (incoming.today || 0);
  if (incomingScore > localScore) return { merged: incoming, source: 'incoming' };
  if (incomingScore < localScore) return { merged: local, source: 'local' };
  return { merged: incoming, source: 'incoming' };
}
