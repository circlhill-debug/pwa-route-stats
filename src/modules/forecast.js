import { todayIso as getTodayIsoFromUtils } from '../utils/date.js';

// force global refresh hook
let __forceTrend = true;

const STEADY_MESSAGE = 'Steady outlook based on recent trends.';
const FORECAST_BADGE_STORAGE_KEYS = ['forecastBadgeData_v2', 'routeStats.forecastBadgeData_v2'];
const FORECAST_PRIMARY_STORAGE = FORECAST_BADGE_STORAGE_KEYS[FORECAST_BADGE_STORAGE_KEYS.length - 1];
const FORECAST_SNAPSHOT_TABLE = 'forecast_snapshots';
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_PLURALS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const FORECAST_PREAMBLES = ['Heads up:', 'Forecast Insight:', '📬 Tomorrow’s trend:'];
const METRIC_CONFIGS = [
  { key: 'totalTime', label: 'route time', aliases: ['total_time', 'totalMinutes', 'total_minutes', 'total'] },
  { key: 'officeTime', label: 'office time', aliases: ['office_time', 'officeMinutes', 'office_minutes', 'office'] },
  { key: 'endTime', label: 'end time', aliases: ['end_time', 'endMinutes', 'end_minutes', 'end'] }
];

export function getTodayISO() {
  try {
    return new Date().toISOString().split('T')[0];
  } catch (_) {
    return getTodayIsoFromUtils ? getTodayIsoFromUtils() : '';
  }
}

