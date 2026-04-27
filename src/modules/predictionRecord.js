import { DateTime, ZONE, dowIndex } from '../utils/date.js';
import { normalizeHoursValue } from '../utils/timeNormalization.js';

function mean(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function parseHours(value) {
  const num = normalizeHoursValue(value);
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

function parseDateTimeForIso(iso, timeString) {
  if (!(iso && timeString)) return null;
  const value = String(timeString).trim();
  if (!value) return null;
  const dt = DateTime.fromISO(`${iso}T${value}`, { zone: ZONE });
  return dt.isValid ? dt : null;
}

function predictedEndDateTime(iso, hours, { startHour = 8.5, startTime = null } = {}) {
  if (!(iso && Number.isFinite(hours) && hours > 0)) return null;
  const parsedStart = parseDateTimeForIso(iso, startTime);
  const wholeHour = Math.trunc(startHour);
  const minutePart = Math.round((startHour - wholeHour) * 60);
  const base = parsedStart || DateTime.fromISO(iso, { zone: ZONE }).set({ hour: wholeHour, minute: minutePart, second: 0, millisecond: 0 });
  return base.plus({ hours });
}

function hoursToClock(iso, hours, options = {}) {
  const dt = predictedEndDateTime(iso, hours, options);
  return dt ? dt.toFormat('h:mm a') : null;
}

function timeStringToClock(iso, timeString) {
  const dt = parseDateTimeForIso(iso, timeString);
  return dt ? dt.toFormat('h:mm a') : (timeString ? String(timeString).trim() || null : null);
}

function clockDeltaMinutes(predictedDt, actualDt) {
  if (!(predictedDt && actualDt)) return null;
  return Math.round(actualDt.diff(predictedDt, 'minutes').minutes);
}

export function buildPredictionRecord(rows, options = {}) {
  const now = options.now || DateTime.now().setZone(ZONE);
  const todayIso = options.todayIso || now.toISODate();
  const todayDow = options.todayDow ?? (now.weekday % 7);
  const startHour = Number.isFinite(options.startHour) ? options.startHour : 8.5;
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

  const predictedStartTime = todayRow?.start_time || options.startTime || null;
  const predictedEndDt = predictedEndDateTime(todayIso, predictedTotalHours, { startHour, startTime: predictedStartTime });
  const predictedEndTime = predictedEndDt ? predictedEndDt.toFormat('h:mm a') : null;

  const actualTotalHours = parseHours(todayRow?.hours);
  const actualOfficeHours = parseHours(todayRow?.office_minutes);
  const actualRouteHours = parseHours(todayRow?.route_minutes);
  const actualEndDt = parseDateTimeForIso(todayIso, todayRow?.end_time || todayRow?.return_time || null);
  const actualEndTime = actualEndDt ? actualEndDt.toFormat('h:mm a') : timeStringToClock(todayIso, todayRow?.end_time || todayRow?.return_time || null);

  const deltaHours = (predictedTotalHours != null && actualTotalHours != null)
    ? actualTotalHours - predictedTotalHours
    : null;
  const deltaEndMinutes = clockDeltaMinutes(predictedEndDt, actualEndDt);

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
      startTime: predictedStartTime,
      endTime: predictedEndTime
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
      endMinutes: deltaEndMinutes,
      hitMiss: deltaHours == null ? null : (Math.abs(deltaHours * 60) <= 15 ? 'hit' : 'miss')
    },
    row: todayRow
  };
}
