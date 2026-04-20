export const WEEKLY_COMPARISON_MODES = {
  calendar_same_range: {
    key: 'calendar_same_range',
    label: 'Calendar same-range',
    description: 'Mon..today compared with the same weekday span from last calendar week.'
  },
  matched_workday_count: {
    key: 'matched_workday_count',
    label: 'Matched workday count',
    description: 'Current worked days compared with the same count of worked days from the reference week.'
  },
  baseline_array: {
    key: 'baseline_array',
    label: 'Baseline array',
    description: 'Current daily totals compared against stored weekday baseline averages.'
  }
};

export function getWeeklyComparisonMode(modeKey) {
  return WEEKLY_COMPARISON_MODES[modeKey] || WEEKLY_COMPARISON_MODES.calendar_same_range;
}

export function buildWeeklyComparisonPacket(modeKey, payload = {}) {
  const mode = getWeeklyComparisonMode(modeKey);
  const currentTotal = Number(payload.currentTotal);
  const referenceTotal = Number(payload.referenceTotal);
  const deltaPct = Number.isFinite(currentTotal) && Number.isFinite(referenceTotal) && referenceTotal !== 0
    ? ((currentTotal - referenceTotal) / referenceTotal) * 100
    : null;
  return {
    mode: mode.key,
    label: mode.label,
    description: mode.description,
    currentTotal: Number.isFinite(currentTotal) ? currentTotal : null,
    referenceTotal: Number.isFinite(referenceTotal) ? referenceTotal : null,
    deltaPct,
    currentDays: Number.isFinite(payload.currentDays) ? payload.currentDays : null,
    referenceDays: Number.isFinite(payload.referenceDays) ? payload.referenceDays : null,
    usedDays: Number.isFinite(payload.usedDays) ? payload.usedDays : null
  };
}

export function formatWeeklyComparisonSummary(packet, {
  currentLabel = 'This week',
  referenceLabel = 'Reference',
  valueFormatter = (value) => String(value ?? '—'),
  dayUnit = 'day(s)'
} = {}) {
  if (!packet) return '';
  const parts = [
    `${currentLabel}: ${packet.currentTotal == null ? '—' : valueFormatter(packet.currentTotal)}`
  ];
  if (packet.currentDays != null) parts[0] += ` over ${packet.currentDays} ${dayUnit}`;
  let reference = `${referenceLabel}: ${packet.referenceTotal == null ? '—' : valueFormatter(packet.referenceTotal)}`;
  if (packet.referenceDays != null) reference += ` over ${packet.referenceDays} ${dayUnit}`;
  parts.push(reference);
  return `${packet.label} · ${parts.join('. ')}`;
}
