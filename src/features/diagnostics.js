// Diagnostics + comparisons: residual model, day compare, and volume leaderboard.
import { DateTime, ZONE, dowIndex, moonPhaseEmoji } from '../utils/date.js';
import { DIAGNOSTIC_TAG_CATALOG, normalizeTagEntries, tagLabelForKey } from '../utils/diagnostics.js';
import { fitVolumeTimeModel as fitSharedVolumeTimeModel, learnedLetterWeightFromModel } from '../modules/volumeModel.js';

export function createDiagnostics({
  getFlags,
  filterRowsForView,
  rowsForModelScope,
  getResidualWeighting,
  setHolidayDownweightEnabled,
  isHolidayDownweightEnabled,
  loadDismissedResiduals,
  saveDismissedResiduals,
  parseDismissReasonInput,
  rebuildAll,
  updateAiSummaryAvailability,
  inferBoxholderLabel,
  hasTag,
  summarizeHolidayCatchups,
  getCurrentLetterWeight,
  setCurrentLetterWeight,
  combinedVolume,
  routeAdjustedMinutes,
  colorForDelta,
  onDismissedChange,
  saveDismissedResidualWithTags
}) {
  if (typeof getFlags !== 'function') throw new Error('createDiagnostics: getFlags is required');
  if (typeof filterRowsForView !== 'function') throw new Error('createDiagnostics: filterRowsForView is required');
  if (typeof rowsForModelScope !== 'function') throw new Error('createDiagnostics: rowsForModelScope is required');
  if (typeof getResidualWeighting !== 'function') throw new Error('createDiagnostics: getResidualWeighting is required');
  if (typeof loadDismissedResiduals !== 'function') throw new Error('createDiagnostics: loadDismissedResiduals is required');
  if (typeof saveDismissedResiduals !== 'function') throw new Error('createDiagnostics: saveDismissedResiduals is required');
  if (typeof parseDismissReasonInput !== 'function') throw new Error('createDiagnostics: parseDismissReasonInput is required');
  if (typeof rebuildAll !== 'function') throw new Error('createDiagnostics: rebuildAll is required');
  if (typeof inferBoxholderLabel !== 'function') throw new Error('createDiagnostics: inferBoxholderLabel is required');
  if (typeof hasTag !== 'function') throw new Error('createDiagnostics: hasTag is required');
  if (typeof summarizeHolidayCatchups !== 'function') throw new Error('createDiagnostics: summarizeHolidayCatchups is required');
  if (typeof getCurrentLetterWeight !== 'function') throw new Error('createDiagnostics: getCurrentLetterWeight is required');
  if (typeof setCurrentLetterWeight !== 'function') throw new Error('createDiagnostics: setCurrentLetterWeight is required');
  if (typeof combinedVolume !== 'function') throw new Error('createDiagnostics: combinedVolume is required');
  if (typeof routeAdjustedMinutes !== 'function') throw new Error('createDiagnostics: routeAdjustedMinutes is required');
  if (typeof colorForDelta !== 'function') throw new Error('createDiagnostics: colorForDelta is required');

  const notifyDismissedChange = typeof onDismissedChange === 'function'
    ? onDismissedChange
    : () => {};
  const persistDismissedResidualWithTags = typeof saveDismissedResidualWithTags === 'function'
    ? saveDismissedResidualWithTags
    : () => null;

  let residModelCache = null;
  let latestDiagnosticsContext = null;
  const __testApi = {};

  const DAY_COMPARE_STORE = {
    subject: 'routeStats.dayCompare.subject',
    mode: 'routeStats.dayCompare.mode',
    manual: 'routeStats.dayCompare.manual'
  };

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function minutesDelta(actualMinutes, expectedMinutes) {
    if (actualMinutes == null || expectedMinutes == null) return 0;
    return actualMinutes - expectedMinutes;
  }

  function formatMinutesDelta(deltaMinutes, zScore) {
    const isZeroish = Math.abs(deltaMinutes) < 0.5;
    let cls = 'delta zero';
    let text = '0';
    if (!isZeroish) {
      const sign = deltaMinutes > 0 ? '+' : '−';
      cls = `delta ${deltaMinutes > 0 ? 'pos' : 'neg'}`;
      text = `${sign}${Math.round(Math.abs(deltaMinutes))}m`;
    }
    if (typeof zScore === 'number' && Math.abs(zScore) >= 1.5) {
      cls += ' outlier';
    }
    return `<span class="${cls}">${text}</span>`;
  }

  function buildDismissedMap(list) {
    const map = new Map();
    (list || []).forEach(item => {
      if (item && item.iso) map.set(item.iso, item);
    });
    return map;
  }

  function collectWorkedDays(rows, limit = 365) {
    const all = filterRowsForView(rows || []).filter(r => r && r.status !== 'off' && r.work_date);
    const byDate = new Map();
    all.forEach(row => {
      const key = row.work_date;
      const prev = byDate.get(key);
      if (!prev) {
        byDate.set(key, row);
        return;
      }
      byDate.set(key, choosePreferredDayRow(prev, row));
    });
    const sorted = [...byDate.values()].sort((a, b) => (a.work_date < b.work_date ? 1 : -1));
    return limit && sorted.length > limit ? sorted.slice(0, limit) : sorted;
  }

  function choosePreferredDayRow(a, b) {
    const updatedA = Date.parse(a?.updated_at || a?.created_at || '');
    const updatedB = Date.parse(b?.updated_at || b?.created_at || '');
    if (Number.isFinite(updatedA) && Number.isFinite(updatedB) && updatedA !== updatedB) {
      return updatedA > updatedB ? a : b;
    }
    const score = (row) => {
      const routeHours = normalizeHours(row?.route_minutes ?? row?.routeMinutes);
      const officeHours = normalizeHours(row?.office_minutes ?? row?.officeMinutes);
      const combined = routeHours + officeHours;
      const total = normalizeHours(row?.hours ?? row?.totalHours);
      if (!combined || !total) return 0;
      const ratio = total > combined ? total / combined : combined / total;
      return ratio <= 1.35 ? 2 : 1;
    };
    const scoreA = score(a);
    const scoreB = score(b);
    if (scoreA !== scoreB) return scoreA > scoreB ? a : b;
    return b;
  }

  function buildDayCompareContext(rows, limit = 365) {
    const worked = collectWorkedDays(rows, limit);
    const byDate = new Map();
    worked.forEach(r => byDate.set(r.work_date, r));
    return { worked, byDate };
  }

  function getSubjectMetrics(context, iso) {
    if (!context) return null;
    const row = (iso && context.byDate.get(iso)) || context.worked[0];
    return row ? dayMetricsFromRow(row, { source: 'subject', label: row.work_date }) : null;
  }

  function getLastSameWeekdayMetrics(context, iso) {
    if (!context || !iso) return null;
    const targetDow = dowIndex(iso);
    for (const row of context.worked) {
      if (row.work_date === iso) continue;
      if (row.work_date < iso && dowIndex(row.work_date) === targetDow) {
        const label = `Last ${WEEKDAY_NAMES[targetDow]} (${row.work_date})`;
        return dayMetricsFromRow(row, { source: 'lastSameWeekday', label });
      }
    }
    return null;
  }

  function getWeekdayBaselineMetrics(context, iso) {
    if (!context || !iso) return null;
    const targetDow = dowIndex(iso);
    const candidates = context.worked.filter(r => r.work_date !== iso && dowIndex(r.work_date) === targetDow);
    if (!candidates.length) return null;
    const label = `Typical ${WEEKDAY_NAMES[targetDow]}`;
    return aggregateDayMetrics(candidates, { source: 'weekdayAverage', type: 'average', dow: targetDow, label });
  }

  function getCustomReferenceMetrics(context, iso) {
    if (!context || !iso) return null;
    const row = context.byDate.get(iso);
    return row ? dayMetricsFromRow(row, { source: 'manualReference', label: row.work_date }) : null;
  }

  function dayMetricsFromRow(row, meta) {
    if (!row) return null;
    const parcels = +row.parcels || 0;
    const letters = +row.letters || 0;
    const volume = combinedVolume(parcels, letters);
    const routeHours = normalizeHours(row.route_minutes ?? row.routeMinutes);
    const officeHours = normalizeHours(row.office_minutes ?? row.officeMinutes);
    const totalHours = normalizeTotalHours(row, routeHours, officeHours);
    const miles = Number(row.miles) || 0;
    const efficiencyMinutes = volume > 0 ? (routeHours * 60) / volume : null;
    return {
      ...meta,
      workDate: row.work_date,
      totalHours,
      routeHours,
      officeHours,
      parcels,
      letters,
      volume,
      miles,
      mood: row.mood || null,
      notes: row.notes || null,
      weather: inferWeather(row),
      reason: inferReason(row),
      efficiencyMinutes
    };
  }

  function aggregateDayMetrics(rows, meta) {
    const valid = rows.filter(Boolean);
    if (!valid.length) return null;
    const totals = valid.reduce((acc, row) => {
      const routeHours = normalizeHours(row.route_minutes ?? row.routeMinutes);
      const officeHours = normalizeHours(row.office_minutes ?? row.officeMinutes);
      acc.totalHours += normalizeTotalHours(row, routeHours, officeHours);
      acc.routeHours += routeHours;
      acc.officeHours += officeHours;
      acc.parcels += +row.parcels || 0;
      acc.letters += +row.letters || 0;
      acc.miles += +row.miles || 0;
      return acc;
    }, { totalHours:0, routeHours:0, officeHours:0, parcels:0, letters:0, miles:0 });
    const volume = combinedVolume(totals.parcels, totals.letters) / valid.length;
    const efficiencyMinutes = volume > 0 ? (totals.routeHours * 60) / valid.length / volume : null;
    return {
      ...meta,
      count: valid.length,
      totalHours: totals.totalHours / valid.length,
      routeHours: totals.routeHours / valid.length,
      officeHours: totals.officeHours / valid.length,
      parcels: totals.parcels / valid.length,
      letters: totals.letters / valid.length,
      miles: totals.miles / valid.length,
      volume,
      efficiencyMinutes,
      raw: { rows: valid, totals }
    };
  }

  __testApi.dayMetricsFromRow = dayMetricsFromRow;
  __testApi.aggregateDayMetrics = aggregateDayMetrics;

  function computeDeltaDetails(subject, reference) {
    if (!subject || !reference) return { rows: [], highlights: [], reasoning: '' };
    const metricDefs = [
      { key: 'totalHours', label: 'Total hours', decimals: 2, suffix: 'h' },
      { key: 'routeHours', label: 'Route hours', decimals: 2, suffix: 'h' },
      { key: 'officeHours', label: 'Office hours', decimals: 2, suffix: 'h' },
      { key: 'parcels', label: 'Parcels', decimals: 0 },
      { key: 'letters', label: 'Letters', decimals: 0 },
      { key: 'volume', label: 'Volume (parcels + w×letters)', decimals: 2 },
      { key: 'miles', label: 'Miles', decimals: 1, suffix: 'mi' },
      { key: 'efficiencyMinutes', label: 'Route minutes per volume', decimals: 1, suffix: 'm/vol', invert: true }
    ];

    const rowsOut = [];
    const highlights = [];

    for (const def of metricDefs) {
      const subjVal = subject[def.key];
      const refVal = reference[def.key];
      const delta = (subjVal != null && refVal != null) ? subjVal - refVal : null;
      const pct = (refVal != null && refVal !== 0 && delta != null) ? (delta / refVal) * 100 : null;
      const colorDelta = def.invert && pct != null ? -pct : pct;
      const displayDelta = delta == null ? '—' : formatNumber(delta, { decimals: def.decimals ?? 2, suffix: def.suffix || '' });
      const pctTxt = pct == null || !Number.isFinite(pct) ? '' : ` (${pct >= 0 ? '+' : ''}${Math.round(pct)}%)`;
      const deltaText = delta == null ? '—' : `${displayDelta}${pctTxt}`;
      const subjectText = formatNumber(subjVal, { decimals: def.decimals ?? 2, suffix: def.suffix || '' });
      const referenceText = formatNumber(refVal, { decimals: def.decimals ?? 2, suffix: def.suffix || '' });
      const color = colorForDelta(colorDelta ?? 0).fg;
      rowsOut.push({
        key: def.key,
        label: def.label,
        subjectText,
        referenceText,
        deltaText,
        color,
        delta,
        pct,
        score: Math.abs(pct ?? delta ?? 0)
      });
      if (delta != null) {
        highlights.push({ key: def.key, label: def.label, deltaText, color, score: Math.abs(pct ?? delta ?? 0) });
      }
    }

    highlights.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    const reasoningBits = [];
    if (subject.reason) reasoningBits.push(`Subject reason: ${subject.reason}`);
    if (reference.reason) reasoningBits.push(`Reference reason: ${reference.reason}`);
    const reasoning = reasoningBits.join(' · ');

    return { rows: rowsOut, highlights, reasoning };
  }

  __testApi.deltaDetails = computeDeltaDetails;

  function inferWeather(row) {
    const raw = String(row.weather_json || '');
    const parts = raw.split('·').map(s => s.trim()).filter(Boolean);
    return parts.filter(p => !/^Reason:/i.test(p)).join(' · ');
  }

  function inferReason(row) {
    const raw = String(row.weather_json || '');
    const match = raw.match(/Reason:\s*([^·]+)/i);
    return match ? match[1].trim() : null;
  }

  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function summarizeEntry(row, model, stats, dismissedMap) {
    const iso = row.work_date;
    const dtObj = DateTime.fromISO(iso, { zone: ZONE });
    const weekday = dtObj.toFormat('ccc');
    const monthDay = dtObj.toFormat('LLL dd');
    const isHolidayCatchup = hasTag(row, 'holiday_catchup');
    const dt = `${weekday} ${monthDay}`;
    const dtHtml = isHolidayCatchup
      ? `<span class="diag-day-amber" title="Holiday catch-up day">${escapeHtml(dt)}</span>`
      : escapeHtml(dt);
    const actualMinutes = routeAdjustedMinutes(row);
    const expectedMinutes = model ? (model.a + model.bp * (+row.parcels || 0) + model.bl * (+row.letters || 0)) : null;
    const deltaMinutes = minutesDelta(actualMinutes, expectedMinutes);
    const zScore = stats.std > 0 ? (deltaMinutes - stats.mean) / stats.std : null;
    const deltaHtml = formatMinutesDelta(deltaMinutes, zScore);
    const parcels = +row.parcels || 0;
    const letters = +row.letters || 0;
    const boxholders = escapeHtml(inferBoxholderLabel(row));
    const weatherRaw = String(row.weather_json || '');
    const weatherPieces = weatherRaw.split('·').map(s => s.trim()).filter(Boolean);
    const weatherDisplayParts = weatherPieces
      .filter(p => !/^Reason:/i.test(p) && !/^SecondTrip:/i.test(p) && !/^Box:/i.test(p) && !/^Break:/i.test(p))
      .map(p => p.replace(/partly\s+cloudy/i, 'PC'));
    const weatherSnippet = weatherRaw.replace(/Reason:\s*[^·]+/ig, '').trim();
    const weatherShort = weatherDisplayParts.length ? weatherDisplayParts.slice(0, 2).join(' · ') : '—';
    const weather = escapeHtml(weatherShort);
    const weatherCell = weather;
    const rawNotes = (row.notes || '').trim();
    const notePlainFull = rawNotes.replace(/\s+/g, ' ').trim();
    const noteFullEncoded = encodeURIComponent(notePlainFull);
    const notesHtml = notePlainFull ? `<button class="ghost diag-note" data-note-full="${noteFullEncoded}">Read full</button>` : '—';
    return {
      iso,
      dt,
      dtHtml,
      parcels,
      letters,
      expectedMinutes,
      actualMinutes,
      deltaHtml,
      boxholders,
      weatherCell,
      notesHtml,
      weatherSnippet,
      notesPlain: notePlainFull
    };
  }

  function fitVolumeTimeModel(rows, opts) {
    return fitSharedVolumeTimeModel(rows, {
      weightFn: opts?.weightFn,
      minutesForRow: routeAdjustedMinutes
    });
  }

  function learnedLetterWeight(model) {
    return learnedLetterWeightFromModel(model);
  }

  function computeResidualForRow(row, model) {
    if (!model) return null;
    const y = routeAdjustedMinutes(row);
    const p = +row.parcels || 0;
    const l = +row.letters || 0;
    const yhat = model.a + model.bp * p + model.bl * l;
    return y - yhat;
  }

  function getResidualModel(rows) {
    if (residModelCache) return residModelCache;
    const worked = (rows || [])
      .filter(r => r && r.status !== 'off' && ((+r.parcels || 0) + (+r.letters || 0) > 0))
      .sort((a, b) => (a.work_date < b.work_date ? -1 : 1));
    const scoped = rowsForModelScope(worked);
    const weightCfg = getResidualWeighting();
    residModelCache = fitVolumeTimeModel(scoped, weightCfg.fn ? { weightFn: weightCfg.fn } : undefined);
    return residModelCache;
  }

  function renderModelStrip(model) {
    const el = document.getElementById('liveModelStrip');
    if (!el) return;
    if (!model) {
      el.style.display = 'none';
      return;
    }
    const bp = document.getElementById('lm-bp');
    const bl = document.getElementById('lm-bl');
    const wv = document.getElementById('lm-w');
    const r2 = document.getElementById('lm-r2');
    const weight = (model.bp && isFinite(model.bp)) ? (model.bl / model.bp) : NaN;
    if (bp) bp.textContent = model.bp.toFixed(2);
    if (bl) bl.textContent = model.bl.toFixed(3);
    if (wv) wv.textContent = isFinite(weight) ? weight.toFixed(2) : '—';
    if (r2) r2.textContent = `${(Math.max(0, Math.min(1, model.r2)) * 100).toFixed(0)}%`;
    el.style.display = 'flex';
  }

  function buildDiagnostics(rows) {
    const filteredRows = filterRowsForView(rows || []);
    const card = document.getElementById('diagnosticsCard');
    if (!card) return;
    card.style.display = 'block';
    residModelCache = null;

    const worked = filteredRows
      .filter(r => r && r.status !== 'off' && ((+r.parcels || 0) + (+r.letters || 0) > 0))
      .sort((a, b) => (a.work_date < b.work_date ? -1 : 1));
    const scoped = rowsForModelScope(worked);
    const weightCfg = getResidualWeighting();
    const model = fitVolumeTimeModel(scoped, weightCfg.fn ? { weightFn: weightCfg.fn } : undefined);
    renderModelStrip(model);

    const badge = document.getElementById('diagModelBadge');
    const summaryEl = document.getElementById('diagSummary');
    const weightBtn = document.getElementById('diagHolidayWeightBtn');
    const weightNote = document.getElementById('diagWeightNote');
    const manageDismissBtn = document.getElementById('diagManageDismissed');
    const tbody = document.getElementById('diagTableBody');
    const toggleBtn = document.getElementById('toggleDiagDetails');
    const details = document.getElementById('diagDetails');

    if (weightBtn) {
      if (!weightBtn.dataset.bound) {
        weightBtn.addEventListener('click', () => {
          const next = !isHolidayDownweightEnabled?.();
          setHolidayDownweightEnabled?.(next);
          residModelCache = null;
          rebuildAll();
        });
        weightBtn.dataset.bound = '1';
      }
      const enabled = !!weightCfg.enabled;
      weightBtn.classList.toggle('active', enabled);
      weightBtn.textContent = enabled ? 'Downweight holiday catch-up · ON' : 'Downweight holiday catch-up · OFF';
    }

    if (manageDismissBtn && !manageDismissBtn.dataset.bound) {
      manageDismissBtn.addEventListener('click', () => {
        const list = loadDismissedResiduals();
        if (!list.length) {
          window.alert('No dismissed residuals yet.');
          return;
        }
        const lines = list
          .map(item => {
            const tagSummary = (item.tags || [])
              .map(tag => {
                const label = tagLabelForKey(tag.key || tag.reason);
                return tag.minutes != null ? `${label} ${tag.minutes}m` : label;
              })
              .join(', ');
            return `${item.iso}${tagSummary ? ` · ${tagSummary}` : ''}`;
          })
          .join('\n');
        const input = window.prompt(`Dismissed residuals:\n${lines}\n\nEnter a date (yyyy-mm-dd) to reinstate, or leave blank to keep all:`, '');
        if (!input) return;
        const trimmed = input.trim();
        if (!trimmed) return;
        const updated = list.filter(item => item.iso !== trimmed);
        if (updated.length === list.length) {
          window.alert(`No dismissed entry found for ${trimmed}.`);
          return;
        }
        saveDismissedResiduals(updated);
        notifyDismissedChange();
        rebuildAll();
      });
      manageDismissBtn.dataset.bound = '1';
    }

    if (!model) {
      renderModelStrip(null);
      if (badge) badge.textContent = 'Insufficient data';
      if (summaryEl) summaryEl.textContent = 'Need more worked days with parcels/letters to estimate impact.';
      if (tbody) tbody.innerHTML = '';
      return;
    }

    const dismissedList = loadDismissedResiduals();
    const dismissedMap = buildDismissedMap(dismissedList);
    const weight = learnedLetterWeight(model);
    if (weight != null) {
      const current = getCurrentLetterWeight();
      const smoothed = +(0.7 * current + 0.3 * weight).toFixed(4);
      setCurrentLetterWeight(smoothed);
    }
    if (badge) {
      const wTxt = weight != null ? weight.toFixed(2) : '—';
      badge.innerHTML = `<small class="modelMetric">bp</small> <span>${model.bp.toFixed(2)}</span> · <small class="modelMetric">bl</small> <span>${model.bl.toFixed(3)}</span> · <small class="modelMetric">w</small> <span>${wTxt}</span>`;
    }

    const catchupSummary = summarizeHolidayCatchups(filteredRows);
    let summaryTextForContext = '';
    if (summaryEl) {
      const pct = Math.round(Math.max(0, Math.min(1, model.r2)) * 100);
      let summaryText = `Fit on ${model.n} days · R² ${pct}% · Predicts route minutes from parcels & letters.`;
      if (catchupSummary.count) {
        const extraHours = catchupSummary.addedMinutes ? (catchupSummary.addedMinutes / 60).toFixed(1) : null;
        const ratioTxt = catchupSummary.avgRouteRatio ? `${catchupSummary.avgRouteRatio.toFixed(2)}× route` : null;
        const parts = [`${catchupSummary.count} holiday catch-up day${catchupSummary.count === 1 ? '' : 's'}`];
        if (extraHours && extraHours !== '0.0') parts.push(`${extraHours}h extra`);
        if (ratioTxt) parts.push(ratioTxt);
        summaryText += ` · ${parts.join(' • ')}`;
      }
      if (weightCfg.enabled) {
        const avgW = model.weighting?.averageWeight;
        const avgTxt = avgW ? ` (~${avgW.toFixed(2)}× weight)` : '';
        summaryText += ` · Holiday downweight ON${avgTxt}`;
      }
      if (dismissedList.length) {
        summaryText += ` · ${dismissedList.length} dismissed`;
      }
      summaryEl.textContent = summaryText;
      summaryTextForContext = summaryText;
    }

    if (weightNote) {
      if (!model) {
        weightNote.textContent = weightCfg.enabled ? 'Need more data to apply weights.' : 'Weights off (full impact).';
      } else if (!weightCfg.enabled) {
        weightNote.textContent = 'Weights off (full impact).';
      } else if (model.weighting) {
        const dw = model.weighting.downweighted || 0;
        const avg = model.weighting.averageWeight || 1;
        weightNote.textContent = dw
          ? `${dw} day${dw === 1 ? '' : 's'} at ~${avg.toFixed(2)}× weight`
          : 'No holiday catch-up days in range.';
      } else {
        weightNote.textContent = 'Weights off (full impact).';
      }
    }

    if (toggleBtn && details && !toggleBtn.dataset.bound) {
      const labelPill = toggleBtn.querySelector('.pill[aria-hidden]');
      const setLabel = () => {
        if (!labelPill) return;
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        labelPill.textContent = expanded ? 'Hide' : 'Details';
      };
      toggleBtn.dataset.bound = '1';
      toggleBtn.addEventListener('click', () => {
        const show = details.style.display === 'none' || !details.style.display;
        details.style.display = show ? 'block' : 'none';
        toggleBtn.setAttribute('aria-expanded', show ? 'true' : 'false');
        setLabel();
      });
      toggleBtn.setAttribute('aria-expanded', 'false');
      setLabel();
    }

    if (tbody) {
      const residuals = model.residuals || [];
      const stats = (() => {
        const pool = residuals.filter(r => !dismissedMap.has(r.iso));
        if (!pool.length) return { mean: 0, std: 0 };
        const mean = pool.reduce((acc, r) => acc + r.residMin, 0) / pool.length;
        if (pool.length < 2) return { mean, std: 0 };
        const variance = pool.reduce((acc, r) => {
          const diff = r.residMin - mean;
          return acc + diff * diff;
        }, 0) / (pool.length - 1);
        return { mean, std: Math.sqrt(Math.max(variance, 0)) };
      })();
      const visibleResiduals = residuals.filter(r => !dismissedMap.has(r.iso));
      const top = [...visibleResiduals]
        .sort((a, b) => Math.abs(b.residMin) - Math.abs(a.residMin))
        .slice(0, 10);
      const topContext = [];
      tbody.innerHTML = top.map(d => {
        const rowSummary = summarizeEntry(d.row, model, stats, dismissedMap);
        topContext.push({
          iso: d.iso,
          deltaMinutes: Math.round(d.residMin),
          parcels: Math.round(d.parcels || 0),
          letters: Math.round(d.letters || 0),
          expectedMinutes: d.predMin,
          actualMinutes: d.routeMin,
          boxholders: inferBoxholderLabel(d.row),
          weather: rowSummary.weatherSnippet,
          notes: rowSummary.notesPlain,
          tags: Array.isArray(d.row?._tags) ? d.row._tags : []
        });
        return `<tr>
          <td class="text-left">${rowSummary.dtHtml || escapeHtml(rowSummary.dt)}</td>
          <td>${rowSummary.parcels}</td>
          <td>${rowSummary.letters}</td>
          <td>${(d.predMin / 60).toFixed(2)}</td>
          <td>${(d.routeMin / 60).toFixed(2)}</td>
          <td>${rowSummary.deltaHtml}</td>
          <td class="text-left">${rowSummary.boxholders}</td>
          <td class="text-left weather-cell">${rowSummary.weatherCell}</td>
          <td class="notes-cell">${rowSummary.notesHtml}</td>
          <td><button class="ghost diag-dismiss" data-dismiss-iso="${d.iso}">Tag & dismiss</button></td>
        </tr>`;
      }).join('');

      latestDiagnosticsContext = {
        generatedAt: new Date().toISOString(),
        residuals: topContext,
        dismissed: dismissedList,
        summaryText: summaryTextForContext,
        stats: { mean: stats.mean, std: stats.std },
        catchupSummary,
        weight: {
          enabled: weightCfg.enabled,
          averageWeight: model.weighting?.averageWeight ?? null,
          downweighted: model.weighting?.downweighted ?? 0
        }
      };
      updateAiSummaryAvailability?.();

      // Delegate clicks at tbody level so handlers survive table rerenders
      // and remain reliable on touch devices.
      tbody.onclick = async (event) => {
        const dismissBtn = event.target?.closest?.('.diag-dismiss');
        if (dismissBtn) {
          const iso = dismissBtn.dataset.dismissIso;
          if (!iso) return;
          const ok = await triggerTagDismissForIso(rows, iso, { residuals, model });
          if (!ok) return;
          return;
        }

        const noteBtn = event.target?.closest?.('.diag-note');
        if (noteBtn) {
          const note = noteBtn.dataset.noteFull ? decodeURIComponent(noteBtn.dataset.noteFull) : '';
          if (!note) {
            window.alert('No notes recorded for this day.');
          } else {
            window.alert(note);
          }
        }
      };
    }
  }

  async function triggerTagDismissForIso(rows, iso, context = {}) {
    if (!iso) return false;
    const filteredRows = filterRowsForView(rows || []);
    const model = context.model || getResidualModel(filteredRows);
    if (!model) {
      window.alert('Diagnostics model is not available yet.');
      return false;
    }
    const residuals = Array.isArray(context.residuals) && context.residuals.length
      ? context.residuals
      : (model.residuals || []);
    const residual = residuals.find(r => r.iso === iso) || null;
    const row = residual?.row || filteredRows.find(r => r?.work_date === iso && r?.status !== 'off') || null;
    if (!row) {
      window.alert(`No worked entry found for ${iso}.`);
      return false;
    }
    const deltaMinutes = residual ? Math.round(residual.residMin) : Math.round(computeResidualForRow(row, model) || 0);
    const parcels = residual ? Math.round(residual.parcels) : Math.round(+row.parcels || 0);
    const letters = residual ? Math.round(residual.letters) : Math.round(+row.letters || 0);
    const defaultReason = (() => {
      if (parcels != null && parcels > 0 && letters != null && letters === 0) return [{ key: 'parcels', reason: 'parcels', minutes: null }];
      if (letters != null && letters > parcels) return [{ key: 'letters', reason: 'letters', minutes: null }];
      return [];
    })();
    const hintParts = [];
    if (Number.isFinite(deltaMinutes)) hintParts.push(`Residual: ${deltaMinutes}m`);
    if (parcels != null) hintParts.push(`Parcels: ${parcels}`);
    if (letters != null) hintParts.push(`Letters: ${letters}`);
    const tagResult = await showTagDismissDialog({
      title: `Tag residual ${iso}`,
      hint: hintParts.join(' · '),
      defaults: defaultReason
    });
    if (!tagResult) return false;
    const tags = normalizeTagEntries(tagResult.tags || [], { notedAt: new Date().toISOString() });
    if (!tags.length) {
      window.alert('No reason provided; dismissal cancelled.');
      return false;
    }
    persistDismissedResidualWithTags({ iso, tags });
    window.renderTomorrowForecast?.();
    notifyDismissedChange();
    buildDiagnostics(rows);
    return true;
  }

  function showTagDismissDialog({ title, hint, defaults }) {
    const normalizedDefaults = normalizeTagEntries(defaults || []);
    const selectedDefaults = new Map(normalizedDefaults.map(t => [t.key || t.reason, t]));
    const dialog = document.createElement('dialog');
    dialog.style.maxWidth = '560px';
    dialog.style.width = 'calc(100vw - 32px)';
    dialog.innerHTML = `
      <form method="dialog" style="display:flex;flex-direction:column;gap:10px">
        <h4 style="margin:0">${escapeHtml(title || 'Tag & dismiss')}</h4>
        <small class="muted">${escapeHtml(hint || 'Select one or more reasons and optional +/- minutes.')}</small>
        <div style="display:grid;gap:8px;max-height:52vh;overflow:auto;padding:4px 2px">
          ${DIAGNOSTIC_TAG_CATALOG.map(tag => {
            const def = selectedDefaults.get(tag.key) || null;
            const minutes = def && def.minutes != null ? String(def.minutes) : '';
            return `
              <label class="pill" style="display:grid;grid-template-columns:auto 1fr minmax(96px,110px);align-items:center;gap:8px;padding:8px 10px">
                <input type="checkbox" data-tag-key="${tag.key}" ${def ? 'checked' : ''}>
                <span>${escapeHtml(tag.label)}</span>
                <input type="number" step="1" data-minutes-for="${tag.key}" value="${escapeHtml(minutes)}" placeholder="min +/-">
              </label>
            `;
          }).join('')}
        </div>
        <label style="display:grid;gap:6px">
          <small class="muted">Optional note for Misc</small>
          <input type="text" id="diagDismissMiscNote" placeholder="e.g., scanner issue">
        </label>
        <div class="row" style="justify-content:flex-end">
          <button value="cancel" class="ghost" type="button" id="diagDismissCancel">Cancel</button>
          <button value="ok" class="btn" type="button" id="diagDismissSave">Save Tag & Dismiss</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    const checkboxNodes = Array.from(dialog.querySelectorAll('input[type="checkbox"][data-tag-key]'));
    const saveBtn = dialog.querySelector('#diagDismissSave');
    const cancelBtn = dialog.querySelector('#diagDismissCancel');
    let result = null;
    const collect = () => {
      const tags = checkboxNodes
        .filter(node => node.checked)
        .map(node => {
          const key = node.dataset.tagKey;
          const minInput = dialog.querySelector(`input[data-minutes-for="${key}"]`);
          const rawMinutes = (minInput?.value || '').trim();
          const minutes = rawMinutes !== '' ? Number(rawMinutes) : null;
          const reason = key === 'misc'
            ? ((dialog.querySelector('#diagDismissMiscNote')?.value || '').trim() || 'misc')
            : key;
          return {
            key,
            reason,
            minutes: Number.isFinite(minutes) ? minutes : null
          };
        });
      return { tags };
    };
    const closeDialog = () => {
      try { dialog.close(); } catch (_) { }
      dialog.remove();
    };
    return new Promise(resolve => {
      cancelBtn?.addEventListener('click', () => {
        result = null;
        closeDialog();
        resolve(null);
      });
      saveBtn?.addEventListener('click', () => {
        const payload = collect();
        result = payload.tags.length ? payload : null;
        if (!result) {
          window.alert('Select at least one tag to dismiss this residual.');
          return;
        }
        closeDialog();
        resolve(result);
      });
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        result = null;
        closeDialog();
        resolve(null);
      });
      try {
        dialog.showModal();
      } catch (_) {
        const fallback = window.prompt('Enter reason tags like "parcels+15, weather-10, flats":', '');
        closeDialog();
        if (fallback == null) {
          resolve(null);
          return;
        }
        const parsed = parseDismissReasonInput(fallback);
        resolve(parsed.length ? { tags: parsed } : null);
      }
    });
  }

  function formatNumber(val, opts) {
    const decimals = opts?.decimals ?? 2;
    const suffix = opts?.suffix || '';
    const n = val == null ? null : Number(val);
    if (n == null || !Number.isFinite(n)) return '—';
    return `${n.toFixed(decimals)}${suffix}`;
  }

  function normalizeHours(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (Math.abs(n) > 24) return n / 60;
    return n;
  }

  function normalizeTotalHours(row, routeHours, officeHours) {
    const stored = normalizeHours(row?.hours ?? row?.totalHours);
    const combined = routeHours + officeHours;
    if (!Number.isFinite(stored) || stored <= 0) return combined;
    if (combined > 0) {
      const suspiciouslyHigh = stored - combined >= 2 && stored > (combined * 1.5);
      if (suspiciouslyHigh) return combined;
    }
    return stored;
  }

  function buildDayCompare(rows) {
    const flags = getFlags();
    const filteredRows = filterRowsForView(rows || []);
    const card = document.getElementById('dayCompareCard');
    const dailyMovers = document.getElementById('dcDailyMovers');
    if (!card) {
      if (dailyMovers) dailyMovers.style.display = 'none';
      return;
    }
    if (!flags || !flags.dayCompare) {
      card.style.display = 'none';
      if (dailyMovers) dailyMovers.style.display = 'none';
      return;
    }
    card.style.display = 'block';

    const subjectSelect = document.getElementById('dcSubjectSelect');
    const referenceSelect = document.getElementById('dcReferenceMode');
    const manualPicker = document.getElementById('dcManualPicker');
    const manualSelect = document.getElementById('dcManualSelect');
    const emptyState = document.getElementById('dcEmpty');
    const compareState = document.getElementById('dcCompare');
    const subjectLabel = document.getElementById('dcSubjectLabel');
    const referenceLabel = document.getElementById('dcReferenceLabel');
    const subjectPills = document.getElementById('dcSubjectPills');
    const referencePills = document.getElementById('dcReferencePills');
    const subjectNotes = document.getElementById('dcSubjectNotes');
    const referenceNotes = document.getElementById('dcReferenceNotes');
    const highlightsRow = document.getElementById('dcHighlights');
    const reasoningEl = document.getElementById('dcReasoning');
    const tableBody = document.getElementById('dcTableBody');
    const toggleBtn = document.getElementById('dcToggleRef');
    if (!subjectSelect || !referenceSelect || !manualSelect || !emptyState || !compareState || !tableBody) return;

    const context = buildDayCompareContext(filteredRows, 365);
    const worked = context.worked;
    if (!worked.length) {
      emptyState.textContent = 'No worked days yet. Add an entry to compare.';
      emptyState.style.display = 'block';
      compareState.style.display = 'none';
      if (toggleBtn) toggleBtn.style.display = 'none';
      if (dailyMovers) dailyMovers.style.display = 'none';
      return;
    }

    const storedSubject = localStorage.getItem(DAY_COMPARE_STORE.subject);
    let storedMode = localStorage.getItem(DAY_COMPARE_STORE.mode) || 'last';
    const storedManualInitial = localStorage.getItem(DAY_COMPARE_STORE.manual);

    function formatOption(row) {
      try {
        const dt = DateTime.fromISO(row.work_date, { zone: ZONE });
        const weekday = dt.toFormat('ccc');
        const label = dt.toFormat('LLL dd');
        const total = Number(row.hours || row.totalHours || 0).toFixed(2);
        const moon = moonPhaseEmoji(row.work_date);
        return `${row.work_date} · ${weekday} ${label} · ${total}h ${moon}`;
      } catch (_) {
        return row.work_date;
      }
    }

    subjectSelect.innerHTML = worked.map(row => `<option value="${row.work_date}">${formatOption(row)}</option>`).join('');
    subjectSelect.value = (storedSubject && subjectSelect.querySelector(`option[value="${storedSubject}"]`)) ? storedSubject : (worked[0]?.work_date || '');

    const manualOption = referenceSelect.querySelector('option[value="manual"]');
    const manualAvailable = worked.length > 1;
    if (manualOption) {
      manualOption.disabled = !manualAvailable;
      if (!manualAvailable && storedMode === 'manual') storedMode = 'last';
    }
    referenceSelect.value = storedMode;

    function subjectIso() {
      return subjectSelect.value || worked[0]?.work_date;
    }

    function modeLabel(mode) {
      if (mode === 'last') return 'Last weekday';
      if (mode === 'baseline') return 'Baseline avg';
      if (mode === 'manual') return 'Picked day';
      return mode;
    }

    function populateManualOptions() {
      const current = subjectIso();
      const altRows = worked.filter(r => r.work_date !== current);
      manualSelect.innerHTML = altRows.map(row => `<option value="${row.work_date}">${formatOption(row)}</option>`).join('');
      if (!altRows.length) {
        manualSelect.value = '';
        return;
      }
      const latestStored = localStorage.getItem(DAY_COMPARE_STORE.manual) || storedManualInitial;
      manualSelect.value = (latestStored && manualSelect.querySelector(`option[value="${latestStored}"]`)) ? latestStored : altRows[0].work_date;
    }

    populateManualOptions();
    if (manualPicker) manualPicker.style.display = referenceSelect.value === 'manual' ? 'block' : 'none';

    function summarizeExtras(metric) {
      if (!metric) return '';
      const parts = [];
      if (metric.mood) parts.push(`Mood: ${metric.mood}`);
      if (metric.weather) parts.push(`Weather: ${metric.weather}`);
      if (metric.reason) parts.push(`Reason: ${metric.reason}`);
      if (metric.notes) parts.push(`Notes: ${metric.notes}`);
      return parts.join(' • ');
    }

  function pillHtml(label, value) {
    return `<span class="pill"><small>${label}</small> <b>${value}</b></span>`;
  }

    function render() {
      const subjectMetrics = getSubjectMetrics(context, subjectIso());
      let referenceMetrics;
      const mode = referenceSelect.value;
      if (mode === 'last') referenceMetrics = getLastSameWeekdayMetrics(context, subjectIso());
      else if (mode === 'baseline') referenceMetrics = getWeekdayBaselineMetrics(context, subjectIso());
      else if (mode === 'manual') referenceMetrics = getCustomReferenceMetrics(context, manualSelect.value);
      else referenceMetrics = null;

      if (!subjectMetrics || !referenceMetrics) {
        emptyState.textContent = 'Need more comparison data. Add more worked days.';
        emptyState.style.display = 'block';
        compareState.style.display = 'none';
        if (dailyMovers) dailyMovers.style.display = 'none';
        return;
      }

      emptyState.style.display = 'none';
      compareState.style.display = 'block';
      if (dailyMovers) dailyMovers.style.display = 'block';

      subjectLabel.textContent = subjectMetrics.label || subjectMetrics.workDate;
      referenceLabel.textContent = referenceMetrics.label || referenceMetrics.workDate;

      const { rows: tableRows, highlights, reasoning } = computeDeltaDetails(subjectMetrics, referenceMetrics);

      subjectPills.innerHTML = [
        pillHtml('Total', formatNumber(subjectMetrics.totalHours, { decimals: 2, suffix: 'h' })),
        pillHtml('Route', formatNumber(subjectMetrics.routeHours, { decimals: 2, suffix: 'h' })),
        pillHtml('Office', formatNumber(subjectMetrics.officeHours, { decimals: 2, suffix: 'h' })),
        pillHtml('Volume', formatNumber(subjectMetrics.volume, { decimals: 2 })),
        pillHtml('Eff.', formatNumber(subjectMetrics.efficiencyMinutes, { decimals: 1, suffix: 'm/vol' }))
      ].join(' ');

      referencePills.innerHTML = [
        pillHtml('Total', formatNumber(referenceMetrics.totalHours, { decimals: 2, suffix: 'h' })),
        pillHtml('Route', formatNumber(referenceMetrics.routeHours, { decimals: 2, suffix: 'h' })),
        pillHtml('Office', formatNumber(referenceMetrics.officeHours, { decimals: 2, suffix: 'h' })),
        pillHtml('Volume', formatNumber(referenceMetrics.volume, { decimals: 2 })),
        pillHtml('Eff.', formatNumber(referenceMetrics.efficiencyMinutes, { decimals: 1, suffix: 'm/vol' }))
      ].join(' ');

      subjectNotes.textContent = summarizeExtras(subjectMetrics) || '—';
      referenceNotes.textContent = summarizeExtras(referenceMetrics) || '—';

      tableBody.innerHTML = tableRows
        .map(row => {
          const color = row.color || 'var(--muted)';
          return `<tr>
            <td style="padding:6px 4px">${row.label}</td>
            <td style="padding:6px 4px;text-align:right">${row.subjectText}</td>
            <td style="padding:6px 4px;text-align:right">${row.referenceText}</td>
            <td style="padding:6px 4px;text-align:right;color:${color}">${row.deltaText}</td>
          </tr>`;
        })
        .join('');

      if (dailyMovers) {
        if (tableRows.length) {
          const moverKeys = ['totalHours', 'routeHours', 'officeHours'];
          const moverLabels = {
            totalHours: 'Total',
            routeHours: 'Route',
            officeHours: 'Office'
          };
          dailyMovers.innerHTML = moverKeys
            .map(key => {
              const row = tableRows.find(r => r.key === key);
              const text = row ? row.deltaText : '—';
              const color = row ? (row.color || 'var(--muted)') : 'var(--muted)';
              return `<span class="pill" style="border-color:var(--border);color:${color}"><small>${moverLabels[key]}</small> <b>${text}</b></span>`;
            })
            .join(' ');
          dailyMovers.style.display = 'flex';
        } else {
          dailyMovers.style.display = 'none';
          dailyMovers.innerHTML = '';
        }
      }

      const candidateHighlights = highlights.length
        ? highlights
        : tableRows.map(row => ({ label: row.label, deltaText: row.deltaText, color: row.color || 'var(--muted)' }));

      highlightsRow.innerHTML = candidateHighlights
        .slice(0, 3)
        .map(h => `<span class="pill" style="border-color:var(--border);color:${h.color || 'var(--muted)'}"><small>${h.label}</small> <b>${h.deltaText}</b></span>`)
        .join(' ') || '<span class="pill"><small>Δ</small> <b style="color:var(--muted)">Similar</b></span>';

      reasoningEl.textContent = reasoning || '';

      localStorage.setItem(DAY_COMPARE_STORE.subject, subjectIso());
      localStorage.setItem(DAY_COMPARE_STORE.mode, mode);
      if (mode === 'manual' && manualSelect.value) {
        localStorage.setItem(DAY_COMPARE_STORE.manual, manualSelect.value);
      }
    }

    subjectSelect.addEventListener('change', () => {
      populateManualOptions();
      render();
    });

    referenceSelect.addEventListener('change', () => {
      if (manualPicker) manualPicker.style.display = referenceSelect.value === 'manual' ? 'block' : 'none';
      render();
    });

    manualSelect.addEventListener('change', render);

    if (toggleBtn) {
      const available = ['last', 'baseline', ...(worked.length > 1 ? ['manual'] : [])];
      toggleBtn.style.display = available.length > 1 ? '' : 'none';
      toggleBtn.onclick = () => {
        const current = referenceSelect.value;
        const idx = available.indexOf(current);
        const next = available[(idx + 1) % available.length];
        referenceSelect.value = next;
        referenceSelect.dispatchEvent(new Event('change'));
      };
    }

    render();
  }

  function buildVolumeLeaderboard(rows) {
    const flags = getFlags();
    const panel = document.getElementById('volumeLeaderboard');
    const body = document.getElementById('volumeLeaderboardBody');
    const note = document.getElementById('volumeLeaderboardNote');
    if (!panel || !body) return;
    if (!flags || !flags.mixViz) {
      panel.style.display = 'none';
      return;
    }

    const worked = filterRowsForView(rows || []).filter(r => r && r.status !== 'off' && ((+r.parcels || 0) + (+r.letters || 0) > 0));
    if (!worked.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:8px;color:var(--muted)">No worked days yet.</td></tr>';
      if (note) note.textContent = '—';
      return;
    }

    const weight = getCurrentLetterWeight();
    const volumes = worked.map(r => ({
      date: r.work_date,
      parcels: +r.parcels || 0,
      letters: +r.letters || 0,
      volume: combinedVolume(r.parcels, r.letters, weight)
    }));

    const asc = [...volumes].sort((a, b) => a.volume - b.volume);
    const percentileByDate = new Map();
    asc.forEach((item, idx) => {
      const pct = Math.round(((idx + 1) / asc.length) * 100);
      percentileByDate.set(item.date, pct);
    });

    const top = [...volumes].sort((a, b) => b.volume - a.volume).slice(0, Math.min(10, volumes.length));
    body.innerHTML = top.map(item => {
      const dt = DateTime.fromISO(item.date, { zone: ZONE });
      const pct = percentileByDate.get(item.date);
      const pctText = pct != null ? `${pct}%` : '—';
      return `<tr>
        <td>${dt.toFormat('ccc LLL dd')}</td>
        <td>${item.parcels}</td>
        <td>${item.letters}</td>
        <td>${item.volume.toFixed(1)}</td>
        <td>${pctText}</td>
      </tr>`;
    }).join('');

    if (note) note.textContent = `Combined volume = parcels + ${(weight || 0).toFixed(2)}×letters`;
  }

  return {
    buildDiagnostics,
    buildDayCompare,
    buildVolumeLeaderboard,
    triggerTagDismissForIso,
    fitVolumeTimeModel,
    getResidualModel,
    getLatestDiagnosticsContext: () => latestDiagnosticsContext,
    resetDiagnosticsCache: () => {
      residModelCache = null;
    },
    __test: __testApi
  };
}
