// Diagnostics-specific utility helpers.

export const DIAGNOSTIC_TAG_CATALOG = [
  { key: 'parcels', label: 'Parcels', aliases: ['parcel', 'pkgs', 'packages', 'volume'] },
  { key: 'letters', label: 'Letters', aliases: ['mail', 'letters heavy', 'letters light'] },
  { key: 'flats', label: 'Flats', aliases: ['flat', 'flats time'] },
  { key: 'weather', label: 'Weather', aliases: ['rain', 'snow', 'wind', 'storm', 'heat', 'cold'] },
  { key: 'traffic', label: 'Traffic', aliases: ['jam', 'congestion'] },
  { key: 'detour', label: 'Detour', aliases: ['reroute', 'detoured'] },
  { key: 'road_closure', label: 'Road closure', aliases: ['road', 'closure', 'construction'] },
  { key: 'boxholders', label: 'Boxholders', aliases: ['box holder', 'boxholder', 'box'] },
  { key: 'second_trip', label: 'Second trip', aliases: ['second-trip', '2nd trip', 'extra trip'] },
  { key: 'load', label: 'Load/Setup', aliases: ['load time', 'setup', 'vehicle load'] },
  { key: 'break', label: 'Break', aliases: ['lunch', 'rest'] },
  { key: 'vehicle_issue', label: 'Vehicle issue', aliases: ['vehicle', 'truck', 'maintenance', 'gas', 'fuel'] },
  { key: 'misc', label: 'Misc', aliases: ['other', 'miscellaneous', 'unknown'] }
];

const CATALOG_BY_KEY = new Map(DIAGNOSTIC_TAG_CATALOG.map(item => [item.key, item]));

export function tagLabelForKey(key) {
  const item = CATALOG_BY_KEY.get(String(key || '').trim());
  return item?.label || 'Misc';
}

export function canonicalizeTagReason(rawReason) {
  const reason = String(rawReason || '').replace(/\s+/g, ' ').trim();
  if (!reason) return { key: 'misc', reason: 'misc' };
  const normalized = reason.toLowerCase().replace(/[_-]+/g, ' ');

  for (const item of DIAGNOSTIC_TAG_CATALOG) {
    if (normalized === item.key.replace(/_/g, ' ')) return { key: item.key, reason: item.key };
    const aliases = item.aliases || [];
    if (aliases.some(alias => normalized.includes(String(alias).toLowerCase()))) {
      return { key: item.key, reason: item.key };
    }
  }
  return { key: 'misc', reason: reason };
}

export function normalizeTagEntries(entries, options = {}) {
  const notedAt = options.notedAt || new Date().toISOString();
  const aggregated = new Map();
  (entries || []).forEach((entry) => {
    if (!entry) return;
    const rawReason = entry.reason || entry.key || '';
    const canonical = canonicalizeTagReason(rawReason);
    const key = canonical.key || 'misc';
    const reason = key === 'misc' ? (String(rawReason || '').trim() || 'misc') : key;
    const minutesVal = entry.minutes != null && entry.minutes !== '' ? Number(entry.minutes) : null;
    const minutes = Number.isFinite(minutesVal) ? minutesVal : null;
    const mapKey = `${key}:${reason.toLowerCase()}`;
    const existing = aggregated.get(mapKey) || { key, reason, minutes: 0, hasMinutes: false, notedAt };
    if (minutes != null) {
      existing.minutes += minutes;
      existing.hasMinutes = true;
    }
    aggregated.set(mapKey, existing);
  });
  return Array.from(aggregated.values()).map(item => ({
    key: item.key,
    reason: item.reason,
    minutes: item.hasMinutes ? item.minutes : null,
    notedAt: item.notedAt
  }));
}

export function parseDismissReasonInput(raw) {
  if (!raw) return [];

  let working = String(raw)
    .replace(/[;\n]+/g, ',')
    .replace(/\s*,\s*/g, ',')
    .trim();
  if (!working) return [];

  const parsed = [];
  working = working.replace(/([^,]+?)\s*([+\-]\s*\d+(?:\.\d+)?)/g, (_, reasonPart, minutesPart) => {
    const reason = String(reasonPart || '').trim();
    const minutes = Number(String(minutesPart || '').replace(/\s+/g, ''));
    if (reason && Number.isFinite(minutes)) parsed.push({ reason, minutes });
    return ' ';
  });

  working = working.replace(/([^,]+?)\s*:\s*([^,+\s]+)/g, (_, left, right) => {
    const reason = `${String(left || '').trim()}:${String(right || '').trim()}`;
    if (reason && reason !== ':') parsed.push({ reason, minutes: null });
    return ' ';
  });

  working
    .split(',')
    .map(segment => segment.trim())
    .filter(Boolean)
    .forEach(segment => {
      if (/^[+\-]?\d+(?:\.\d+)?$/.test(segment)) return;
      parsed.push({ reason: segment, minutes: null });
    });

  return normalizeTagEntries(parsed);
}
