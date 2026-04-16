export function fitVolumeTimeModel(rows, options = {}) {
  const weightFn = typeof options.weightFn === 'function' ? options.weightFn : null;
  const minutesForRow = typeof options.minutesForRow === 'function'
    ? options.minutesForRow
    : (row) => Number(row?.route_minutes) || 0;

  const prepared = (rows || [])
    .filter((row) => row && row.status !== 'off')
    .map((row) => {
      const parcels = +row.parcels || 0;
      const letters = +row.letters || 0;
      const minutes = minutesForRow(row);
      const rawWeight = weightFn ? Number(weightFn(row)) : 1;
      const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 0;
      return { row, parcels, letters, minutes, weight };
    })
    .filter((entry) => entry.weight > 0);

  if (!prepared.length) return null;

  const sumW = prepared.reduce((t, e) => t + e.weight, 0);
  if (!(sumW > 0)) return null;

  const mp = prepared.reduce((t, e) => t + e.weight * e.parcels, 0) / sumW;
  const ml = prepared.reduce((t, e) => t + e.weight * e.letters, 0) / sumW;
  const my = prepared.reduce((t, e) => t + e.weight * e.minutes, 0) / sumW;

  let Cpp = 0; let Cll = 0; let Cpl = 0; let Cpy = 0; let Cly = 0; let SST = 0; let SSR = 0;
  for (const e of prepared) {
    const p = e.parcels - mp;
    const l = e.letters - ml;
    const y = e.minutes - my;
    const w = e.weight;
    Cpp += w * p * p;
    Cll += w * l * l;
    Cpl += w * p * l;
    Cpy += w * p * y;
    Cly += w * l * y;
    SST += w * y * y;
  }

  const det = (Cpp * Cll - Cpl * Cpl);
  if (!isFinite(det) || Math.abs(det) < 1e-6) return null;

  const bp = (Cpy * Cll - Cpl * Cly) / det;
  const bl = (Cpp * Cly - Cpl * Cpy) / det;
  const a = my - bp * mp - bl * ml;

  const residuals = [];
  for (const e of prepared) {
    const yhat = a + bp * e.parcels + bl * e.letters;
    const resid = e.minutes - yhat;
    residuals.push({
      iso: e.row.work_date,
      parcels: e.parcels,
      letters: e.letters,
      routeMin: e.minutes,
      predMin: yhat,
      residMin: resid,
      weight: e.weight,
      row: e.row
    });
    SSR += e.weight * resid * resid;
  }

  const r2 = SST > 0 ? (1 - SSR / SST) : 0;
  const downweighted = prepared.filter((e) => e.weight < 0.999).length;

  return {
    a,
    bp,
    bl,
    r2,
    n: prepared.length,
    residuals,
    weighting: {
      enabled: !!weightFn,
      sumWeights: sumW,
      averageWeight: sumW / prepared.length,
      downweighted
    }
  };
}

export function learnedLetterWeightFromModel(model) {
  if (!model || !isFinite(model.bp) || Math.abs(model.bp) < 1e-6) return null;
  const w = model.bl / model.bp;
  return (isFinite(w) && w >= 0 && w <= 1.5) ? w : null;
}
