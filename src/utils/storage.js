// LocalStorage adapters and baseline helpers used by multiple features.
import { DateTime, ZONE, startOfWeekMonday, endOfWeekSunday } from './date.js';

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

const DEFAULT_EVAL_PROFILE = {
  profileId:'eval-default',
  label:'Default Evaluation',
  routeId:'R1',
  evalCode:'44K',
  boxes:670,
  stops:null,
  hoursPerDay:9.4,
  officeHoursPerDay:2.0,
  annualSalary:68000,
  effectiveFrom:null,
  effectiveTo:null
};

const EMPTY_VACATION = { ranges: [] };

let evalProfileCounter = 0;

function generateEvalProfileId(){
  evalProfileCounter = (evalProfileCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `eval-${Date.now().toString(36)}-${evalProfileCounter.toString(36)}`;
}

function toNumberOrNull(value){
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeDateValue(value){
  if (value === '' || value === null || value === undefined) return null;
  try{
    const iso = String(value).trim();
    if (!iso) return null;
    const dt = DateTime.fromISO(iso, { zone: ZONE });
    if (!dt.isValid) return null;
    return dt.toISODate();
  }catch(_){
    return null;
  }
}

function sanitizeEvalProfile(input, fallback){
  const base = { ...DEFAULT_EVAL_PROFILE, ...(fallback || {}) };
  const merged = { ...base, ...(input || {}) };
  const providedId = typeof merged.profileId === 'string' && merged.profileId.trim()
    ? merged.profileId.trim()
    : (typeof merged.id === 'string' && merged.id.trim() ? merged.id.trim() : null);
  const profileId = providedId || generateEvalProfileId();
  const routeId = typeof merged.routeId === 'string' && merged.routeId.trim()
    ? merged.routeId.trim()
    : base.routeId;
  const evalCode = typeof merged.evalCode === 'string' && merged.evalCode.trim()
    ? merged.evalCode.trim()
    : base.evalCode;
  const labelSource = typeof merged.label === 'string' && merged.label.trim()
    ? merged.label.trim()
    : (typeof merged.name === 'string' && merged.name.trim() ? merged.name.trim() : null);
  const fallbackLabelPieces = [routeId, evalCode].filter(Boolean);
  const label = labelSource || (fallbackLabelPieces.length ? fallbackLabelPieces.join(' ') : 'Evaluation');

  return {
    profileId,
    label,
    routeId,
    evalCode,
    boxes: toNumberOrNull(merged.boxes),
    stops: toNumberOrNull(merged.stops),
    hoursPerDay: toNumberOrNull(merged.hoursPerDay),
    officeHoursPerDay: toNumberOrNull(merged.officeHoursPerDay),
    annualSalary: toNumberOrNull(merged.annualSalary),
    effectiveFrom: normalizeDateValue(merged.effectiveFrom ?? merged.from),
    effectiveTo: normalizeDateValue(merged.effectiveTo ?? merged.to)
  };
}

function sanitizeEvalProfileList(list){
  if (!Array.isArray(list) || !list.length){
    return [sanitizeEvalProfile(DEFAULT_EVAL_PROFILE)];
  }
  const seen = new Set();
  const out = [];
  for (const item of list){
    const sanitized = sanitizeEvalProfile(item);
    if (seen.has(sanitized.profileId)) continue;
    seen.add(sanitized.profileId);
    out.push(sanitized);
  }
  if (!out.length) out.push(sanitizeEvalProfile(DEFAULT_EVAL_PROFILE));
  return out;
}

function legacyEvalPayload(profile){
  if (!profile) return {};
  const {
    routeId,
    evalCode,
    boxes,
    stops,
    hoursPerDay,
    officeHoursPerDay,
    annualSalary,
    effectiveFrom,
    effectiveTo,
    profileId,
    label
  } = profile;
  return {
    routeId,
    evalCode,
    boxes,
    stops,
    hoursPerDay,
    officeHoursPerDay,
    annualSalary,
    effectiveFrom,
    effectiveTo,
    profileId,
    label
  };
}

export function loadFlags(){
  try{
    return Object.assign({}, DEFAULT_FLAGS, JSON.parse(localStorage.getItem(FLAG_KEY) || '{}'));
  }catch(_){
    return { ...DEFAULT_FLAGS };
  }
}

export function saveFlags(flags){
  localStorage.setItem(FLAG_KEY, JSON.stringify(flags));
}

export function loadEvalProfiles(){
  try{
    const raw = localStorage.getItem(EVAL_PROFILES_KEY);
    if (raw){
      const parsed = JSON.parse(raw);
      const list = sanitizeEvalProfileList(parsed);
      if (list.length){
        return list.map(p => ({ ...p }));
      }
    }
  }catch(_){ /* ignore parse error */ }
  try{
    const legacyRaw = localStorage.getItem(EVAL_KEY);
    if (legacyRaw){
      const legacyParsed = JSON.parse(legacyRaw);
      return sanitizeEvalProfileList([legacyParsed]).map(p => ({ ...p }));
    }
  }catch(_){ /* ignore legacy parse */ }
  return sanitizeEvalProfileList([DEFAULT_EVAL_PROFILE]).map(p => ({ ...p }));
}

export function saveEvalProfiles(profiles){
  try{
    const sanitized = sanitizeEvalProfileList(profiles);
    localStorage.setItem(EVAL_PROFILES_KEY, JSON.stringify(sanitized));
  }catch(_){
    // ignore storage errors
  }
}

export function getActiveEvalId(){
  try{
    const raw = localStorage.getItem(ACTIVE_EVAL_ID_KEY);
    if (typeof raw === 'string'){
      const trimmed = raw.trim();
      return trimmed ? trimmed : null;
    }
    return null;
  }catch(_){
    return null;
  }
}

export function setActiveEvalId(id){
  try{
    if (!id){
      localStorage.removeItem(ACTIVE_EVAL_ID_KEY);
    } else {
      localStorage.setItem(ACTIVE_EVAL_ID_KEY, id);
    }
  }catch(_){
    // ignore storage errors
  }
}

export function loadEval(){
  try{
    const profiles = loadEvalProfiles();
    let activeId = getActiveEvalId();
    let active = profiles.find(p => p.profileId === activeId);
    if (!active){
      active = profiles[0] || sanitizeEvalProfile(DEFAULT_EVAL_PROFILE);
      if (active) setActiveEvalId(active.profileId);
    }
    return active ? { ...active } : { ...sanitizeEvalProfile(DEFAULT_EVAL_PROFILE) };
  }catch(_){
    return { ...sanitizeEvalProfile(DEFAULT_EVAL_PROFILE) };
  }
}

export function saveEval(cfg){
  try{
    const sanitized = sanitizeEvalProfile(cfg);
    const profiles = loadEvalProfiles();
    const idx = profiles.findIndex(p => p.profileId === sanitized.profileId);
    if (idx >= 0) profiles[idx] = sanitized;
    else profiles.push(sanitized);
    saveEvalProfiles(profiles);
    setActiveEvalId(sanitized.profileId);
    localStorage.setItem(EVAL_KEY, JSON.stringify(legacyEvalPayload(sanitized)));
  }catch(_){
    try{
      localStorage.setItem(EVAL_KEY, JSON.stringify(cfg || {}));
    }catch(__){
      // ignore storage errors
    }
  }
}

export function deleteEvalProfile(profileId){
  if (!profileId) return loadEvalProfiles();
  try{
    let profiles = loadEvalProfiles().filter(p => p.profileId !== profileId);
    if (!profiles.length){
      profiles = [sanitizeEvalProfile(DEFAULT_EVAL_PROFILE)];
    }
    saveEvalProfiles(profiles);
    const activeId = getActiveEvalId();
    if (activeId === profileId){
      const nextActive = profiles[0]?.profileId || null;
      if (nextActive){
        setActiveEvalId(nextActive);
        localStorage.setItem(EVAL_KEY, JSON.stringify(legacyEvalPayload(profiles[0])));
      } else {
        setActiveEvalId(null);
        localStorage.removeItem(EVAL_KEY);
      }
    }
    return profiles.map(p => ({ ...p }));
  }catch(_){
    return loadEvalProfiles();
  }
}

export function createEvalProfile(partial={}){
  return sanitizeEvalProfile({ ...DEFAULT_EVAL_PROFILE, profileId:null, ...(partial || {}) });
}

export function loadVacation(){
  try{
    const v = JSON.parse(localStorage.getItem(VACAY_KEY) || '{}');
    const ranges = Array.isArray(v?.ranges) ? v.ranges : [];
    return { ranges: ranges.filter(r => r?.from && r?.to) };
  }catch(_){
    return { ...EMPTY_VACATION };
  }
}

export function saveVacation(cfg){
  try{
    localStorage.setItem(VACAY_KEY, JSON.stringify({ ranges: cfg.ranges || [] }));
  }catch(_){
    // ignore storage errors
  }
}

export function ensureWeeklyBaselines(rows){
  try{
    const now = DateTime.now().setZone(ZONE);
    const weekStartIso = startOfWeekMonday(now).toISODate();
    const savedRaw = localStorage.getItem(BASELINE_KEY);
    if (savedRaw){
      const saved = JSON.parse(savedRaw);
      if (saved && saved.weekStart === weekStartIso) return saved;
    }
    const startLast = startOfWeekMonday(now.minus({weeks:1}));
    const endLast   = endOfWeekSunday(now.minus({weeks:1}));
    const startPrev = startOfWeekMonday(now.minus({weeks:2}));
    const endPrev   = endOfWeekSunday(now.minus({weeks:2}));
    const inRange=(r,from,to)=>{
      const d=DateTime.fromISO(r.work_date,{zone:ZONE});
      return d>=from && d<=to;
    };
    const worked = (rows||[]).filter(r=> r?.status !== 'off');
    const W1 = worked.filter(r=> inRange(r,startLast,endLast));
    const W2 = worked.filter(r=> inRange(r,startPrev,endPrev));
    const byW = (arr,fn)=>{
      const out = Array.from({length:7},()=>[]);
      arr.forEach(r=>{
        const d=DateTime.fromISO(r.work_date,{zone:ZONE});
        const idx=(d.weekday+6)%7;
        out[idx].push(fn(r)||0);
      });
      return out;
    };
    const pW1 = byW(W1, r=> +r.parcels||0);
    const pW2 = byW(W2, r=> +r.parcels||0);
    const lW1 = byW(W1, r=> +r.letters||0);
    const lW2 = byW(W2, r=> +r.letters||0);
    const mean = arr=> arr.length? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    const parcels = Array.from({length:7},(_,i)=> mean([...(pW1[i]||[]), ...(pW2[i]||[])]));
    const letters = Array.from({length:7},(_,i)=> mean([...(lW1[i]||[]), ...(lW2[i]||[])]));
    const snap = { weekStart: weekStartIso, parcels, letters };
    localStorage.setItem(BASELINE_KEY, JSON.stringify(snap));
    return snap;
  }catch(_){
    return null;
  }
}

export function getWeeklyBaselines(){
  try{
    return JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null');
  }catch(_){
    return null;
  }
}

export function computeAnchorBaselines(rows, weeks=8){
  try{
    const now = DateTime.now().setZone(ZONE);
    const worked = (rows||[]).filter(r=> r?.status !== 'off');
    const weeksArr = [];
    for (let w=1; w<=weeks; w++){
      const s = startOfWeekMonday(now.minus({weeks:w}));
      const e = endOfWeekSunday(now.minus({weeks:w}));
      weeksArr.push({s,e});
    }
    const perW = (fn)=>{
      const arrs = Array.from({length:7},()=>[]);
      for (const wk of weeksArr){
        const set = worked.filter(r=>{
          const d=DateTime.fromISO(r.work_date,{zone:ZONE});
          return d>=wk.s && d<=wk.e;
        });
        const tmp = Array.from({length:7},()=>0);
        set.forEach(r=>{
          const d=DateTime.fromISO(r.work_date,{zone:ZONE});
          const idx=(d.weekday+6)%7;
          tmp[idx]+= (fn(r)||0);
        });
        for (let i=0;i<7;i++) arrs[i].push(tmp[i]);
      }
      const med = arrs.map(a=>{
        const b=[...a].sort((x,y)=>x-y);
        const n=b.length;
        if(!n) return null;
        const mid=Math.floor(n/2);
        return n%2 ? b[mid] : (b[mid-1]+b[mid])/2;
      });
      return med;
    };
    return {
      parcels: perW(r=> +r.parcels||0),
      letters: perW(r=> +r.letters||0)
    };
  }catch(_){
    return null;
  }
}

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

export function loadDismissedResiduals(parseDismissReasonInput){
  try{
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
        if (Array.isArray(item.tags)){
          sourceTags = item.tags;
        } else if (item.reason){
          if (typeof parseDismissReasonInput === 'function'){
            const parsedReasonTags = parseDismissReasonInput(item.reason) || [];
            if (parsedReasonTags.length){
              sourceTags = parsedReasonTags.map(tag => ({
                reason: tag.reason,
                minutes: tag.minutes,
                notedAt: item.notedAt
              }));
            } else {
              sourceTags = [{ reason:item.reason, minutes:item.minutes, notedAt:item.notedAt }];
            }
          } else {
            sourceTags = [{ reason:item.reason, minutes:item.minutes, notedAt:item.notedAt }];
          }
        }
        const tags = sourceTags
          .map(tag => {
            if (!tag) return null;
            const reason = String(tag.reason || '').trim();
            if (!reason) return null;
            const minutes = (tag.minutes!=null && tag.minutes!=='') ? Number(tag.minutes) : null;
            const notedAt = tag.notedAt || item.notedAt || new Date().toISOString();
            return { reason, minutes: Number.isFinite(minutes) ? minutes : null, notedAt };
          })
          .filter(Boolean);
        return tags.length ? { iso, tags } : null;
      })
      .filter(Boolean);
  }catch(_){
    return [];
  }
}

