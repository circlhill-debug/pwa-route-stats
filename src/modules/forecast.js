import { todayIso as getTodayIsoFromUtils, DateTime, ZONE } from '../utils/date.js';

const STEADY_MESSAGE = 'Steady outlook based on recent trends.';

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

function flattenTagStrings(history, targetDow) {
  if (!Array.isArray(history)) return [];
  const entriesForDay = history
    .filter((entry) => {
      if (!entry) return false;
      const iso = entry.iso || entry.date;
      if (!iso) return false;
      const entryDow = DateTime.fromISO(iso, { zone: ZONE }).weekday;
      if (!entryDow) return false;
      const entryJsDow = entryDow === 7 ? 0 : entryDow;
      return entryJsDow === targetDow;
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

export function generateForecastText(tagHistory, targetDow) {
  const allTags = Array.isArray(tagHistory) ? flattenTagStrings(tagHistory, targetDow) : [];
  const summaries = [];

  allTags.forEach((tagStr) => {
    if (typeof tagStr !== 'string') {
      summaries.push('an unknown factor (+some time)');
      return;
    }
    const [typeRaw, timeStr] = tagStr.split('+');
    const type = (typeRaw || '').trim();
    const minutes = parseInt((timeStr || '').trim(), 10);
    if (!type || Number.isNaN(minutes)) {
      summaries.push('an unknown factor (+some time)');
      return;
    }
    switch (type) {
      case 'break':
        summaries.push(`a planned break (+${minutes} min)`);
        break;
      case 'flats':
        summaries.push(`a heavy flats day (+${minutes} min)`);
        break;
      case 'parcels':
        summaries.push(`extra parcels (+${minutes} min)`);
        break;
      case 'letters':
        summaries.push(`a large number of letters (+${minutes} min)`);
        break;
      case 'second-trip':
        summaries.push(`a second trip (+${minutes} min)`);
        break;
      case 'detour':
        summaries.push(`a route detour (+${minutes} min)`);
        break;
      case 'load':
        summaries.push(`loading time (+${minutes} min)`);
        break;
      default:
        summaries.push(`an unknown tag: "${type}" (+${minutes} min)`);
    }
  });

  if (!summaries.length) return STEADY_MESSAGE;
  return `Expect a longer day due to ${summaries.join(' and ')}.`;
}

export function computeForecastText(options = {}) {
  const history = Array.isArray(options.tagHistory) ? options.tagHistory : loadTagHistory();
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
    localStorage.setItem('routeStats.latestForecast', JSON.stringify({
      iso: dateString,
      text: forecastText,
      updatedAt: new Date().toISOString()
    }));
  } catch (_) {
    // ignore storage errors
  }
}

if (typeof window !== 'undefined') {
  window.generateForecastText = (tagHistory) => {
    const fallbackDow = new Date(Date.now() + 864e5).getDay();
    return generateForecastText(tagHistory || loadTagHistory(), fallbackDow);
  };
  window.computeForecastText = (options = {}) => computeForecastText(options);
}
