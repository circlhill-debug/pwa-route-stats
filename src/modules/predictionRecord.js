import { DateTime, ZONE, dowIndex } from '../utils/date.js';

function mean(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function parseHours(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function scoreRowCompleteness(row) {
  if (!row || row.status === 'off') return -1;
  let score = 0;
  if (row?.end_time) score += 3;
  if (row?.return_time) score += 2;
  if (Number(row?.hours) > 0) score += 4;
  if (Number(row?.route_minutes) > 0) score += 2;
  if (Number(row?.office_minutes) > 0) score += 1;
  return score;
}

function selectBestRow(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.reduce((best, row) => (
    scoreRowCompleteness(row) > scoreRowCompleteness(best) ? row : best
  ), null);
}

function hoursToClock(iso, hours, { startHour = 8 } = {}) {
  if (!(iso && Number.isFinite(hours) && hours > 0)) return null;
  const base = DateTime.fromISO(iso, { zone: ZONE }).set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
  return base.plus({ hours }).toFormat('h:mm a');
}

export function buildPredictionRecord(rows, options = {}) {
  const now = options.now || DateTime.now().setZone(ZONE);
  const todayIso = options.todayIso || now.toISODate();
  const todayDow = options.todayDow ?? (now.weekday % 7);
  const startHour = Number.isFinite(options.startHour) ? options.startHour : 8;
  const sourceRows = Array.isArray(rows) ? rows.filter((row) => row && row.status !== 'off') : [];

  const todayCandidates = sourceRows.filter((row) => row.work_date === todayIso);
  const todayRow = selectBestRow(todayCandidates);

  const historicalRows = sourceRows.filter((row) => row.work_date !== todayIso);
  const sameDowRows = historicalRows.filter((row) => dowIndex(row.work_date) === todayDow);

  const predictedTotalHours = mean(sameDowRows.map((row) => parseHours(row.hours)).filter(Boolean))
    ?? mean(historicalRows.map((row) => parseHours(row.hours)).filter(Boolean));
  const predictedOfficeHours = mean(sameDowRows.map((row) => parseHours(row.office_minutes)).filter(Boolean))
    ?? mean(historicalRows.map((row) => parseHours(row.office_minutes)).filter(Boolean));
  const predictedRouteHours = mean(sameDowRows.map((row) => parseHours(row.route_minutes)).filter(Boolean))
    ?? mean(historicalRows.map((row) => parseHours(row.route_minutes)).filter(Boolean));

  const actualTotalHours = parseHours(todayRow?.hours);
  const actualOfficeHours = parseHours(todayRow?.office_minutes);
  const actualRouteHours = parseHours(todayRow?.route_minutes);
  const actualEndTime = todayRow?.end_time || todayRow?.return_time || null;

  const deltaHours = (predictedTotalHours != null && actualTotalHours != null)
    ? actualTotalHours - predictedTotalHours
    : null;

  return {
    iso: todayIso,
    weekday: todayDow,
    source: {
      type: sameDowRows.length ? 'weekday_average' : 'overall_average',
      sampleSize: sameDowRows.length || historicalRows.length
    },
    predicted: {
      totalHours: predictedTotalHours,
      officeHours: predictedOfficeHours,
      routeHours: predictedRouteHours,
      endTime: hoursToClock(todayIso, predictedTotalHours, { startHour })
    },
    actual: {
      totalHours: actualTotalHours,
      officeHours: actualOfficeHours,
      routeHours: actualRouteHours,
      endTime: actualEndTime
    },
    delta: {
      totalHours: deltaHours,
      totalMinutes: Number.isFinite(deltaHours) ? Math.round(deltaHours * 60) : null,
      hitMiss: deltaHours == null ? null : (Math.abs(deltaHours * 60) <= 15 ? 'hit' : 'miss')
    },
    row: todayRow
  };
}
