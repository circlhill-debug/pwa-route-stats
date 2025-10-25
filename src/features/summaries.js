// Smart summary and heaviness widgets for the dashboard.
import { DateTime, ZONE, startOfWeekMonday, dowIndex } from '../utils/date.js';

export function createSummariesFeature({
  getFlags,
  filterRowsForView,
  routeAdjustedHours,
  computeLetterWeight,
  getCurrentLetterWeight,
  colorForDelta
}) {
  if (typeof getFlags !== 'function') throw new Error('createSummariesFeature: getFlags is required');
  if (typeof filterRowsForView !== 'function') throw new Error('createSummariesFeature: filterRowsForView is required');
  if (typeof routeAdjustedHours !== 'function') throw new Error('createSummariesFeature: routeAdjustedHours is required');
  if (typeof computeLetterWeight !== 'function') throw new Error('createSummariesFeature: computeLetterWeight is required');
  if (typeof getCurrentLetterWeight !== 'function') throw new Error('createSummariesFeature: getCurrentLetterWeight is required');
  if (typeof colorForDelta !== 'function') throw new Error('createSummariesFeature: colorForDelta is required');

  function getLetterWeightForSummary(rows) {
    try {
      const scoped = filterRowsForView(rows || [])
        .filter(r => r && r.status !== 'off' && ((+r.parcels || 0) + (+r.letters || 0) > 0))
        .sort((a, b) => (a.work_date < b.work_date ? -1 : 1));
      const sample = scoped.slice(-60);
      const learned = computeLetterWeight(sample);
      if (learned != null) return learned;
    } catch (_err) {
      /* fall back */
    }
    return getCurrentLetterWeight();
  }

  function buildSmartSummary(rows) {
    const el = document.getElementById('smartSummary');
    if (!el) return;

    try {
      const flags = getFlags();
      if (!flags?.smartSummary) {
        el.style.display = 'none';
        return;
      }

      const scoped = filterRowsForView(rows || []);
      const now = DateTime.now().setZone(ZONE);
      const startThis = startOfWeekMonday(now);
      const endThis = now.endOf('day');
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf('day');
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const worked = scoped.filter(r => r.status !== 'off');
      const W0 = worked.filter(r => inRange(r, startThis, endThis));
      const W1 = worked.filter(r => inRange(r, startLast, lastEndSame));
      const daysThisWeek = [...new Set(W0.map(r => r.work_date))].length;
      if (!daysThisWeek) {
        el.textContent = 'No worked days yet — 0 day(s) this week.';
        el.style.display = 'block';
        return;
      }

      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const h0 = sum(W0, r => +r.hours || 0);
      const h1 = sum(W1, r => +r.hours || 0);
      const p0 = sum(W0, r => +r.parcels || 0);
      const p1 = sum(W1, r => +r.parcels || 0);
      const l0 = sum(W0, r => +r.letters || 0);
      const l1 = sum(W1, r => +r.letters || 0);
      const letterW = getLetterWeightForSummary(scoped);
      const volume = (p, l) => p + letterW * l;
      const v0 = volume(p0, l0);
      const v1 = volume(p1, l1);
      const rm0 = sum(W0, r => routeAdjustedHours(r));
      const rm1 = sum(W1, r => routeAdjustedHours(r));
      const idx = (hours, vol) => (hours > 0 && vol > 0 ? hours / vol : null);
      const i0 = idx(rm0, v0);
      const i1 = idx(rm1, v1);
      const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
      const dh = pct(h0, h1);
      const dv = pct(v0, v1);
      const di = i0 != null && i1 != null && i1 > 0 ? Math.round(((i1 - i0) / i1) * 100) : null;

      const movers = [];
      if (dh != null && Math.abs(dh) >= 5) movers.push({ k: 'Hours', v: dh });
      if (dv != null && Math.abs(dv) >= 5) movers.push({ k: 'Volume', v: dv });
      if (di != null && Math.abs(di) >= 5) movers.push({ k: 'Efficiency', v: di });
      movers.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
      const top = movers.slice(0, 2).map(it => `${it.k} ${it.v >= 0 ? `↑ ${it.v}%` : `↓ ${Math.abs(it.v)}%`}`);
      const line = top.length ? top.join(' • ') : 'Similar to last week';

      el.textContent = `${line} — ${daysThisWeek} day(s) this week.`;
      el.style.display = 'block';
    } catch (_err) {
      /* ignore */
    }
  }

  function buildTrendingFactors(rows) {
    const el = document.getElementById('trendFactors');
    if (!el) return;

    try {
      const scoped = filterRowsForView(rows || []);
      const now = DateTime.now().setZone(ZONE);
      const startThis = startOfWeekMonday(now);
      const endThis = now.endOf('day');
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf('day');
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const worked = scoped.filter(r => r.status !== 'off');
      const thisWeek = worked.filter(r => inRange(r, startThis, endThis));
      const lastWeek = worked.filter(r => inRange(r, startLast, lastEndSame));
      if (!thisWeek.length) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
      }

      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const office0 = sum(thisWeek, r => +r.office_minutes || 0);
      const office1 = sum(lastWeek, r => +r.office_minutes || 0);
      const route0 = sum(thisWeek, r => routeAdjustedHours(r));
      const route1 = sum(lastWeek, r => routeAdjustedHours(r));
      const vol = arr => sum(arr, r => (+r.parcels || 0) + 0.33 * (+r.letters || 0));
      const vol0 = vol(thisWeek);
      const vol1 = vol(lastWeek);
      const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

      const items = [];
      const pushIf = (label, delta) => {
        if (delta != null && Math.abs(delta) >= 5) items.push({ label, delta });
      };
      pushIf('Office', pct(office0, office1));
      pushIf('Route', pct(route0, route1));
      pushIf('Volume', pct(vol0, vol1));
      items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      const top = items.slice(0, 2);
      if (!top.length) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
      }

      const pills = top
        .map(it => {
          const { fg } = colorForDelta(it.delta || 0);
          const direction = it.delta >= 0 ? `↑ ${it.delta}%` : `↓ ${Math.abs(it.delta)}%`;
          return `<span class="pill"><small>${it.label}</small> <b style="color:${fg}">${direction}</b></span>`;
        })
        .join(' ');
      el.style.display = 'block';
      el.innerHTML = `<small>Weekly Movers</small><div class="pill-row">${pills}</div>`;
    } catch (_err) {
      /* ignore */
    }
  }

  function buildHeavinessToday(rows) {
    const el = document.getElementById('todayHeaviness');
    if (!el) return;

    try {
      const scoped = filterRowsForView(rows || []);
      const now = DateTime.now().setZone(ZONE);
      const dow = now.weekday % 7;
      const worked = scoped.filter(r => r.status !== 'off');
      const todayIso = now.toISODate();
      const todayRow = worked.find(r => r.work_date === todayIso);
      if (!todayRow) {
        el.style.display = 'none';
        return;
      }

      const offTodayH = +todayRow.office_minutes || 0;
      const rteTodayH = routeAdjustedHours(todayRow);
      const totTodayH = +todayRow.hours || offTodayH + rteTodayH;
      const sameDow = worked.filter(r => r.work_date !== todayIso && dowIndex(r.work_date) === dow);
      const avg = (arr, fn) => {
        const values = arr.map(fn).filter(val => val > 0);
        return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
      };
      const offAvgH = avg(sameDow, r => +r.office_minutes || 0);
      const rteAvgH = avg(sameDow, r => routeAdjustedHours(r));
      const totAvgH = avg(sameDow, r => +r.hours || 0);
      if (offAvgH == null && rteAvgH == null && totAvgH == null) {
        el.style.display = 'none';
        return;
      }

      const dOff = offAvgH == null ? null : offTodayH - offAvgH;
      const dRte = rteAvgH == null ? null : rteTodayH - rteAvgH;
      const dTot = totAvgH == null ? null : totTodayH - totAvgH;
      const baseTot = totAvgH && totAvgH > 0 ? totAvgH : (offAvgH || 0) + (rteAvgH || 0) || null;
      const pct = delta => (delta == null || !baseTot ? null : Math.round((delta / baseTot) * 100));
      const pill = (label, delta) => {
        const p = pct(delta);
        const deltaText = delta == null ? '—' : `${delta >= 0 ? '+' : ''}${(Math.round(delta * 10) / 10).toFixed(1)}h`;
        const pctText = p == null ? '' : ` (${p >= 0 ? '+' : ''}${p}%)`;
        const { fg } = colorForDelta(p || 0);
        return `<span class="pill"><small>${label}</small> <b style="color:${fg}">${deltaText}${pctText}</b></span>`;
      };

      el.style.display = 'block';
      const pills = [pill('Office', dOff), pill('Route', dRte), pill('Total', dTot)].join(' ');
      el.innerHTML = `<small>Heaviness (today)</small><div class="pill-row">${pills}</div>`;
    } catch (_err) {
      /* ignore */
    }
  }

  function buildWeekHeaviness(rows) {
    const el = document.getElementById('weekHeaviness');
    if (!el) return;

    try {
      const scoped = filterRowsForView(rows || []);
      const now = DateTime.now().setZone(ZONE);
      const startThis = startOfWeekMonday(now);
      const endThis = now.endOf('day');
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf('day');
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const worked = scoped.filter(r => r.status !== 'off');
      const thisWeek = worked.filter(r => inRange(r, startThis, endThis));
      const lastWeek = worked.filter(r => inRange(r, startLast, lastEndSame));
      if (!thisWeek.length || !lastWeek.length) {
        el.style.display = 'none';
        return;
      }

      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const off0 = sum(thisWeek, r => +r.office_minutes || 0);
      const off1 = sum(lastWeek, r => +r.office_minutes || 0);
      const rte0 = sum(thisWeek, r => routeAdjustedHours(r));
      const rte1 = sum(lastWeek, r => routeAdjustedHours(r));
      const tot0 = sum(thisWeek, r => +r.hours || 0);
      const tot1 = sum(lastWeek, r => +r.hours || 0);
      const dOff = off0 - off1;
      const dRte = rte0 - rte1;
      const dTot = tot0 - tot1;
      const baseTot = tot1 > 0 ? tot1 : null;
      const pct = delta => (baseTot && delta != null ? Math.round((delta / baseTot) * 100) : null);
      const pill = (label, delta) => {
        const p = pct(delta);
        const deltaText = delta == null ? '—' : `${delta >= 0 ? '+' : ''}${(Math.round(delta * 10) / 10).toFixed(1)}h`;
        const pctText = p == null ? '' : ` (${p >= 0 ? '+' : ''}${p}%)`;
        const { fg } = colorForDelta(p || 0);
        return `<span class="pill"><small>${label}</small> <b style="color:${fg}">${deltaText}${pctText}</b></span>`;
      };

      el.style.display = 'block';
      const pills = [pill('Office', dOff), pill('Route', dRte), pill('Total', dTot)].join(' ');
      el.innerHTML = `<small>Heaviness (week)</small><div class="pill-row">${pills}</div>`;
    } catch (_err) {
      /* ignore */
    }
  }

  function buildHeadlineDigest(rows) {
    const el = document.getElementById('headlineDigest');
    if (!el) return;

    try {
      const flags = getFlags();
      if (!flags?.headlineDigest) {
        el.style.display = 'none';
        return;
      }

      const scoped = filterRowsForView(rows || []).filter(r => r && r.status !== 'off');
      if (!scoped.length) {
        el.style.display = 'none';
        el.textContent = '—';
        return;
      }

      const now = DateTime.now().setZone(ZONE);
      const startThis = startOfWeekMonday(now);
      const endThis = now.endOf('day');
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf('day');
      const inRange = (row, from, to) => {
        const d = DateTime.fromISO(row.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const W0 = scoped.filter(r => inRange(r, startThis, endThis));
      const W1 = scoped.filter(r => inRange(r, startLast, lastEndSame));
      if (!W0.length || !W1.length) {
        el.style.display = 'none';
        el.textContent = '—';
        return;
      }

      const sum = (arr, fn) => arr.reduce((total, item) => total + (fn(item) || 0), 0);
      const hours0 = sum(W0, r => +r.hours || 0);
      const hours1 = sum(W1, r => +r.hours || 0);
      const parcels0 = sum(W0, r => +r.parcels || 0);
      const parcels1 = sum(W1, r => +r.parcels || 0);
      const letters0 = sum(W0, r => +r.letters || 0);
      const letters1 = sum(W1, r => +r.letters || 0);
      const letterWeight = getLetterWeightForSummary(scoped);
      const volume = (p, l) => p + letterWeight * l;
      const volume0 = volume(parcels0, letters0);
      const volume1 = volume(parcels1, letters1);
      const route0 = sum(W0, r => routeAdjustedHours(r));
      const route1 = sum(W1, r => routeAdjustedHours(r));
      const efficiency0 = volume0 > 0 && route0 > 0 ? route0 / volume0 : null;
      const efficiency1 = volume1 > 0 && route1 > 0 ? route1 / volume1 : null;

      const pct = (current, baseline) => (baseline > 0 ? Math.round(((current - baseline) / baseline) * 100) : null);
      const format = (label, delta) => {
        if (delta == null) return null;
        const clamped = Math.max(-99, Math.min(99, delta));
        const arrow = clamped >= 0 ? '↑' : '↓';
        return `${label} ${arrow} ${Math.abs(clamped)}%`;
      };

      const parts = [];
      const hoursDelta = pct(hours0, hours1);
      const volumeDelta = pct(volume0, volume1);
      const efficiencyDelta = efficiency0 != null && efficiency1 != null && efficiency1 > 0
        ? Math.round(((efficiency0 - efficiency1) / efficiency1) * 100)
        : null;

      const pushIf = (label, delta) => {
        const text = format(label, delta);
        if (text) parts.push(text);
      };

      pushIf('Hours', hoursDelta);
      pushIf('Volume', volumeDelta);
      pushIf('Efficiency', efficiencyDelta);

      if (!parts.length) {
        el.textContent = 'Similar to last week.';
      } else {
        el.textContent = parts.join(' • ');
      }
      el.style.display = 'block';
      el.title = `W1 vs W2 — Hours: ${hours0.toFixed(1)}h vs ${hours1.toFixed(1)}h · Volume: ${Math.round(volume0)} vs ${Math.round(volume1)} · Efficiency: ${
        efficiency0 != null ? efficiency0.toFixed(2) : '—'
      } vs ${efficiency1 != null ? efficiency1.toFixed(2) : '—'}`;
    } catch (_err) {
      el.style.display = 'none';
    }
  }

  return {
    getLetterWeightForSummary,
    buildSmartSummary,
    buildTrendingFactors,
    buildHeavinessToday,
    buildWeekHeaviness,
    buildHeadlineDigest
  };
}
