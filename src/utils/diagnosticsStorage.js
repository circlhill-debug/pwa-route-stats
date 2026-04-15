import { normalizeTagEntries } from './diagnostics.js';

export const TAG_HISTORY_KEY = 'routeStats.tagHistory';

export function loadTagHistory() {
  try {
    const raw = localStorage.getItem(TAG_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

export function saveTagHistory(history) {
  try {
    localStorage.setItem(TAG_HISTORY_KEY, JSON.stringify(history || []));
    return true;
  } catch (_) {
    return false;
  }
}

function mergeTagListsStable(primary = [], incoming = []) {
  const byReason = new Map();
  const upsert = (tag, preferIncoming = false) => {
    if (!tag) return;
    const key = String(tag.key || '').trim() || 'misc';
    const reason = String(tag.reason || key).trim() || key;
    const mapKey = `${key}:${reason.toLowerCase()}`;
    if (!byReason.has(mapKey) || preferIncoming) {
      byReason.set(mapKey, {
        key,
        reason,
        minutes: (tag.minutes != null && Number.isFinite(Number(tag.minutes))) ? Number(tag.minutes) : null,
        notedAt: tag.notedAt || new Date().toISOString()
      });
    }
  };
  (primary || []).forEach((tag) => upsert(tag, false));
  (incoming || []).forEach((tag) => upsert(tag, true));
  return Array.from(byReason.values());
}

export function upsertTagHistoryEntry(iso, tags) {
  if (!iso) return [];
  const normalizedTags = normalizeTagEntries(tags || []);
  if (!normalizedTags.length) return loadTagHistory();
  const history = loadTagHistory();
  const existing = history.find((item) => item && item.iso === iso);
  if (existing) {
    existing.tags = mergeTagListsStable(existing.tags || [], normalizedTags);
  } else {
    history.push({ iso, tags: [...normalizedTags] });
  }
  history.sort((a, b) => String(a.iso).localeCompare(String(b.iso)));
  saveTagHistory(history);
  return history;
}

export function normalizeTagHistory(seedFromDismissed = []) {
  try {
    const history = loadTagHistory();
    const byIso = new Map();
    history.forEach((item) => {
      const iso = item?.iso || item?.date || null;
      if (!iso) return;
      const tags = normalizeTagEntries(item.tags || []);
      if (!tags.length) return;
      byIso.set(iso, { iso, tags });
    });
    (seedFromDismissed || []).forEach((item) => {
      const iso = item?.iso || null;
      if (!iso) return;
      const current = byIso.get(iso);
      const mergedTags = mergeTagListsStable(current?.tags || [], normalizeTagEntries(item.tags || []));
      if (!mergedTags.length) return;
      byIso.set(iso, { iso, tags: mergedTags });
    });
    const normalized = Array.from(byIso.values()).sort((a, b) => String(a.iso).localeCompare(String(b.iso)));
    const before = JSON.stringify(history);
    const after = JSON.stringify(normalized);
    if (before !== after) {
      saveTagHistory(normalized);
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

export function saveDismissedResidualWithTags({ iso, tags, loadDismissedResiduals, saveDismissedResiduals }) {
  if (!iso || typeof loadDismissedResiduals !== 'function' || typeof saveDismissedResiduals !== 'function') return null;
  const normalizedTags = normalizeTagEntries(tags || []);
  if (!normalizedTags.length) return null;
  const dismissed = loadDismissedResiduals().filter((item) => item && item.iso !== iso);
  const entry = {
    iso,
    tags: normalizedTags,
    notedAt: new Date().toISOString()
  };
  upsertTagHistoryEntry(iso, normalizedTags);
  dismissed.push(entry);
  saveDismissedResiduals(dismissed);
  return entry;
}