function loadTagHistory() {
  try {
    const raw = localStorage.getItem('routeStats.tagHistory');
    const history = raw ? JSON.parse(raw) : [];
    return Array.isArray(history) ? history.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function loadDailyData() {
  try {
    const raw = localStorage.getItem('routeStats.dailyData');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch (_) {
    return null;
  }
}

/* === Forecast Raw Loader (restored) ========================= */

function readForecastBadgeDataRaw() {
  try {
    const keys = [
      'forecastBadgeData_v2',
      'routeStats.forecastBadgeData_v2'
    ];

    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.error("[Forecast] read raw error:", err);
  }

  return [];
}

function setForecastBadgeData(list) {
  if (typeof localStorage === 'undefined') return;
  try {
    const json = JSON.stringify(list || []);
    localStorage.setItem(FORECAST_PRIMARY_STORAGE, json);
    const legacyKey = FORECAST_BADGE_STORAGE_KEYS[0];
    if (legacyKey && legacyKey !== FORECAST_PRIMARY_STORAGE) {
      localStorage.setItem(legacyKey, json);
    }
  } catch (_) {
    // ignore storage errors
  }
}

function minutesFromValue(value) {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num);
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const isoSource = snapshot.iso || snapshot.date || snapshot.work_date || snapshot.workDate;
  const iso = typeof isoSource === 'string' && isoSource ? isoSource : null;
  if (!iso) return null;
  const dt = new Date(iso);
  const weekdayCandidate = Number(snapshot.weekday);
  const weekday = Number.isFinite(weekdayCandidate) ? weekdayCandidate : (Number.isNaN(dt.getTime()) ? null : dt.getDay());
  const totalTime =
    minutesFromValue(
      snapshot.totalTime ??
        snapshot.total_time ??
        snapshot.total_minutes ??
        snapshot.totalMinutes ??
        snapshot.total
    ) ??
    (Number.isFinite(snapshot.hours) ? Math.round(Number(snapshot.hours) * 60) : null);
  const officeTime =
    minutesFromValue(
      snapshot.officeTime ??
        snapshot.office_time ??
        snapshot.office_minutes ??
        snapshot.officeMinutes
    ) ??
    (Number.isFinite(snapshot.office_hours) ? Math.round(Number(snapshot.office_hours) * 60) : null);
  const endTime = snapshot.endTime || snapshot.end_time || snapshot.return_time || null;
  let tags = [];
  if (Array.isArray(snapshot.tags)) {
    tags = snapshot.tags.filter(Boolean);
  } else if (Array.isArray(snapshot.tagHistory)) {
    tags = snapshot.tagHistory.filter(Boolean);
  }
  return {
    iso,
    weekday: weekday != null ? weekday : null,
    totalTime,
    officeTime,
    endTime,
    tags,
    user_id: snapshot.user_id || snapshot.userId || null
  };
}

export function loadForecastBadgeData() {
  const rawList = readForecastBadgeDataRaw();
  if (!rawList.length) return [];
  const byIso = new Map();
  rawList.forEach((item) => {
    const normalized = normalizeSnapshot(item);
    if (!normalized || !normalized.iso) return;
    byIso.set(normalized.iso, normalized);
  });
  return Array.from(byIso.values()).sort((a, b) => a.iso.localeCompare(b.iso));
}

export async function saveForecastSnapshot(snapshot, options = {}) {
  try {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized || !normalized.iso) return null;
    const existing = loadForecastBadgeData().filter((item) => item.iso !== normalized.iso);
    existing.push(normalized);
    existing.sort((a, b) => a.iso.localeCompare(b.iso));
    setForecastBadgeData(existing);
    const supabaseClient = options.supabaseClient;
    if (supabaseClient && normalized.user_id) {
      try {
        await supabaseClient
          .from(FORECAST_SNAPSHOT_TABLE)
          .upsert({
            user_id: normalized.user_id,
            iso: normalized.iso,
            weekday: normalized.weekday,
            total_time: normalized.totalTime,
            office_time: normalized.officeTime,
            end_time: normalized.endTime,
            tags: normalized.tags
          }, { onConflict: 'user_id,iso' });
      } catch (err) {
        if (!options.silent) console.warn('[Forecast] snapshot remote save failed', err);
      }
    }
    return normalized;
  } catch (err) {
    if (!options.silent) console.warn('[Forecast] snapshot save failed', err);
    return null;
  }
}

export async function syncForecastSnapshotsFromSupabase(supabaseClient, userId, options = {}) {
  if (!supabaseClient || !userId) return loadForecastBadgeData();
  try {
    const { data, error } = await supabaseClient
      .from(FORECAST_SNAPSHOT_TABLE)
      .select('iso, weekday, total_time, office_time, end_time, tags')
      .eq('user_id', userId)
      .order('iso', { ascending: true });
    if (error) throw error;
    const normalized = (data || [])
      .map((item) => normalizeSnapshot({ ...item, user_id: userId }))
      .filter(Boolean);
    setForecastBadgeData(normalized);
    return normalized;
  } catch (err) {
    if (!options.silent) console.warn('[Forecast] snapshot sync failed', err);
    throw err;
  }
}

function normalizeDow(value) {
  if (!Number.isFinite(value)) return null;
  const mod = value % 7;
  return mod < 0 ? mod + 7 : mod;
}
if (typeof window !== 'undefined') {
  window.normalizeDow = normalizeDow;
}
if (typeof globalThis !== 'undefined') {
  globalThis.normalizeDow = normalizeDow;
}

function extractDow(entry) {
  if (!entry) return null;
  const candidates = [
    entry.weekday,
    entry.weekDay,
    entry.dow,
    entry.day,
    entry.dayIndex,
    entry.day_of_week,
    entry.dayOfWeek
  ];
  for (const candidate of candidates) {
    const dow = normalizeDow(typeof candidate === 'string' ? Number(candidate) : candidate);
    if (Number.isFinite(dow)) return dow;
  }
  const iso = entry.iso || entry.date || entry.work_date || entry.workDate || entry.observed_at || entry.observedAt;
  if (iso) {
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).getDay();
    }
  }
  return null;
}
if (typeof window !== 'undefined') {
  window.extractDow = extractDow;
}
if (typeof globalThis !== 'undefined') {
  globalThis.extractDow = extractDow;
}

