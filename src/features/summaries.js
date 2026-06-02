// Smart summary and heaviness widgets for the dashboard.
import { DateTime, ZONE, startOfWeekMonday, dowIndex } from '../utils/date.js';
import { normalizeHoursValue } from '../utils/timeNormalization.js';
import { getStored, buildBadgeStorageKey, ensureBadgeRevealSeeded, loadRevealedBadgeKeys, saveRevealedBadgeKeys } from '../utils/storage.js';

export function createSummariesFeature({
  getFlags,
  filterRowsForView,
  routeAdjustedHours,
  computeLetterWeight,
  getCurrentLetterWeight,
  colorForDelta,
  buildPredictionRecord,
  getResidualModel,
  combinedVolume,
  loadDismissedResiduals
}) {
  if (typeof getFlags !== 'function') throw new Error('createSummariesFeature: getFlags is required');
  if (typeof filterRowsForView !== 'function') throw new Error('createSummariesFeature: filterRowsForView is required');
  if (typeof routeAdjustedHours !== 'function') throw new Error('createSummariesFeature: routeAdjustedHours is required');
  if (typeof computeLetterWeight !== 'function') throw new Error('createSummariesFeature: computeLetterWeight is required');
  if (typeof getCurrentLetterWeight !== 'function') throw new Error('createSummariesFeature: getCurrentLetterWeight is required');
  if (typeof colorForDelta !== 'function') throw new Error('createSummariesFeature: colorForDelta is required');
  if (typeof buildPredictionRecord !== 'function') throw new Error('createSummariesFeature: buildPredictionRecord is required');
  if (typeof getResidualModel !== 'function') throw new Error('createSummariesFeature: getResidualModel is required');
  if (typeof combinedVolume !== 'function') throw new Error('createSummariesFeature: combinedVolume is required');
  if (typeof loadDismissedResiduals !== 'function') throw new Error('createSummariesFeature: loadDismissedResiduals is required');

  function getActiveWorkdayContext(rows, now = DateTime.now().setZone(ZONE)) {
    const worked = (rows || []).filter(r => r && r.status !== 'off');
    const todayIso = now.toISODate();
    const hasTodayWorkedRow = worked.some(r => r.work_date === todayIso);
    const activeDay = hasTodayWorkedRow ? now : now.minus({ days: 1 });
    return {
      worked,
      todayIso,
      hasTodayWorkedRow,
      activeDay,
      activeEnd: activeDay.endOf('day')
    };
  }

  function getLetterWeightForSummary(rows) {
    return getCurrentLetterWeight();
  }

  function buildInsightStrip(rows) {
    const card = document.getElementById('insightStripCard');
    const el = document.getElementById('insightStrip');
    if (!card || !el) return;

    try {
      const flags = getFlags();
      if (!flags?.insightStrip) {
        card.style.display = 'none';
        return;
      }

      const scoped = filterRowsForView(rows || []);
      const now = DateTime.now().setZone(ZONE);
      const { worked, todayIso, activeDay, activeEnd } = getActiveWorkdayContext(scoped, now);
      const prediction = buildPredictionRecord(worked, { now });
      const todayRow = prediction?.row || null;
      const model = getResidualModel(worked);
      const hasModel = !!(model && Number.isFinite(model.a) && Number.isFinite(model.bp) && Number.isFinite(model.bl));
      const residualEntry = hasModel ? (model.residuals || []).find(r => r?.iso === todayIso) || null : null;
      const letterW = getLetterWeightForSummary(scoped);

      const vols = worked.map(r => combinedVolume(+r.parcels || 0, +r.letters || 0, letterW)).filter(v => Number.isFinite(v) && v > 0);
      const todayVolume = todayRow ? combinedVolume(+todayRow.parcels || 0, +todayRow.letters || 0, letterW) : null;
      const volumePercentile = (() => {
        if (!(vols.length && Number.isFinite(todayVolume) && todayVolume > 0)) return null;
        const sorted = [...vols].sort((a, b) => a - b);
        let idx = sorted.findIndex(n => todayVolume <= n);
        if (idx < 0) idx = sorted.length - 1;
        return Math.round(((idx + 1) / sorted.length) * 100);
      })();
      const volumeScore = volumePercentile == null ? null : Math.max(1, Math.min(10, Math.round((volumePercentile / 100) * 10)));

      const workdayCard = {
        kicker: 'Workday forecast',
        headline: prediction?.predicted?.endTime || 'Pending',
        support: prediction?.predicted?.totalHours != null
          ? `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.weekday % 7]} avg ${prediction.predicted.totalHours.toFixed(2)}h`
          : 'Need more history',
        cue: prediction?.predicted?.totalHours != null
          ? `<div style="height:6px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(10, Math.min(100, Math.round((prediction.predicted.totalHours / 10) * 100)))}%;background:linear-gradient(90deg,var(--brand),var(--good))"></div></div>`
          : `<div class="muted" style="font-size:12px">Expected end uses the workday estimate layer.</div>`
      };

      const routePredHours = residualEntry
        ? (residualEntry.predMin / 60)
        : (todayRow && hasModel && ((+todayRow.parcels || 0) + (+todayRow.letters || 0) > 0)
            ? ((model.a + model.bp * (+todayRow.parcels || 0) + model.bl * (+todayRow.letters || 0)) / 60)
            : null);
      const routeR2 = hasModel ? Math.round(Math.max(0, Math.min(1, model.r2 || 0)) * 100) : null;
      const routeCard = {
        kicker: 'Route model',
        headline: Number.isFinite(routePredHours) ? `${routePredHours.toFixed(2)}h` : 'Pending',
        support: Number.isFinite(routeR2)
          ? `Expected Route Time · R² ${routeR2}%`
          : 'Expected Route Time pending',
        cue: Number.isFinite(routeR2)
          ? `<div style="display:flex;align-items:center;gap:8px"><span class="muted" style="font-size:12px">confidence</span><div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, routeR2))}%;background:linear-gradient(90deg,var(--warn),var(--good))"></div></div></div>`
          : `<div class="muted" style="font-size:12px">Add parcels and letters to activate the route model card.</div>`
      };

      let volumeHeadline = 'Pending';
      let volumeSupport = 'No current-day volume logged yet';
      let volumeCue = `<div class="muted" style="font-size:12px">Volume Driver activates after today’s entry exists.</div>`;
      if (Number.isFinite(todayVolume) && todayVolume > 0) {
        const { fg } = colorForDelta((volumePercentile || 50) - 50);
        volumeHeadline = `${todayVolume.toFixed(1)} vol`;
        volumeSupport = volumeScore != null
          ? `${volumeScore}/10 · ${volumePercentile}th percentile`
          : 'Today volume';
        volumeCue = `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:${fg};font-weight:700">${volumeScore != null ? `${volumeScore}/10` : '—'}</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, volumePercentile || 0))}%;background:linear-gradient(90deg,var(--good),var(--brand))"></div></div></div>`;
      }
      const volumeCard = {
        kicker: 'Volume level',
        headline: volumeHeadline,
        support: volumeSupport,
        cue: volumeCue
      };

      const dismissedSet = new Set((loadDismissedResiduals() || []).map(item => item?.iso).filter(Boolean));
      const unresolvedResidual = residualEntry && !dismissedSet.has(todayIso) && Math.abs(Number(residualEntry.residMin) || 0) > 15
        ? Math.round(residualEntry.residMin)
        : null;
      const latestUnrevealedBadge = (() => {
        const badges = (getStored('routeStats.badges', []) || [])
          .filter(badge => badge && badge.id && badge.unlockedAt)
          .sort((a, b) => String(b.unlockedAt).localeCompare(String(a.unlockedAt)));
        const revealedBadgeKeys = new Set(ensureBadgeRevealSeeded(badges));
        return badges.find(badge => !revealedBadgeKeys.has(buildBadgeStorageKey(badge))) || null;
      })();

      const sameDow = worked.filter(r => r.work_date !== todayIso && dowIndex(r.work_date) === (now.weekday % 7));
      const average = (arr, fn) => {
        const values = arr.map(fn).filter(val => Number.isFinite(val) && val > 0);
        return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
      };
      const officeTodayH = todayRow ? normalizeHoursValue(todayRow.office_minutes) : null;
      const officeAvgH = average(sameDow, r => normalizeHoursValue(r.office_minutes));
      const officeDeltaH = (officeTodayH != null && officeAvgH != null) ? officeTodayH - officeAvgH : null;
      const officeDeltaPct = (officeDeltaH != null && officeAvgH && officeAvgH > 0)
        ? Math.round((officeDeltaH / officeAvgH) * 100)
        : null;
      const officeElevated = officeDeltaH != null && officeDeltaPct != null && officeDeltaH >= 0.4 && officeDeltaPct >= 10;

      const startThis = startOfWeekMonday(now);
      const endThis = activeEnd;
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: activeDay.weekday - 1 }).endOf('day');
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };
      const thisWeek = worked.filter(r => inRange(r, startThis, endThis));
      const lastWeek = worked.filter(r => inRange(r, startLast, lastEndSame));
      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const recordDefs = [
        { id: 'mostParcels', label: 'Most parcels ever', type: 'max', value: (r) => Number(r?.parcels) || 0, format: (v) => `${Math.round(v).toLocaleString()} parcels` },
        { id: 'leastParcels', label: 'Least parcels ever', type: 'min', value: (r) => Number(r?.parcels) || 0, valid: (v) => Number.isFinite(v) && v >= 0, format: (v) => `${Math.round(v).toLocaleString()} parcels` },
        { id: 'mostLetters', label: 'Most letters ever', type: 'max', value: (r) => Number(r?.letters) || 0, format: (v) => `${Math.round(v).toLocaleString()} letters` },
        { id: 'leastLetters', label: 'Least letters ever', type: 'min', value: (r) => Number(r?.letters) || 0, valid: (v) => Number.isFinite(v) && v >= 0, format: (v) => `${Math.round(v).toLocaleString()} letters` },
        { id: 'highestVolume', label: 'Heaviest volume ever', type: 'max', value: (r) => combinedVolume(Number(r?.parcels) || 0, Number(r?.letters) || 0, letterW), format: (v) => `${v.toFixed(1)} vol` },
        { id: 'lowestVolume', label: 'Lightest volume ever', type: 'min', value: (r) => combinedVolume(Number(r?.parcels) || 0, Number(r?.letters) || 0, letterW), valid: (v) => Number.isFinite(v) && v >= 0, format: (v) => `${v.toFixed(1)} vol` },
        { id: 'quickestRoute', label: 'Quickest route time', type: 'min', value: (r) => routeAdjustedHours(r), valid: (v) => Number.isFinite(v) && v > 0, format: (v) => `${v.toFixed(2)}h` }
      ];
      const activeRow = todayRow;
      const newRecord = (() => {
        if (!activeRow) return null;
        for (const def of recordDefs) {
          const todayValue = def.value(activeRow);
          const isValidToday = typeof def.valid === 'function' ? def.valid(todayValue) : Number.isFinite(todayValue);
          if (!isValidToday) continue;
          const history = worked.filter(r => r.work_date !== todayIso);
          let best = null;
          for (const row of history) {
            const value = def.value(row);
            const isValid = typeof def.valid === 'function' ? def.valid(value) : Number.isFinite(value);
            if (!isValid) continue;
            if (best == null) {
              best = value;
              continue;
            }
            if (def.type === 'min') best = Math.min(best, value);
            else best = Math.max(best, value);
          }
          if (best == null) continue;
          const isRecord = def.type === 'min' ? todayValue < best : todayValue > best;
          if (!isRecord) continue;
          const delta = def.type === 'min' ? best - todayValue : todayValue - best;
          return {
            id: def.id,
            label: def.label,
            headline: def.format(todayValue),
            support: best != null ? `Previous best ${def.format(best)}` : 'New record',
            delta
          };
        }
        return null;
      })();
      const totalThisWeek = sum(thisWeek, r => normalizeHoursValue(r.hours));
      const totalLastWeek = sum(lastWeek, r => normalizeHoursValue(r.hours));
      const weekDeltaPct = totalLastWeek > 0 ? Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100) : null;
      const weekHeavy = weekDeltaPct != null && Math.abs(weekDeltaPct) >= 10;

      let rotatingCard;
      if (latestUnrevealedBadge) {
        rotatingCard = {
          kicker: 'New unlock!',
          headline: 'Milestone reached',
          support: 'Click to reveal',
          action: 'reveal-badge',
          actionMeta: buildBadgeStorageKey(latestUnrevealedBadge),
          cue: `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--good);font-weight:700">new reward</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:100%;background:linear-gradient(90deg,var(--warn),var(--good))"></div></div></div>`
        };
      } else if (newRecord) {
        rotatingCard = {
          kicker: 'New record',
          headline: newRecord.headline,
          support: newRecord.label,
          cue: `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--warn);font-weight:700">${newRecord.support}</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:100%;background:linear-gradient(90deg,var(--brand),var(--warn))"></div></div></div>`
        };
      } else if (unresolvedResidual != null) {
        const isOver = unresolvedResidual > 0;
        rotatingCard = {
          kicker: 'Action needed',
          headline: `${isOver ? '+' : ''}${unresolvedResidual}m`,
          support: 'Route residual needs review',
          cue: `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(${isOver ? '--bad' : '--good'});font-weight:700">${isOver ? 'Longer than predicted' : 'Faster than predicted'}</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(15, Math.min(100, Math.abs(unresolvedResidual)))}%;background:linear-gradient(90deg,var(--warn),var(--bad))"></div></div></div>`
        };
      } else if (officeElevated) {
        rotatingCard = {
          kicker: 'Office time elevated',
          headline: `+${officeDeltaH.toFixed(1)}h`,
          support: `+${officeDeltaPct}% vs same weekday`,
          cue: `<div style="display:flex;align-items:center;gap:8px"><span class="muted" style="font-size:12px">office</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(15, Math.min(100, officeDeltaPct))}%;background:linear-gradient(90deg,var(--warn),var(--brand))"></div></div></div>`
        };
      } else if (weekHeavy) {
        const weekIsHeavy = weekDeltaPct > 0;
        rotatingCard = {
          kicker: `Week running ${weekIsHeavy ? 'heavy' : 'light'}`,
          headline: `${weekIsHeavy ? '+' : ''}${weekDeltaPct}%`,
          support: 'vs last week same range',
          cue: `<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:${weekIsHeavy ? 'var(--warn)' : 'var(--good)'};font-weight:700">${weekIsHeavy ? 'Above recent pace' : 'Below recent pace'}</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(15, Math.min(100, Math.abs(weekDeltaPct)))}%;background:linear-gradient(90deg,${weekIsHeavy ? 'var(--warn),var(--bad)' : 'var(--good),var(--brand)'})"></div></div></div>`
        };
      } else {
        rotatingCard = {
          kicker: 'Day status',
          headline: 'Near normal',
          support: 'No major exceptions detected',
          cue: `<div class="muted" style="font-size:12px">Stable day. Forecast, route model, and weekly load are all within normal bounds.</div>`
        };
      }

      const aggregateMetrics = (rowsSet) => {
        const valid = (rowsSet || []).filter(r => r && r.status !== 'off');
        if (!valid.length) return null;
        const totalHours = sum(valid, r => normalizeHoursValue(r.hours));
        const routeHours = sum(valid, r => routeAdjustedHours(r));
        const officeHours = sum(valid, r => normalizeHoursValue(r.office_minutes));
        const parcels = sum(valid, r => +r.parcels || 0);
        const letters = sum(valid, r => +r.letters || 0);
        const volume = combinedVolume(parcels, letters, letterW);
        return { totalHours, routeHours, officeHours, volume };
      };
      const metricDiff = (current, previous) => {
        if (!(current && previous)) return { text: 'Need more history', bars: `<div class="muted" style="font-size:12px">No matching last-year history yet.</div>`, top: null };
        const defs = [
          { key: 'totalHours', label: 'total hours', fmt: (v) => `${v.toFixed(1)}h` },
          { key: 'routeHours', label: 'route', fmt: (v) => `${v.toFixed(1)}h` },
          { key: 'officeHours', label: 'office', fmt: (v) => `${v.toFixed(1)}h` },
          { key: 'volume', label: 'volume', fmt: (v) => `${v.toFixed(1)} vol` }
        ];
        const ranked = defs
          .map(def => {
            const a = current[def.key];
            const b = previous[def.key];
            const pct = (Number.isFinite(a) && Number.isFinite(b) && b > 0) ? Math.round(((a - b) / b) * 100) : null;
            return { ...def, current: a, previous: b, pct, score: Math.abs(pct ?? 0) };
          })
          .sort((a, b) => b.score - a.score);
        const top = ranked[0];
        if (!top || top.pct == null) return { text: 'Need more history', bars: `<div class="muted" style="font-size:12px">No matching last-year history yet.</div>`, top: null };
        const relation = top.pct > 0 ? 'heavier' : top.pct < 0 ? 'lighter' : 'similar';
        const maxVal = Math.max(top.current || 0, top.previous || 0, 1);
        const currentW = Math.max(8, Math.round(((top.current || 0) / maxVal) * 100));
        const previousW = Math.max(8, Math.round(((top.previous || 0) / maxVal) * 100));
        return {
          text: `${relation} on ${top.label} (${top.pct >= 0 ? '+' : ''}${top.pct}%)`,
          top,
          bars: `
            <div style="display:grid;gap:6px">
              <div style="display:grid;grid-template-columns:44px 1fr auto;gap:8px;align-items:center">
                <span class="muted" style="font-size:12px">Now</span>
                <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${currentW}%;background:linear-gradient(90deg,var(--brand),var(--good))"></div></div>
                <span style="font-size:12px">${top.fmt(top.current)}</span>
              </div>
              <div style="display:grid;grid-template-columns:44px 1fr auto;gap:8px;align-items:center">
                <span class="muted" style="font-size:12px">2025</span>
                <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${previousW}%;background:linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.5))"></div></div>
                <span style="font-size:12px">${top.fmt(top.previous)}</span>
              </div>
            </div>`
        };
      };

      const lyAnchor = now.minus({ years: 1 });
      const startThisYearWeek = startOfWeekMonday(now);
      const startLastYearWeek = startOfWeekMonday(lyAnchor);
      const endLastYearSame = startLastYearWeek.plus({ days: now.weekday - 1 }).endOf('day');
      const sameWeekLastYearRows = worked.filter(r => inRange(r, startLastYearWeek, endLastYearSame));
      const lastYearSameWeekdayRow = sameWeekLastYearRows.find(r => dowIndex(r.work_date) === (now.weekday % 7)) || null;
      const currentTodayMetrics = todayRow ? aggregateMetrics([todayRow]) : null;
      const lastYearTodayMetrics = lastYearSameWeekdayRow ? aggregateMetrics([lastYearSameWeekdayRow]) : null;

      const lastYearWeekRows = worked.filter(r => inRange(r, startLastYearWeek, endLastYearSame));
      const currentWeekMetrics = aggregateMetrics(thisWeek);
      const lastYearWeekMetrics = aggregateMetrics(lastYearWeekRows);
      const todayEcho = metricDiff(currentTodayMetrics, lastYearTodayMetrics);
      const weekEcho = metricDiff(currentWeekMetrics, lastYearWeekMetrics);
      const isStrongHistoricalCallback = (echo) => {
        const top = echo?.top;
        if (!top || top.pct == null) return false;
        if (Math.abs(top.pct) >= 15) return true;
        const hourKeys = new Set(['totalHours', 'routeHours', 'officeHours']);
        if (hourKeys.has(top.key) && Number.isFinite(top.current) && Number.isFinite(top.previous)) {
          return Math.abs(top.current - top.previous) >= 0.5;
        }
        return false;
      };
      const historicalTrigger = isStrongHistoricalCallback(todayEcho)
        ? { scope: 'Today', echo: todayEcho }
        : (isStrongHistoricalCallback(weekEcho) ? { scope: 'Week', echo: weekEcho } : null);
      const lastYearEchoCard = {
        kicker: 'Last Year Echo',
        headline: 'Today + Week',
        support: 'Quick callback to last year',
        cue: `
          <div style="display:grid;gap:10px">
            <div>
              <div style="font-size:12px;font-weight:700;margin-bottom:4px">Today</div>
              <div class="muted" style="font-size:12px;margin-bottom:6px">${todayEcho.text}</div>
              ${todayEcho.bars}
            </div>
            <div>
              <div style="font-size:12px;font-weight:700;margin-bottom:4px">Week</div>
              <div class="muted" style="font-size:12px;margin-bottom:6px">${weekEcho.text}</div>
              ${weekEcho.bars}
            </div>
          </div>`
      };
      if (!latestUnrevealedBadge && !newRecord && unresolvedResidual == null && historicalTrigger) {
        const top = historicalTrigger.echo.top;
        rotatingCard = {
          kicker: 'Last Year Echo',
          headline: `${historicalTrigger.scope} ${top.pct >= 0 ? '+' : ''}${top.pct}%`,
          support: `${historicalTrigger.scope} is ${top.pct >= 0 ? 'heavier' : 'lighter'} on ${top.label}`,
          cue: `
            <div style="display:grid;gap:6px">
              <div style="display:grid;grid-template-columns:44px 1fr auto;gap:8px;align-items:center">
                <span class="muted" style="font-size:12px">Now</span>
                <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(8, Math.round(((top.current || 0) / Math.max(top.current || 0, top.previous || 0, 1)) * 100))}%;background:linear-gradient(90deg,var(--brand),var(--good))"></div></div>
                <span style="font-size:12px">${top.fmt(top.current)}</span>
              </div>
              <div style="display:grid;grid-template-columns:44px 1fr auto;gap:8px;align-items:center">
                <span class="muted" style="font-size:12px">2025</span>
                <div style="height:8px;background:rgba(255,255,255,0.06);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(8, Math.round(((top.previous || 0) / Math.max(top.current || 0, top.previous || 0, 1)) * 100))}%;background:linear-gradient(90deg,rgba(255,255,255,0.25),rgba(255,255,255,0.5))"></div></div>
                <span style="font-size:12px">${top.fmt(top.previous)}</span>
              </div>
            </div>`
        };
      }

      const cards = [workdayCard, routeCard, volumeCard, rotatingCard, lastYearEchoCard];
      el.innerHTML = cards.map(cardDef => `
        <div class="stat" style="min-height:132px;justify-content:space-between${cardDef.action ? ';cursor:pointer' : ''}"${cardDef.action ? ` data-insight-action="${cardDef.action}" data-insight-meta="${cardDef.actionMeta || ''}"` : ''}>
          <div>
            <small>${cardDef.kicker}</small>
            <div class="statValue statValue--lg" style="margin-top:4px">${cardDef.headline}</div>
            <small class="muted" style="display:block;margin-top:6px">${cardDef.support}</small>
          </div>
          <div style="margin-top:12px">${cardDef.cue}</div>
        </div>
      `).join('');
      el.querySelectorAll('[data-insight-action="reveal-badge"]').forEach(node => {
        node.addEventListener('click', () => {
          const key = node.getAttribute('data-insight-meta') || '';
          if (!key) return;
          const nextKeys = [...new Set([...loadRevealedBadgeKeys(), key])];
          saveRevealedBadgeKeys(nextKeys);
          const milestoneCard = document.getElementById('milestoneCard');
          const badgeCard = document.querySelector(`[data-badge-key="${key}"]`);
          (badgeCard || milestoneCard)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const target = badgeCard || milestoneCard;
          if (target) {
            const prevOutline = target.style.outline;
            const prevOffset = target.style.outlineOffset;
            target.style.outline = '2px solid var(--good)';
            target.style.outlineOffset = '4px';
            window.setTimeout(() => {
              target.style.outline = prevOutline;
              target.style.outlineOffset = prevOffset;
            }, 2200);
          }
          buildInsightStrip(rows);
        }, { once: true });
      });
      card.style.display = 'block';
    } catch (_err) {
      card.style.display = 'none';
    }
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
      const { worked, activeDay, activeEnd } = getActiveWorkdayContext(scoped, now);
      const startThis = startOfWeekMonday(now);
      const endThis = activeEnd;
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: activeDay.weekday - 1 }).endOf('day');
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const W0 = worked.filter(r => inRange(r, startThis, endThis));
      const W1 = worked.filter(r => inRange(r, startLast, lastEndSame));
      const daysThisWeek = [...new Set(W0.map(r => r.work_date))].length;
      if (!daysThisWeek) {
        el.textContent = 'No worked days yet — 0 day(s) this week.';
        el.style.display = 'block';
        return;
      }

      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const h0 = sum(W0, r => normalizeHoursValue(r.hours));
      const h1 = sum(W1, r => normalizeHoursValue(r.hours));
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
      const { worked, activeDay, activeEnd } = getActiveWorkdayContext(scoped, now);
      const startThis = startOfWeekMonday(now);
      const endThis = activeEnd;
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: activeDay.weekday - 1 }).endOf('day');
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const thisWeek = worked.filter(r => inRange(r, startThis, endThis));
      const lastWeek = worked.filter(r => inRange(r, startLast, lastEndSame));
      if (!thisWeek.length) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
      }

      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const office0 = sum(thisWeek, r => normalizeHoursValue(r.office_minutes));
      const office1 = sum(lastWeek, r => normalizeHoursValue(r.office_minutes));
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

      const offTodayH = normalizeHoursValue(todayRow.office_minutes);
      const rteTodayH = routeAdjustedHours(todayRow);
      const totTodayH = normalizeHoursValue(todayRow.hours) || offTodayH + rteTodayH;
      const sameDow = worked.filter(r => r.work_date !== todayIso && dowIndex(r.work_date) === dow);
      const avg = (arr, fn) => {
        const values = arr.map(fn).filter(val => val > 0);
        return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
      };
      const offAvgH = avg(sameDow, r => normalizeHoursValue(r.office_minutes));
      const rteAvgH = avg(sameDow, r => routeAdjustedHours(r));
      const totAvgH = avg(sameDow, r => normalizeHoursValue(r.hours));
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
      el.innerHTML = `<small title="Compared to your same-weekday average, not yesterday.">Heaviness (today)</small><div class="pill-row">${pills}</div><div class="muted" style="margin-top:4px;font-size:12px">vs same-weekday average</div>`;
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
      const { worked, activeDay, activeEnd } = getActiveWorkdayContext(scoped, now);
      const startThis = startOfWeekMonday(now);
      const endThis = activeEnd;
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEndSame = startLast.plus({ days: activeDay.weekday - 1 }).endOf('day');
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const thisWeek = worked.filter(r => inRange(r, startThis, endThis));
      const lastWeek = worked.filter(r => inRange(r, startLast, lastEndSame));
      if (!thisWeek.length || !lastWeek.length) {
        el.style.display = 'none';
        return;
      }

      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const off0 = sum(thisWeek, r => normalizeHoursValue(r.office_minutes));
      const off1 = sum(lastWeek, r => normalizeHoursValue(r.office_minutes));
      const rte0 = sum(thisWeek, r => routeAdjustedHours(r));
      const rte1 = sum(lastWeek, r => routeAdjustedHours(r));
      const tot0 = sum(thisWeek, r => normalizeHoursValue(r.hours));
      const tot1 = sum(lastWeek, r => normalizeHoursValue(r.hours));
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

      const now = DateTime.now().setZone(ZONE);
      const isWednesday = now.weekday === 3;
      const isEvening = now.hour >= 17;
      if (!(isWednesday && isEvening)) {
        el.style.display = 'none';
        return;
      }

      const scoped = filterRowsForView(rows || []).filter(r => r && r.status !== 'off');
      if (!scoped.length) {
        el.style.display = 'none';
        el.textContent = '—';
        return;
      }

      const { worked: activeWorked, activeEnd } = getActiveWorkdayContext(scoped, now);
      const startThis = startOfWeekMonday(now);
      const endToday = activeEnd;
      const lastStart = startOfWeekMonday(now.minus({ weeks: 1 }));
      const lastEnd = endOfWeekSunday(now.minus({ weeks: 1 }));
      const priorStart = startOfWeekMonday(now.minus({ weeks: 2 }));
      const priorEnd = endOfWeekSunday(now.minus({ weeks: 2 }));
      const inRange = (row, from, to) => {
        const d = DateTime.fromISO(row.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };

      const worked = activeWorked.filter(r => inRange(r, priorStart, endToday));
      const thisWeek = worked.filter(r => inRange(r, startThis, endToday));
      const lastWeek = worked.filter(r => inRange(r, lastStart, lastEnd));
      const priorWeek = worked.filter(r => inRange(r, priorStart, priorEnd));

      const daysWorked = arr => arr.filter(row => normalizeHoursValue(row.hours) > 0).length;
      const sumHours = arr => arr.reduce((total, row) => total + normalizeHoursValue(row.hours), 0);
      const avg = (total, days) => (days ? total / days : null);
      const pct = (current, baseline) => (current == null || baseline == null || baseline === 0 ? null : ((current - baseline) / baseline) * 100);

      const thisDays = daysWorked(thisWeek);
      const lastDays = daysWorked(lastWeek);
      const priorDays = daysWorked(priorWeek);
      const carryDelta = pct(avg(sumHours(lastWeek), lastDays), avg(sumHours(priorWeek), priorDays));
      const targetDelta = pct(avg(sumHours(thisWeek), thisDays), avg(sumHours(lastWeek), lastDays));
      const progress = Math.min(1, thisDays / 5);

      const blended =
        carryDelta == null && targetDelta == null
          ? null
          : carryDelta == null
            ? targetDelta
            : targetDelta == null
              ? carryDelta
              : (carryDelta * (1 - progress)) + (targetDelta * progress);

      const rounded = blended == null ? null : Math.round(blended);
      let message;
      if (rounded == null || Math.abs(rounded) <= 5) message = 'Similar to last week — average days.';
      else if (rounded > 15) message = 'Much more intense than last week. Deep breath.';
      else if (rounded > 5) message = 'A bit heavier than last week.';
      else if (rounded < -15) message = 'Much lighter than last week.';
      else message = 'A bit lighter than last week.';

      el.textContent = message;
      el.style.display = 'block';
      el.removeAttribute('title');
    } catch (_err) {
      el.style.display = 'none';
    }
  }
  return {
    getLetterWeightForSummary,
    buildInsightStrip,
    buildSmartSummary,
    buildTrendingFactors,
    buildHeavinessToday,
    buildWeekHeaviness,
    buildHeadlineDigest
  };
}
