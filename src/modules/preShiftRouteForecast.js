import { DateTime, ZONE, dowIndex } from '../utils/date.js';

export const PRE_SHIFT_ROUTE_FORECAST_STORAGE_KEY = 'routeStats.preShiftRouteForecasts.v1';

function mean(values) {
  if (!Array.isArray(values) || !values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function isValidModel(model) {
  return !!(model && Number.isFinite(model.a) && Number.isFinite(model.bp) && Number.isFinite(model.bl));
}

export function buildPreShiftRouteForecast(rows, { targetIso, model, now = DateTime.now().setZone(ZONE) } = {}) {
  const target = DateTime.fromISO(targetIso || '', { zone: ZONE });
  if (!target.isValid || !isValidModel(model)) return null;

  const expectedDow = dowIndex(target.toISODate());
  const historicalRows = (rows || []).filter((row) => (
    row &&
    row.status !== 'off' &&
    row.work_date !== target.toISODate() &&
    dowIndex(row.work_date) === expectedDow &&
    (Number(row.parcels) > 0 || Number(row.letters) > 0)
  ));
  const expectedParcels = mean(historicalRows.map((row) => Number(row.parcels) || 0));
  const expectedLetters = mean(historicalRows.map((row) => Number(row.letters) || 0));
  if (!Number.isFinite(expectedParcels) || !Number.isFinite(expectedLetters)) return null;

  const predictedMinutes = Math.round(model.a + model.bp * expectedParcels + model.bl * expectedLetters);
  if (!Number.isFinite(predictedMinutes) || predictedMinutes <= 0) return null;

  return {
    iso: target.toISODate(),
    weekday: expectedDow,
    forecastedAt: now.toISO(),
    expectedParcels,
    expectedLetters,
    predictedMinutes,
    sampleSize: historicalRows.length,
    modelR2: Number.isFinite(model.r2) ? model.r2 : null,
    modelSampleSize: Number.isFinite(model.n) ? model.n : null
  };
}

export function loadPreShiftRouteForecasts(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(PRE_SHIFT_ROUTE_FORECAST_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.iso) : [];
  } catch (_err) {
    return [];
  }
}

// Preserve the first forecast for a date so later refreshes cannot rewrite its scorecard.
export function savePreShiftRouteForecast(snapshot, storage = globalThis.localStorage) {
  if (!snapshot?.iso || !Number.isFinite(snapshot.predictedMinutes)) return null;
  const existing = loadPreShiftRouteForecasts(storage);
  const prior = existing.find((entry) => entry.iso === snapshot.iso);
  if (prior) return prior;
  const next = [...existing, snapshot].sort((a, b) => String(a.iso).localeCompare(String(b.iso)));
  try { storage?.setItem(PRE_SHIFT_ROUTE_FORECAST_STORAGE_KEY, JSON.stringify(next)); } catch (_err) { }
  return snapshot;
}

export function scorePreShiftRouteForecast(iso, actualRouteMinutes, storage = globalThis.localStorage) {
  const actualMinutes = Math.round(Number(actualRouteMinutes));
  if (!iso || !Number.isFinite(actualMinutes) || actualMinutes <= 0) return null;
  const existing = loadPreShiftRouteForecasts(storage);
  const prior = existing.find((entry) => entry.iso === iso);
  if (!prior || !Number.isFinite(prior.predictedMinutes)) return null;

  const residualMinutes = actualMinutes - prior.predictedMinutes;
  const scored = {
    ...prior,
    actualRouteMinutes: actualMinutes,
    residualMinutes,
    hit: Math.abs(residualMinutes) <= 15
  };
  const next = existing.map((entry) => entry.iso === iso ? scored : entry);
  try { storage?.setItem(PRE_SHIFT_ROUTE_FORECAST_STORAGE_KEY, JSON.stringify(next)); } catch (_err) { }
  return scored;
}

export function summarizePreShiftRouteForecasts(snapshots) {
  const scored = (snapshots || []).filter((entry) => Number.isFinite(entry?.residualMinutes));
  if (!scored.length) return { count: 0, hitRate: null, medianAbsoluteMiss: null, averageResidual: null };
  const residuals = scored.map((entry) => entry.residualMinutes);
  const absolute = residuals.map(Math.abs).sort((a, b) => a - b);
  const midpoint = Math.floor(absolute.length / 2);
  const medianAbsoluteMiss = absolute.length % 2 ? absolute[midpoint] : (absolute[midpoint - 1] + absolute[midpoint]) / 2;
  return {
    count: scored.length,
    hitRate: scored.filter((entry) => entry.hit).length / scored.length,
    medianAbsoluteMiss,
    averageResidual: residuals.reduce((sum, value) => sum + value, 0) / residuals.length
  };
}