function entryTimestamp(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return index;
  const iso =
    entry.iso ||
    entry.date ||
    entry.work_date ||
    entry.workDate ||
    entry.observed_at ||
    entry.observedAt;
  if (iso) {
    const parsed = Date.parse(iso);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const numericCandidates = [
    entry.timestamp,
    entry.ts,
    entry.created_at,
    entry.updated_at,
    entry.createdAt,
    entry.updatedAt
  ];
  for (const candidate of numericCandidates) {
    const num = Number(candidate);
    if (Number.isFinite(num)) return num;
  }
  return index;
}
if (typeof window !== 'undefined') {
  window.entryTimestamp = entryTimestamp;
}
if (typeof globalThis !== 'undefined') {
  globalThis.entryTimestamp = entryTimestamp;
}

function getMetricValue(entry, config) {
  const keys = [config.key, ...(config.aliases || [])];
  for (const key of keys) {
    if (key == null) continue;
    const directVal = Number(entry[key]);
    if (Number.isFinite(directVal)) return directVal;
    if (typeof key === 'string') {
      const lower = key.toLowerCase();
      if (lower !== key) {
        const lowerVal = Number(entry[lower]);
        if (Number.isFinite(lowerVal)) return lowerVal;
      }
    }
  }
  return null;
}

function averageMetric(entries, config) {
  if (!entries || !entries.length) return null;
  let sum = 0;
  let count = 0;
  entries.forEach((entry) => {
    const val = getMetricValue(entry, config);
    if (Number.isFinite(val)) {
      sum += val;
      count += 1;
    }
  });
  if (!count) return null;
  return sum / count;
}
if (typeof window !== 'undefined') {
  window.averageMetric = averageMetric;
}
if (typeof globalThis !== 'undefined') {
  globalThis.averageMetric = averageMetric;
}

function classifyDelta(delta) {
  if (!Number.isFinite(delta)) return 'steady';
  if (delta > 15) return 'uptick';
  if (delta < -15) return 'dip';
  if (Math.abs(delta) <= 5) return 'steady';
  return delta >= 0 ? 'uptick' : 'dip';
}
if (typeof window !== 'undefined') {
  window.classifyDelta = classifyDelta;
}
if (typeof globalThis !== 'undefined') {
  globalThis.classifyDelta = classifyDelta;
}

function pickPreamble() {
  if (!FORECAST_PREAMBLES.length) return '';
  const idx = Math.floor(Math.random() * FORECAST_PREAMBLES.length);
  return FORECAST_PREAMBLES[idx];
}

function capitalize(label) {
  if (!label || typeof label !== 'string') return '';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatWeekdayPlural(dow) {
  if (!Number.isFinite(dow)) return 'days';
  return WEEKDAY_PLURALS[dow] || 'days';
}

function buildTrendForecast(dowRaw) {
  const loader =
    (typeof window !== 'undefined' && typeof window.loadForecastBadgeData === 'function')
      ? window.loadForecastBadgeData
      : loadForecastBadgeData;
  const badgeData = loader();
  return buildTrendForecast_core(dowRaw, badgeData);
}

function buildTrendForecast_core(targetDow, badgeData) {
  if (window.logToScreen) {
    window.logToScreen(`Forecast Engine: Received ${badgeData?.length || 0} total snapshots.`);
  }
  const dataList = Array.isArray(badgeData) ? badgeData : [];
  if (!dataList.length) {
    if (window.logToScreen) {
      window.logToScreen('Forecast Engine: Aborting. dataList is empty.');
    }
    return null;
  }
  const normalizedTarget =
    normalizeDow(typeof targetDow === 'number' ? targetDow : new Date(Date.now() + 864e5).getDay());
  if (normalizedTarget == null) return null;
  const matching = dataList
    .map((entry, index) => ({
      entry,
      dow: extractDow(entry),
      ts: entryTimestamp(entry, index)
    }))
    .filter((item) => item.dow === normalizedTarget)
    .sort((a, b) => a.ts - b.ts)
    .map((item) => item.entry);
  if (window.logToScreen) {
    window.logToScreen(`Forecast Engine: Found ${matching.length} matching snapshots for target DOW.`);
  }
  if (matching.length < 6) {
    if (window.logToScreen) {
      window.logToScreen(`Forecast Engine: Aborting trend forecast, need at least 6 matching snapshots.`);
    }
    return null;
  }
  const recent = matching.slice(-3);
  const prior = matching.slice(-6, -3);
  const deltas = METRIC_CONFIGS.map((config) => {
    const recentAvg = averageMetric(recent, config);
    const priorAvg = averageMetric(prior, config);
    if (!Number.isFinite(recentAvg) || !Number.isFinite(priorAvg) || priorAvg === 0) return null;
    return { config, delta: ((recentAvg - priorAvg) / priorAvg) * 100 };
  }).filter(Boolean);
  if (!deltas.length) return null;
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const focus = deltas[0];
  const classification = classifyDelta(focus.delta);
  if (classification === 'steady') {
    return 'Steady pace, no major shifts detected.';
  }
  const direction = focus.delta >= 0 ? 'increase' : 'decrease';
  const percentShift = `${Math.abs(Math.round(focus.delta))}%`;
  const preamble = pickPreamble();
  const weekdayPlural = formatWeekdayPlural(normalizedTarget);
  const metricLabel = capitalize(focus.config.label || 'route time');
  return `${preamble} Expect a modest ${direction} in route time. ${metricLabel} has shifted ${percentShift} compared to recent ${weekdayPlural}.`;
}
if (typeof window !== 'undefined') {
  window.buildTrendForecast = buildTrendForecast;
}
if (typeof globalThis !== 'undefined') {
  globalThis.buildTrendForecast = buildTrendForecast;
}
if (typeof window !== 'undefined') {
  window.buildTrendForecast = buildTrendForecast;
}
if (typeof globalThis !== 'undefined') {
  globalThis.buildTrendForecast = buildTrendForecast;
}

function deriveTagHistoryFromSnapshots(snapshots) {
  if (!Array.isArray(snapshots)) return [];
  return snapshots
    .map((snap) => {
      if (!snap || !snap.iso) return null;
      const tags = Array.isArray(snap.tags) ? snap.tags.filter(Boolean) : [];
      if (!tags.length) return null;
      return { iso: snap.iso, tags };
    })
    .filter(Boolean);
}
if (typeof window !== 'undefined') {
  window.flattenTagStrings = flattenTagStrings;
  window.averageMetric = averageMetric;
  window.classifyDelta = classifyDelta;
  window.extractDow = extractDow;
  window.entryTimestamp = entryTimestamp;
  window.normalizeDow = normalizeDow;
}
if (typeof globalThis !== 'undefined') {
  globalThis.flattenTagStrings = flattenTagStrings;
  globalThis.averageMetric = averageMetric;
  globalThis.classifyDelta = classifyDelta;
  globalThis.extractDow = extractDow;
  globalThis.entryTimestamp = entryTimestamp;
  globalThis.normalizeDow = normalizeDow;
}

function flattenTagStrings(history, targetDow) {
  if (!Array.isArray(history)) return [];
  const entriesForDay = history
    .filter((entry) => {
      if (!entry) return false;
      const iso = entry.iso || entry.date;
      if (!iso) return false;
      const entryDate = new Date(iso);
      if (Number.isNaN(entryDate.getTime())) return false;
      return entryDate.getDay() === targetDow;
    })
    .sort((a, b) => {
      const aDate = new Date(a.iso || a.date || 0).getTime();
      const bDate = new Date(b.iso || b.date || 0).getTime();
      return aDate - bDate;
    });

  const latestByType = new Map();
  const normalizeTag = (tagValue) => {
    if (typeof tagValue === 'string') return tagValue;
    if (tagValue && typeof tagValue.tag === 'string') return tagValue.tag;
    if (tagValue && tagValue.reason) {
      const minutes = Number(tagValue.minutes);
      if (Number.isFinite(minutes)) return `${tagValue.reason}+${minutes}`;
      return String(tagValue.reason);
    }
    return null;
  };

  entriesForDay.forEach((entry) => {
    if (!entry || !Array.isArray(entry.tags)) return;
    entry.tags.forEach((rawTag) => {
      const tagString = normalizeTag(rawTag);
      if (!tagString) return;
      const [rawType] = tagString.split('+');
      const type = (rawType || '').trim().toLowerCase();
      if (!type) return;
      latestByType.set(type, tagString);
    });
  });

  return Array.from(latestByType.values());
}
if (typeof window !== 'undefined') {
  window.flattenTagStrings = flattenTagStrings;
}
if (typeof globalThis !== 'undefined') {
  globalThis.flattenTagStrings = flattenTagStrings;
}

function generateForecastFromDailyData(dailyData) {
  if (!dailyData || typeof dailyData !== 'object') return null;
  const summaries = [];
  const flats = Number(dailyData.flats);
  const parcels = Number(dailyData.parcels);
  const letters = Number(dailyData.letters);
  if (Number.isFinite(flats) && flats > 125) summaries.push('heavier flats today');
  if (Number.isFinite(parcels) && parcels > 85) summaries.push('higher parcel volume');
  if (Number.isFinite(letters) && letters > 400) summaries.push('letter load above average');
  if (!summaries.length) return null;
  return `Expect a longer day due to ${summaries.join(' and ')}.`;
}

function parseTagString(tagString) {
  try {
    const arr = JSON.parse(tagString);
    if (!Array.isArray(arr)) return [];
    return arr.map(t => ({
      reason: t.reason || "unknown",
      minutes: Number(t.minutes) || 0
    }));
  } catch {
    return [];
  }
}

export function generateForecastText(tagHistory, targetDow) {
  const allTags = Array.isArray(tagHistory) ? flattenTagStrings(tagHistory, targetDow) : [];
  let dominantTag = null;
  const summaries = [];

  allTags.forEach((tagStr) => {
    const parsedEntries = parseTagString(tagStr);
    if (!parsedEntries.length) return;

    const labelMap = {
      break: "planned break",
      flats: "flats volume",
      parcels: "parcel load",
      letters: "letter count",
      "second-trip": "second trip",
      detour: "route detour",
      load: "loading time"
    };

    parsedEntries.forEach((entry) => {
      const type = String(entry.reason || 'unknown').toLowerCase();
      const minutes = Number(entry.minutes) || 0;

      if (!dominantTag || Math.abs(minutes) > Math.abs(dominantTag.minutes)) {
        dominantTag = { type, minutes };
      }

      const label = labelMap[type] || type;
      if (minutes > 0) {
        summaries.push(`${label} increase (+${minutes} min)`);
      } else if (minutes < 0) {
        summaries.push(`${label} decrease (${Math.abs(minutes)} min)`);
      }
    });
  });

  if (dominantTag && Math.abs(dominantTag.minutes) >= 20) {
    const polarity = dominantTag.minutes > 0 ? 'longer' : 'shorter';
    const absMin = Math.abs(dominantTag.minutes);
    const cause = dominantTag.type;
    return `📬 Tomorrow’s trend: Expect about ${absMin} minutes ${polarity} than usual due to ${cause} change.`;
  }

  const trendForecast = buildTrendForecast(targetDow);
  if (trendForecast) {
    return trendForecast;
  }

  return STEADY_MESSAGE;
}
if (typeof window !== 'undefined') {
  window.generateForecastText_modern = generateForecastText;
}

export function computeForecastText(options = {}) {
  const badgeSnapshots = loadForecastBadgeData();
  const derivedHistory = deriveTagHistoryFromSnapshots(badgeSnapshots);
  const history = Array.isArray(options.tagHistory)
    ? options.tagHistory
    : (derivedHistory.length ? derivedHistory : loadTagHistory());
  const targetDow = typeof options.targetDow === 'number' ? options.targetDow : null;
  const fallbackDow = new Date(Date.now() + 864e5).getDay();
  const weekday = targetDow != null ? targetDow : fallbackDow;
  const tagText = generateForecastText(history, weekday);
  if (tagText && tagText !== STEADY_MESSAGE) return tagText;
  const dailyData = options.dailyData || loadDailyData();
  const fallback = generateForecastFromDailyData(dailyData);
  if (fallback) return fallback;
  return tagText || STEADY_MESSAGE;
}

export function storeForecastSnapshot(dateString = getTodayISO(), forecastText) {
  if (!forecastText || !dateString) return;
  try {
    const existing = JSON.parse(localStorage.getItem('forecastSnapshots') || '{}');
    existing[dateString] = forecastText;
    localStorage.setItem('forecastSnapshots', JSON.stringify(existing));
    localStorage.setItem('routeStats.latestForecast_v2', JSON.stringify({
      iso: dateString,
      text: forecastText,
      updatedAt: new Date().toISOString()
    }));
  } catch (_) {
    // ignore storage errors
  }
}

export function loadLatestForecastMessage() {
  try {
    const raw = localStorage.getItem('routeStats.latestForecast_v2');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.text || !parsed.iso) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.generateForecastText = (tagHistory) => {
    const fallbackDow = new Date(Date.now() + 864e5).getDay();
    return generateForecastText(tagHistory || loadTagHistory(), fallbackDow);
  };
  window.loadForecastBadgeData = loadForecastBadgeData;
  window.buildTrendForecast = (dow) => {
    const loader = window.loadForecastBadgeData || loadForecastBadgeData;
    const data = loader();
    return buildTrendForecast_core(dow, data);
  };
  window.generateForecastText_modern = generateForecastText;
  window.computeForecastText = (options = {}) => computeForecastText(options);
  window.saveForecastSnapshot = saveForecastSnapshot;
  window.syncForecastSnapshotsFromSupabase = syncForecastSnapshotsFromSupabase;
  window.__debugForecast = {
    buildTrendForecast: window.buildTrendForecast,
    generateForecastText,
    computeForecastText,
    loadForecastBadgeData: window.loadForecastBadgeData,
    saveForecastSnapshot,
    syncForecastSnapshotsFromSupabase
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.computeForecastText = computeForecastText;
  globalThis.generateForecastText = generateForecastText;
  globalThis.loadForecastBadgeData = loadForecastBadgeData;
  globalThis.saveForecastSnapshot = saveForecastSnapshot;
  globalThis.syncForecastSnapshotsFromSupabase = syncForecastSnapshotsFromSupabase;
  globalThis.buildTrendForecast = buildTrendForecast;
}

if (typeof window !== 'undefined') {
  window.buildTrendForecast = buildTrendForecast;
  window.loadForecastBadgeData = loadForecastBadgeData;
}
