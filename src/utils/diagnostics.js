// Diagnostics-specific utility helpers.

export function parseDismissReasonInput(raw) {
  if (!raw) return [];

  let working = String(raw)
    .replace(/[;\n]+/g, ',')
    .replace(/\s*,\s*/g, ',')
    .trim();

  if (!working) return [];

  const aggregated = new Map();

  const upsert = (reasonRaw, minutesVal, hasMinutes = false) => {
    if (reasonRaw == null) return;
    const reason = String(reasonRaw).replace(/\s+/g, ' ').trim();
    if (!reason) return;
    const key = reason.toLowerCase();
    const entry = aggregated.get(key) || { reason, minutes: 0, hasMinutes: false };
    if (hasMinutes && Number.isFinite(minutesVal)) {
      entry.minutes += minutesVal;
      entry.hasMinutes = true;
    }
    aggregated.set(key, entry);
  };

  working = working.replace(/([^,+:]+?)\s*\+\s*([-+]?\d+(?:\.\d+)?)/g, (_, reasonPart, minutesPart) => {
    const reason = reasonPart.trim();
    const minutes = parseFloat(minutesPart);
    upsert(reason, Number.isFinite(minutes) ? minutes : 0, Number.isFinite(minutes));
    return ' ';
  });

  working = working.replace(/([^,+:]+?)\s*:\s*([^,+\s]+)/g, (_, keyPart, valuePart) => {
    const key = keyPart.trim();
    const value = valuePart.trim();
    const label = value ? `${key}:${value}` : key;
    upsert(label, 0, false);
    return ' ';
  });

  working
    .split(',')
    .map(segment => segment.trim())
    .filter(Boolean)
    .forEach(segment => {
      const cleaned = segment.replace(/\s+/g, ' ').trim();
      if (!cleaned) return;
      if (/^[+\-]?\d+(?:\.\d+)?$/.test(cleaned)) return;
      upsert(cleaned, 0, false);
    });

  return Array.from(aggregated.values()).map(item => ({
    reason: item.reason,
    minutes: item.hasMinutes ? item.minutes : null
  }));
}
