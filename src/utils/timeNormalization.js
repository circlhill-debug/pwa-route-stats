export function normalizeHoursValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (Math.abs(n) > 24) return n / 60;
  return n;
}

export function normalizeTotalHoursRecord(row, routeHours, officeHours) {
  const stored = normalizeHoursValue(row?.hours ?? row?.totalHours);
  const combined = (Number(routeHours) || 0) + (Number(officeHours) || 0);
  if (!Number.isFinite(stored) || stored <= 0) return combined;
  if (combined > 0) {
    const suspiciouslyHigh = stored - combined >= 2 && stored > (combined * 1.5);
    if (suspiciouslyHigh) return combined;
  }
  return stored;
}

export function adjustedRouteHoursFromRow(row, adjustmentMinutes = 0) {
  const baseHours = normalizeHoursValue(row?.route_minutes ?? row?.routeMinutes);
  const adjustmentHours = (Number(adjustmentMinutes) || 0) / 60;
  return Math.max(0, +(baseHours - adjustmentHours).toFixed(2));
}

export function adjustedRouteMinutesFromRow(row, adjustmentMinutes = 0) {
  const hours = adjustedRouteHoursFromRow(row, adjustmentMinutes);
  return Number.isFinite(hours) ? hours * 60 : 0;
}
