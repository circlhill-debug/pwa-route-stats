// LocalStorage adapters and baseline helpers used by multiple features.
import { DateTime, ZONE, startOfWeekMonday, endOfWeekSunday } from './date.js';

export const FLAG_KEY = 'routeStats.flags.v1';
export const EVAL_KEY = 'routeStats.uspsEval.v1';
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

const DEFAULT_EVAL = {
  routeId:'R1',
  evalCode:'44K',
  boxes:670,
  stops:null,
  hoursPerDay:9.4,
  officeHoursPerDay:2.0,
  annualSalary:68000
};

const EMPTY_VACATION = { ranges: [] };

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

export function loadEval(){
  try{
    return Object.assign({}, DEFAULT_EVAL, JSON.parse(localStorage.getItem(EVAL_KEY) || '{}'));
  }catch(_){
    return { ...DEFAULT_EVAL };
  }
}

export function saveEval(cfg){
  localStorage.setItem(EVAL_KEY, JSON.stringify(cfg || {}));
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