export function saveDismissedResiduals(list){
  try{
    localStorage.setItem(RESIDUAL_DISMISS_KEY, JSON.stringify(list || []));
  }catch(_){
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

export function loadTokenUsage(){
  try{
    const raw = localStorage.getItem(TOKEN_USAGE_STORAGE);
    const now = DateTime.now().setZone(ZONE);
    const today = now.toISODate();
    const weekStart = startOfWeekMonday(now).toISODate();
    const monthKey = now.toFormat('yyyy-MM');
    if (!raw) return { today:0, week:0, month:0, monthlyLimit:null, todayDate:today, weekStart, monthKey };
    const parsed = JSON.parse(raw) || {};
    const usage = {
      today: Number(parsed.today) || 0,
      week: Number(parsed.week) || 0,
      month: Number(parsed.month) || 0,
      monthlyLimit: (parsed.monthlyLimit!==undefined && parsed.monthlyLimit!==null) ? Number(parsed.monthlyLimit) : null,
      todayDate: parsed.todayDate || today,
      weekStart: parsed.weekStart || weekStart,
      monthKey: parsed.monthKey || monthKey
    };
    if (usage.todayDate !== today){ usage.today = 0; usage.todayDate = today; }
    if (usage.weekStart !== weekStart){ usage.week = 0; usage.weekStart = weekStart; }
    if (usage.monthKey !== monthKey){ usage.month = 0; usage.monthKey = monthKey; }
    return usage;
  }catch(_){
    const now = DateTime.now().setZone(ZONE);
    return {
      today:0,
      week:0,
      month:0,
      monthlyLimit:null,
      todayDate: now.toISODate(),
      weekStart: startOfWeekMonday(now).toISODate(),
      monthKey: now.toFormat('yyyy-MM')
    };
  }
}

export function saveTokenUsage(obj){
  try{
    localStorage.setItem(TOKEN_USAGE_STORAGE, JSON.stringify(obj || {}));
  }catch(_){
    // ignore storage errors
  }
}
