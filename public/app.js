(() => {
  // src/utils/date.js
  var { DateTime } = luxon;
  var ZONE = "America/Detroit";
  function todayStr() {
    return DateTime.now().setZone(ZONE).toISODate();
  }
  function todayIso() {
    return DateTime.now().setZone(ZONE).toISODate();
  }
  function hhmmNow() {
    const d = DateTime.now().setZone(ZONE);
    return `${String(d.hour).padStart(2, "0")}:${String(d.minute).padStart(2, "0")}`;
  }
  function dowIndex(dateStr) {
    return DateTime.fromFormat(dateStr, "yyyy-MM-dd", { zone: ZONE }).weekday % 7;
  }
  function startOfWeekMonday(dt) {
    const w = dt.weekday;
    const shift = (w + 6) % 7;
    return dt.startOf("day").minus({ days: shift });
  }
  function endOfWeekSunday(dt) {
    return startOfWeekMonday(dt).plus({ days: 6 }).endOf("day");
  }
  function dateInRangeISO(iso, fromIso, toIso) {
    try {
      if (!iso || !fromIso || !toIso) return false;
      const d = DateTime.fromISO(iso, { zone: ZONE }).startOf("day");
      const a = DateTime.fromISO(fromIso, { zone: ZONE }).startOf("day");
      const b = DateTime.fromISO(toIso, { zone: ZONE }).endOf("day");
      return d >= a && d <= b;
    } catch (_) {
      return false;
    }
  }
  function normalizeRanges(ranges) {
    try {
      const parse = (iso) => DateTime.fromISO(iso, { zone: ZONE }).startOf("day");
      const items = (ranges || []).map((r) => ({ from: r.from, to: r.to })).filter((r) => r.from && r.to).map((r) => ({ a: parse(r.from), b: DateTime.fromISO(r.to, { zone: ZONE }).endOf("day") })).sort((x, y) => x.a.toMillis() - y.a.toMillis());
      const merged = [];
      for (const it of items) {
        if (!merged.length) {
          merged.push({ ...it });
          continue;
        }
        const last = merged[merged.length - 1];
        if (it.a <= last.b.plus({ days: 0 })) {
          if (it.b > last.b) last.b = it.b;
        } else {
          merged.push({ ...it });
        }
      }
      return merged.map((x) => ({ from: x.a.toISODate(), to: x.b.toISODate() }));
    } catch (_) {
      return ranges || [];
    }
  }
  function diffHours(dateIso, t1, t2) {
    if (!t1 || !t2) return null;
    const a = DateTime.fromISO(`${dateIso}T${t1}`, { zone: ZONE });
    const b = DateTime.fromISO(`${dateIso}T${t2}`, { zone: ZONE });
    let h = (b.toMillis() - a.toMillis()) / 36e5;
    if (h < 0) h += 24;
    return Math.round(h * 100) / 100;
  }
  function moonPhaseEmoji(dateStr) {
    const d = DateTime.fromISO(dateStr, { zone: ZONE });
    const lp = 25514428e-1;
    const newMoon = DateTime.fromISO("2000-01-06T18:14:00Z").toSeconds();
    const phase = ((d.toSeconds() - newMoon) % lp + lp) % lp / lp;
    if (phase < 0.03 || phase > 0.97) return "\u{1F311}";
    if (phase < 0.25) return "\u{1F312}";
    if (phase < 0.27) return "\u{1F313}";
    if (phase < 0.48) return "\u{1F314}";
    if (phase < 0.52) return "\u{1F315}";
    if (phase < 0.75) return "\u{1F316}";
    if (phase < 0.77) return "\u{1F317}";
    return "\u{1F318}";
  }

  // src/utils/storage.js
  var FLAG_KEY = "routeStats.flags.v1";
  var EVAL_KEY = "routeStats.uspsEval.v1";
  var VACAY_KEY = "routeStats.vacation.v1";
  var BASELINE_KEY = "routeStats.baseline.v1";
  var MODEL_SCOPE_KEY = "routeStats.modelScope";
  var RESIDUAL_WEIGHT_PREF_KEY = "routeStats.residual.downweightHoliday";
  var RESIDUAL_DISMISS_KEY = "routeStats.diagnostics.dismissed";
  var OPENAI_KEY_STORAGE = "routeStats.ai.openaiKey";
  var AI_LAST_SUMMARY_KEY = "routeStats.ai.lastSummary";
  var AI_SUMMARY_COLLAPSED_KEY = "routeStats.ai.summaryCollapsed";
  var TOKEN_USAGE_STORAGE = "routeStats.ai.tokenUsage";
  var AI_BASE_PROMPT_KEY = "routeStats.ai.basePrompt";
  var DEFAULT_FLAGS = {
    weekdayTicks: true,
    progressivePills: false,
    monthlyGlance: true,
    holidayAdjustments: true,
    trendPills: false,
    sameRangeTotals: true,
    quickFilter: true,
    headlineDigest: false,
    smartSummary: true,
    mixViz: true,
    baselineCompare: true,
    collapsedUi: false,
    focusMode: false,
    quickEntry: false,
    uspsEval: true,
    dayCompare: true
  };
  var DEFAULT_EVAL = {
    routeId: "R1",
    evalCode: "44K",
    boxes: 670,
    stops: null,
    hoursPerDay: 9.4,
    officeHoursPerDay: 2,
    annualSalary: 68e3
  };
  var EMPTY_VACATION = { ranges: [] };
  function loadFlags() {
    try {
      return Object.assign({}, DEFAULT_FLAGS, JSON.parse(localStorage.getItem(FLAG_KEY) || "{}"));
    } catch (_) {
      return { ...DEFAULT_FLAGS };
    }
  }
  function saveFlags(flags) {
    localStorage.setItem(FLAG_KEY, JSON.stringify(flags));
  }
  function loadEval() {
    try {
      return Object.assign({}, DEFAULT_EVAL, JSON.parse(localStorage.getItem(EVAL_KEY) || "{}"));
    } catch (_) {
      return { ...DEFAULT_EVAL };
    }
  }
  function saveEval(cfg) {
    localStorage.setItem(EVAL_KEY, JSON.stringify(cfg || {}));
  }
  function loadVacation() {
    try {
      const v = JSON.parse(localStorage.getItem(VACAY_KEY) || "{}");
      const ranges = Array.isArray(v == null ? void 0 : v.ranges) ? v.ranges : [];
      return { ranges: ranges.filter((r) => (r == null ? void 0 : r.from) && (r == null ? void 0 : r.to)) };
    } catch (_) {
      return { ...EMPTY_VACATION };
    }
  }
  function saveVacation(cfg) {
    try {
      localStorage.setItem(VACAY_KEY, JSON.stringify({ ranges: cfg.ranges || [] }));
    } catch (_) {
    }
  }
  function ensureWeeklyBaselines(rows) {
    try {
      const now = DateTime.now().setZone(ZONE);
      const weekStartIso = startOfWeekMonday(now).toISODate();
      const savedRaw = localStorage.getItem(BASELINE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved && saved.weekStart === weekStartIso) return saved;
      }
      const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
      const endLast = endOfWeekSunday(now.minus({ weeks: 1 }));
      const startPrev = startOfWeekMonday(now.minus({ weeks: 2 }));
      const endPrev = endOfWeekSunday(now.minus({ weeks: 2 }));
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };
      const worked = (rows || []).filter((r) => (r == null ? void 0 : r.status) !== "off");
      const W1 = worked.filter((r) => inRange(r, startLast, endLast));
      const W2 = worked.filter((r) => inRange(r, startPrev, endPrev));
      const byW = (arr, fn) => {
        const out = Array.from({ length: 7 }, () => []);
        arr.forEach((r) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          const idx = (d.weekday + 6) % 7;
          out[idx].push(fn(r) || 0);
        });
        return out;
      };
      const pW1 = byW(W1, (r) => +r.parcels || 0);
      const pW2 = byW(W2, (r) => +r.parcels || 0);
      const lW1 = byW(W1, (r) => +r.letters || 0);
      const lW2 = byW(W2, (r) => +r.letters || 0);
      const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const parcels2 = Array.from({ length: 7 }, (_, i) => mean([...pW1[i] || [], ...pW2[i] || []]));
      const letters2 = Array.from({ length: 7 }, (_, i) => mean([...lW1[i] || [], ...lW2[i] || []]));
      const snap = { weekStart: weekStartIso, parcels: parcels2, letters: letters2 };
      localStorage.setItem(BASELINE_KEY, JSON.stringify(snap));
      return snap;
    } catch (_) {
      return null;
    }
  }
  function getWeeklyBaselines() {
    try {
      return JSON.parse(localStorage.getItem(BASELINE_KEY) || "null");
    } catch (_) {
      return null;
    }
  }
  function computeAnchorBaselines(rows, weeks = 8) {
    try {
      const now = DateTime.now().setZone(ZONE);
      const worked = (rows || []).filter((r) => (r == null ? void 0 : r.status) !== "off");
      const weeksArr = [];
      for (let w = 1; w <= weeks; w++) {
        const s = startOfWeekMonday(now.minus({ weeks: w }));
        const e = endOfWeekSunday(now.minus({ weeks: w }));
        weeksArr.push({ s, e });
      }
      const perW = (fn) => {
        const arrs = Array.from({ length: 7 }, () => []);
        for (const wk of weeksArr) {
          const set = worked.filter((r) => {
            const d = DateTime.fromISO(r.work_date, { zone: ZONE });
            return d >= wk.s && d <= wk.e;
          });
          const tmp = Array.from({ length: 7 }, () => 0);
          set.forEach((r) => {
            const d = DateTime.fromISO(r.work_date, { zone: ZONE });
            const idx = (d.weekday + 6) % 7;
            tmp[idx] += fn(r) || 0;
          });
          for (let i = 0; i < 7; i++) arrs[i].push(tmp[i]);
        }
        const med = arrs.map((a) => {
          const b = [...a].sort((x, y) => x - y);
          const n = b.length;
          if (!n) return null;
          const mid = Math.floor(n / 2);
          return n % 2 ? b[mid] : (b[mid - 1] + b[mid]) / 2;
        });
        return med;
      };
      return {
        parcels: perW((r) => +r.parcels || 0),
        letters: perW((r) => +r.letters || 0)
      };
    } catch (_) {
      return null;
    }
  }
  function getModelScope() {
    try {
      const v = localStorage.getItem(MODEL_SCOPE_KEY);
      return v === "all" || v === "rolling" ? v : "rolling";
    } catch (_) {
      return "rolling";
    }
  }
  function setModelScope(v) {
    try {
      localStorage.setItem(MODEL_SCOPE_KEY, v);
    } catch (_) {
    }
  }
  function loadDismissedResiduals(parseDismissReasonInput2) {
    try {
      const raw = localStorage.getItem(RESIDUAL_DISMISS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item) => {
        if (!item || typeof item !== "object") return null;
        const iso = item.iso || item.date || null;
        if (!iso) return null;
        let sourceTags = [];
        if (Array.isArray(item.tags)) {
          sourceTags = item.tags;
        } else if (item.reason) {
          if (typeof parseDismissReasonInput2 === "function") {
            const parsedReasonTags = parseDismissReasonInput2(item.reason) || [];
            if (parsedReasonTags.length) {
              sourceTags = parsedReasonTags.map((tag) => ({
                reason: tag.reason,
                minutes: tag.minutes,
                notedAt: item.notedAt
              }));
            } else {
              sourceTags = [{ reason: item.reason, minutes: item.minutes, notedAt: item.notedAt }];
            }
          } else {
            sourceTags = [{ reason: item.reason, minutes: item.minutes, notedAt: item.notedAt }];
          }
        }
        const tags = sourceTags.map((tag) => {
          if (!tag) return null;
          const reason = String(tag.reason || "").trim();
          if (!reason) return null;
          const minutes = tag.minutes != null && tag.minutes !== "" ? Number(tag.minutes) : null;
          const notedAt = tag.notedAt || item.notedAt || (/* @__PURE__ */ new Date()).toISOString();
          return { reason, minutes: Number.isFinite(minutes) ? minutes : null, notedAt };
        }).filter(Boolean);
        return tags.length ? { iso, tags } : null;
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }
  function saveDismissedResiduals(list) {
    try {
      localStorage.setItem(RESIDUAL_DISMISS_KEY, JSON.stringify(list || []));
    } catch (_) {
    }
  }
  function getOpenAiKey() {
    try {
      const val = localStorage.getItem(OPENAI_KEY_STORAGE);
      if (!val) return null;
      const trimmed = val.trim();
      return trimmed ? trimmed : null;
    } catch (_) {
      return null;
    }
  }
  function setOpenAiKey(val) {
    try {
      if (val && val.trim()) localStorage.setItem(OPENAI_KEY_STORAGE, val.trim());
      else localStorage.removeItem(OPENAI_KEY_STORAGE);
    } catch (_) {
    }
  }
  function getAiBasePrompt(defaultPrompt) {
    try {
      const val = localStorage.getItem(AI_BASE_PROMPT_KEY);
      if (!val) return defaultPrompt;
      const trimmed = val.trim();
      return trimmed ? trimmed : defaultPrompt;
    } catch (_) {
      return defaultPrompt;
    }
  }
  function setAiBasePrompt(val) {
    try {
      if (val && val.trim()) localStorage.setItem(AI_BASE_PROMPT_KEY, val.trim());
      else localStorage.removeItem(AI_BASE_PROMPT_KEY);
    } catch (_) {
    }
  }
  function loadTokenUsage() {
    try {
      const raw = localStorage.getItem(TOKEN_USAGE_STORAGE);
      const now = DateTime.now().setZone(ZONE);
      const today = now.toISODate();
      const weekStart = startOfWeekMonday(now).toISODate();
      const monthKey = now.toFormat("yyyy-MM");
      if (!raw) return { today: 0, week: 0, month: 0, monthlyLimit: null, todayDate: today, weekStart, monthKey };
      const parsed = JSON.parse(raw) || {};
      const usage = {
        today: Number(parsed.today) || 0,
        week: Number(parsed.week) || 0,
        month: Number(parsed.month) || 0,
        monthlyLimit: parsed.monthlyLimit !== void 0 && parsed.monthlyLimit !== null ? Number(parsed.monthlyLimit) : null,
        todayDate: parsed.todayDate || today,
        weekStart: parsed.weekStart || weekStart,
        monthKey: parsed.monthKey || monthKey
      };
      if (usage.todayDate !== today) {
        usage.today = 0;
        usage.todayDate = today;
      }
      if (usage.weekStart !== weekStart) {
        usage.week = 0;
        usage.weekStart = weekStart;
      }
      if (usage.monthKey !== monthKey) {
        usage.month = 0;
        usage.monthKey = monthKey;
      }
      return usage;
    } catch (_) {
      const now = DateTime.now().setZone(ZONE);
      return {
        today: 0,
        week: 0,
        month: 0,
        monthlyLimit: null,
        todayDate: now.toISODate(),
        weekStart: startOfWeekMonday(now).toISODate(),
        monthKey: now.toFormat("yyyy-MM")
      };
    }
  }
  function saveTokenUsage(obj) {
    try {
      localStorage.setItem(TOKEN_USAGE_STORAGE, JSON.stringify(obj || {}));
    } catch (_) {
    }
  }

  // src/services/supabaseClient.js
  var SUPABASE_URL = "https://ouwkdtiixkaydrtfdhnh.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91d2tkdGlpeGtheWRydGZkaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMDc0NDksImV4cCI6MjA3MDU4MzQ0OX0.KI-dYG5_A8jvPEHSog3wlnLbIGYIHQR_4ztXHL2SzIg";
  function createSupabaseClient() {
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true } });
  }
  async function handleAuthCallback(sb2) {
    try {
      const url = new URL(window.location.href);
      const hasHashToken = url.hash.includes("access_token=") || url.hash.includes("refresh_token=");
      const code = url.searchParams.get("code");
      let out = null;
      if (hasHashToken) {
        const { data, error } = await sb2.auth.exchangeCodeForSession(url.hash);
        if (error) throw error;
        out = data;
      } else if (code) {
        const { data, error } = await sb2.auth.exchangeCodeForSession(code);
        if (error) throw error;
        out = data;
      } else {
        const { data, error } = await sb2.auth.getSession();
        if (error) console.warn("[Auth] getSession warning:", error.message);
        out = data;
      }
      if (hasHashToken || code) {
        window.history.replaceState({}, document.title, url.origin + url.pathname);
      }
      console.log("[Auth] session ready", (out == null ? void 0 : out.session) ? "(signed in)" : "(no session)");
      return (out == null ? void 0 : out.session) || null;
    } catch (err) {
      console.warn("Auth callback error \u2013", err);
      return null;
    }
  }

  // src/features/diagnostics.js
  function createDiagnostics({
    getFlags,
    filterRowsForView: filterRowsForView2,
    rowsForModelScope: rowsForModelScope2,
    getResidualWeighting: getResidualWeighting2,
    setHolidayDownweightEnabled: setHolidayDownweightEnabled2,
    isHolidayDownweightEnabled: isHolidayDownweightEnabled2,
    loadDismissedResiduals: loadDismissedResiduals2,
    saveDismissedResiduals: saveDismissedResiduals2,
    parseDismissReasonInput: parseDismissReasonInput2,
    rebuildAll: rebuildAll2,
    updateAiSummaryAvailability: updateAiSummaryAvailability2,
    inferBoxholderLabel: inferBoxholderLabel2,
    hasTag: hasTag2,
    summarizeHolidayCatchups: summarizeHolidayCatchups2,
    getCurrentLetterWeight,
    setCurrentLetterWeight,
    combinedVolume: combinedVolume2,
    routeAdjustedMinutes: routeAdjustedMinutes2,
    colorForDelta: colorForDelta2
  }) {
    if (typeof getFlags !== "function") throw new Error("createDiagnostics: getFlags is required");
    if (typeof filterRowsForView2 !== "function") throw new Error("createDiagnostics: filterRowsForView is required");
    if (typeof rowsForModelScope2 !== "function") throw new Error("createDiagnostics: rowsForModelScope is required");
    if (typeof getResidualWeighting2 !== "function") throw new Error("createDiagnostics: getResidualWeighting is required");
    if (typeof loadDismissedResiduals2 !== "function") throw new Error("createDiagnostics: loadDismissedResiduals is required");
    if (typeof saveDismissedResiduals2 !== "function") throw new Error("createDiagnostics: saveDismissedResiduals is required");
    if (typeof parseDismissReasonInput2 !== "function") throw new Error("createDiagnostics: parseDismissReasonInput is required");
    if (typeof rebuildAll2 !== "function") throw new Error("createDiagnostics: rebuildAll is required");
    if (typeof inferBoxholderLabel2 !== "function") throw new Error("createDiagnostics: inferBoxholderLabel is required");
    if (typeof hasTag2 !== "function") throw new Error("createDiagnostics: hasTag is required");
    if (typeof summarizeHolidayCatchups2 !== "function") throw new Error("createDiagnostics: summarizeHolidayCatchups is required");
    if (typeof getCurrentLetterWeight !== "function") throw new Error("createDiagnostics: getCurrentLetterWeight is required");
    if (typeof setCurrentLetterWeight !== "function") throw new Error("createDiagnostics: setCurrentLetterWeight is required");
    if (typeof combinedVolume2 !== "function") throw new Error("createDiagnostics: combinedVolume is required");
    if (typeof routeAdjustedMinutes2 !== "function") throw new Error("createDiagnostics: routeAdjustedMinutes is required");
    if (typeof colorForDelta2 !== "function") throw new Error("createDiagnostics: colorForDelta is required");
    let residModelCache = null;
    let latestDiagnosticsContext = null;
    const __testApi = {};
    const DAY_COMPARE_STORE = {
      subject: "routeStats.dayCompare.subject",
      mode: "routeStats.dayCompare.mode",
      manual: "routeStats.dayCompare.manual"
    };
    function escapeHtml(str = "") {
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function minutesDelta(actualMinutes, expectedMinutes) {
      if (actualMinutes == null || expectedMinutes == null) return 0;
      return actualMinutes - expectedMinutes;
    }
    function formatMinutesDelta(deltaMinutes, zScore) {
      const isZeroish = Math.abs(deltaMinutes) < 0.5;
      let cls = "delta zero";
      let text = "0";
      if (!isZeroish) {
        const sign = deltaMinutes > 0 ? "+" : "\u2212";
        cls = `delta ${deltaMinutes > 0 ? "pos" : "neg"}`;
        text = `${sign}${Math.round(Math.abs(deltaMinutes))}m`;
      }
      if (typeof zScore === "number" && Math.abs(zScore) >= 1.5) {
        cls += " outlier";
      }
      return `<span class="${cls}">${text}</span>`;
    }
    function buildDismissedMap(list) {
      const map = /* @__PURE__ */ new Map();
      (list || []).forEach((item) => {
        if (item && item.iso) map.set(item.iso, item);
      });
      return map;
    }
    function collectWorkedDays(rows, limit = 365) {
      const all = filterRowsForView2(rows || []).filter((r) => r && r.status !== "off" && r.work_date);
      const sorted = [...all].sort((a, b) => a.work_date < b.work_date ? 1 : -1);
      return limit && sorted.length > limit ? sorted.slice(0, limit) : sorted;
    }
    function buildDayCompareContext(rows, limit = 365) {
      const worked = collectWorkedDays(rows, limit);
      const byDate = /* @__PURE__ */ new Map();
      worked.forEach((r) => byDate.set(r.work_date, r));
      return { worked, byDate };
    }
    function getSubjectMetrics(context, iso) {
      if (!context) return null;
      const row = iso && context.byDate.get(iso) || context.worked[0];
      return row ? dayMetricsFromRow(row, { source: "subject", label: row.work_date }) : null;
    }
    function getLastSameWeekdayMetrics(context, iso) {
      if (!context || !iso) return null;
      const targetDow = dowIndex(iso);
      for (const row of context.worked) {
        if (row.work_date === iso) continue;
        if (row.work_date < iso && dowIndex(row.work_date) === targetDow) {
          const label = `Last ${WEEKDAY_NAMES[targetDow]} (${row.work_date})`;
          return dayMetricsFromRow(row, { source: "lastSameWeekday", label });
        }
      }
      return null;
    }
    function getWeekdayBaselineMetrics(context, iso) {
      if (!context || !iso) return null;
      const targetDow = dowIndex(iso);
      const candidates = context.worked.filter((r) => r.work_date !== iso && dowIndex(r.work_date) === targetDow);
      if (!candidates.length) return null;
      const label = `Typical ${WEEKDAY_NAMES[targetDow]}`;
      return aggregateDayMetrics(candidates, { source: "weekdayAverage", type: "average", dow: targetDow, label });
    }
    function getCustomReferenceMetrics(context, iso) {
      if (!context || !iso) return null;
      const row = context.byDate.get(iso);
      return row ? dayMetricsFromRow(row, { source: "manualReference", label: row.work_date }) : null;
    }
    function dayMetricsFromRow(row, meta) {
      var _a5, _b, _c;
      if (!row) return null;
      const parcels2 = +row.parcels || 0;
      const letters2 = +row.letters || 0;
      const volume = combinedVolume2(parcels2, letters2);
      const routeHours = normalizeHours((_a5 = row.route_minutes) != null ? _a5 : row.routeMinutes);
      const officeHours = normalizeHours((_b = row.office_minutes) != null ? _b : row.officeMinutes);
      const storedHours = Number((_c = row.hours) != null ? _c : row.totalHours);
      const totalHours = Number.isFinite(storedHours) ? storedHours : routeHours + officeHours;
      const miles2 = Number(row.miles) || 0;
      const efficiencyMinutes = volume > 0 ? routeHours * 60 / volume : null;
      return {
        ...meta,
        workDate: row.work_date,
        totalHours,
        routeHours,
        officeHours,
        parcels: parcels2,
        letters: letters2,
        volume,
        miles: miles2,
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
        var _a5, _b, _c;
        const routeHours = normalizeHours((_a5 = row.route_minutes) != null ? _a5 : row.routeMinutes);
        const officeHours = normalizeHours((_b = row.office_minutes) != null ? _b : row.officeMinutes);
        const storedHours = Number((_c = row.hours) != null ? _c : row.totalHours);
        acc.totalHours += Number.isFinite(storedHours) ? storedHours : routeHours + officeHours;
        acc.routeHours += routeHours;
        acc.officeHours += officeHours;
        acc.parcels += +row.parcels || 0;
        acc.letters += +row.letters || 0;
        acc.miles += +row.miles || 0;
        return acc;
      }, { totalHours: 0, routeHours: 0, officeHours: 0, parcels: 0, letters: 0, miles: 0 });
      const volume = combinedVolume2(totals.parcels, totals.letters) / valid.length;
      const efficiencyMinutes = volume > 0 ? totals.routeHours * 60 / valid.length / volume : null;
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
      var _a5, _b, _c, _d, _e;
      if (!subject || !reference) return { rows: [], highlights: [], reasoning: "" };
      const metricDefs = [
        { key: "totalHours", label: "Total hours", decimals: 2, suffix: "h" },
        { key: "routeHours", label: "Route hours", decimals: 2, suffix: "h" },
        { key: "officeHours", label: "Office hours", decimals: 2, suffix: "h" },
        { key: "parcels", label: "Parcels", decimals: 0 },
        { key: "letters", label: "Letters", decimals: 0 },
        { key: "volume", label: "Volume (parcels + w\xD7letters)", decimals: 2 },
        { key: "miles", label: "Miles", decimals: 1, suffix: "mi" },
        { key: "efficiencyMinutes", label: "Route minutes per volume", decimals: 1, suffix: "m/vol", invert: true }
      ];
      const rowsOut = [];
      const highlights = [];
      for (const def of metricDefs) {
        const subjVal = subject[def.key];
        const refVal = reference[def.key];
        const delta = subjVal != null && refVal != null ? subjVal - refVal : null;
        const pct = refVal != null && refVal !== 0 && delta != null ? delta / refVal * 100 : null;
        const colorDelta = def.invert && pct != null ? -pct : pct;
        const displayDelta = delta == null ? "\u2014" : formatNumber(delta, { decimals: (_a5 = def.decimals) != null ? _a5 : 2, suffix: def.suffix || "" });
        const pctTxt = pct == null || !Number.isFinite(pct) ? "" : ` (${pct >= 0 ? "+" : ""}${Math.round(pct)}%)`;
        const deltaText = delta == null ? "\u2014" : `${displayDelta}${pctTxt}`;
        const subjectText = formatNumber(subjVal, { decimals: (_b = def.decimals) != null ? _b : 2, suffix: def.suffix || "" });
        const referenceText = formatNumber(refVal, { decimals: (_c = def.decimals) != null ? _c : 2, suffix: def.suffix || "" });
        const color = colorForDelta2(colorDelta != null ? colorDelta : 0).fg;
        rowsOut.push({
          key: def.key,
          label: def.label,
          subjectText,
          referenceText,
          deltaText,
          color,
          delta,
          pct,
          score: Math.abs((_d = pct != null ? pct : delta) != null ? _d : 0)
        });
        if (delta != null) {
          highlights.push({ key: def.key, label: def.label, deltaText, color, score: Math.abs((_e = pct != null ? pct : delta) != null ? _e : 0) });
        }
      }
      highlights.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
      const reasoningBits = [];
      if (subject.reason) reasoningBits.push(`Subject reason: ${subject.reason}`);
      if (reference.reason) reasoningBits.push(`Reference reason: ${reference.reason}`);
      const reasoning = reasoningBits.join(" \xB7 ");
      return { rows: rowsOut, highlights, reasoning };
    }
    __testApi.deltaDetails = computeDeltaDetails;
    function inferWeather(row) {
      const raw = String(row.weather_json || "");
      const parts = raw.split("\xB7").map((s) => s.trim()).filter(Boolean);
      return parts.filter((p) => !/^Reason:/i.test(p)).join(" \xB7 ");
    }
    function inferReason(row) {
      const raw = String(row.weather_json || "");
      const match = raw.match(/Reason:\s*([^·]+)/i);
      return match ? match[1].trim() : null;
    }
    const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    function summarizeEntry(row, model, stats, dismissedMap) {
      const iso = row.work_date;
      const dt = DateTime.fromISO(iso, { zone: ZONE }).toFormat("ccc LLL dd");
      const actualMinutes = routeAdjustedMinutes2(row);
      const expectedMinutes = model ? model.a + model.bp * (+row.parcels || 0) + model.bl * (+row.letters || 0) : null;
      const deltaMinutes = minutesDelta(actualMinutes, expectedMinutes);
      const zScore = stats.std > 0 ? (deltaMinutes - stats.mean) / stats.std : null;
      const deltaHtml = formatMinutesDelta(deltaMinutes, zScore);
      const parcels2 = +row.parcels || 0;
      const letters2 = +row.letters || 0;
      const boxholders2 = escapeHtml(inferBoxholderLabel2(row));
      const weatherRaw = String(row.weather_json || "");
      const weatherPieces = weatherRaw.split("\xB7").map((s) => s.trim()).filter(Boolean);
      const weatherDisplayParts = weatherPieces.filter((p) => !/^Reason:/i.test(p) && !/^SecondTrip:/i.test(p) && !/^Box:/i.test(p) && !/^Break:/i.test(p)).map((p) => p.replace(/partly\s+cloudy/i, "PC"));
      const weatherSnippet = weatherRaw.replace(/Reason:\s*[^·]+/ig, "").trim();
      const weatherShort = weatherDisplayParts.length ? weatherDisplayParts.slice(0, 2).join(" \xB7 ") : "\u2014";
      const weather2 = escapeHtml(weatherShort);
      const badges = [];
      if (hasTag2(row, "holiday_catchup")) {
        const ctx = row._holidayCatchup || {};
        const formatRatio = (ratio) => ratio != null && isFinite(ratio) ? `${ratio.toFixed(2)}\xD7` : "\u2014";
        const fmt = (val, decimals) => val != null && isFinite(val) ? Number(val).toFixed(decimals) : "\u2014";
        const tipParts = [];
        if (ctx.prevHoliday) tipParts.push(`Holiday on ${ctx.prevHoliday}`);
        if (ctx.baselineParcels != null) tipParts.push(`Parcels ${fmt(ctx.parcels, 0)} vs avg ${fmt(ctx.baselineParcels, 1)} (${formatRatio(ctx.ratioParcels)})`);
        if (ctx.baselineRouteMinutes != null) tipParts.push(`Route ${fmt((ctx.routeMinutes || 0) / 60, 2)}h vs avg ${fmt((ctx.baselineRouteMinutes || 0) / 60, 2)}h (${formatRatio(ctx.ratioRoute)})`);
        const badgeTitle = escapeHtml(tipParts.join(" \u2022 ") || "Follows holiday off-day with higher-than-baseline load");
        badges.push(`<span class="pill badge-holiday" title="${badgeTitle}">Holiday catch-up</span>`);
      }
      const weatherCell = badges.length ? `${weather2} ${badges.join(" ")}` : weather2;
      const rawNotes = (row.notes || "").trim();
      const notePlainFull = rawNotes.replace(/\s+/g, " ").trim();
      const noteFullEncoded = encodeURIComponent(notePlainFull);
      const notesHtml = notePlainFull ? `<button class="ghost diag-note" data-note-full="${noteFullEncoded}">Read full</button>` : "\u2014";
      return {
        iso,
        dt,
        parcels: parcels2,
        letters: letters2,
        expectedMinutes,
        actualMinutes,
        deltaHtml,
        boxholders: boxholders2,
        weatherCell,
        notesHtml,
        weatherSnippet,
        notesPlain: notePlainFull
      };
    }
    function fitVolumeTimeModel2(rows, opts) {
      const weightFn = typeof (opts == null ? void 0 : opts.weightFn) === "function" ? opts.weightFn : null;
      const prepared = (rows || []).filter((r) => r && r.status !== "off").map((row) => {
        const parcels2 = +row.parcels || 0;
        const letters2 = +row.letters || 0;
        const minutes = routeAdjustedMinutes2(row);
        const rawWeight = weightFn ? Number(weightFn(row)) : 1;
        const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 0;
        return { row, parcels: parcels2, letters: letters2, minutes, weight };
      }).filter((entry) => entry.weight > 0);
      if (!prepared.length) return null;
      const sumW = prepared.reduce((t, e) => t + e.weight, 0);
      if (!(sumW > 0)) return null;
      const mp = prepared.reduce((t, e) => t + e.weight * e.parcels, 0) / sumW;
      const ml = prepared.reduce((t, e) => t + e.weight * e.letters, 0) / sumW;
      const my = prepared.reduce((t, e) => t + e.weight * e.minutes, 0) / sumW;
      let Cpp = 0;
      let Cll = 0;
      let Cpl = 0;
      let Cpy = 0;
      let Cly = 0;
      let SST = 0;
      let SSR = 0;
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
      const det = Cpp * Cll - Cpl * Cpl;
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
      const r2 = SST > 0 ? 1 - SSR / SST : 0;
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
    function learnedLetterWeight(model) {
      if (!model || !isFinite(model.bp) || Math.abs(model.bp) < 1e-6) return null;
      const w = model.bl / model.bp;
      return isFinite(w) && w >= 0 && w <= 1.5 ? w : null;
    }
    function computeResidualForRow(row, model) {
      if (!model) return null;
      const y = routeAdjustedMinutes2(row);
      const p = +row.parcels || 0;
      const l = +row.letters || 0;
      const yhat = model.a + model.bp * p + model.bl * l;
      return y - yhat;
    }
    function getResidualModel2(rows) {
      if (residModelCache) return residModelCache;
      const worked = (rows || []).filter((r) => r && r.status !== "off" && (+r.parcels || 0) + (+r.letters || 0) > 0).sort((a, b) => a.work_date < b.work_date ? -1 : 1);
      const scoped = rowsForModelScope2(worked);
      const weightCfg = getResidualWeighting2();
      residModelCache = fitVolumeTimeModel2(scoped, weightCfg.fn ? { weightFn: weightCfg.fn } : void 0);
      return residModelCache;
    }
    function renderModelStrip(model) {
      const el = document.getElementById("liveModelStrip");
      if (!el) return;
      if (!model) {
        el.style.display = "none";
        return;
      }
      const bp = document.getElementById("lm-bp");
      const bl = document.getElementById("lm-bl");
      const wv = document.getElementById("lm-w");
      const r2 = document.getElementById("lm-r2");
      const weight = model.bp && isFinite(model.bp) ? model.bl / model.bp : NaN;
      if (bp) bp.textContent = model.bp.toFixed(2);
      if (bl) bl.textContent = model.bl.toFixed(3);
      if (wv) wv.textContent = isFinite(weight) ? weight.toFixed(2) : "\u2014";
      if (r2) r2.textContent = `${(Math.max(0, Math.min(1, model.r2)) * 100).toFixed(0)}%`;
      el.style.display = "flex";
    }
    function buildDiagnostics2(rows) {
      var _a5, _b, _c, _d, _e;
      const filteredRows = filterRowsForView2(rows || []);
      const card = document.getElementById("diagnosticsCard");
      if (!card) return;
      card.style.display = "block";
      residModelCache = null;
      const worked = filteredRows.filter((r) => r && r.status !== "off" && (+r.parcels || 0) + (+r.letters || 0) > 0).sort((a, b) => a.work_date < b.work_date ? -1 : 1);
      const scoped = rowsForModelScope2(worked);
      const weightCfg = getResidualWeighting2();
      const model = fitVolumeTimeModel2(scoped, weightCfg.fn ? { weightFn: weightCfg.fn } : void 0);
      renderModelStrip(model);
      const badge = document.getElementById("diagModelBadge");
      const summaryEl = document.getElementById("diagSummary");
      const weightBtn = document.getElementById("diagHolidayWeightBtn");
      const weightNote = document.getElementById("diagWeightNote");
      const manageDismissBtn = document.getElementById("diagManageDismissed");
      const tbody = document.getElementById("diagTableBody");
      const toggleBtn = document.getElementById("toggleDiagDetails");
      const details = document.getElementById("diagDetails");
      if (weightBtn) {
        if (!weightBtn.dataset.bound) {
          weightBtn.addEventListener("click", () => {
            const next = !(isHolidayDownweightEnabled2 == null ? void 0 : isHolidayDownweightEnabled2());
            setHolidayDownweightEnabled2 == null ? void 0 : setHolidayDownweightEnabled2(next);
            residModelCache = null;
            rebuildAll2();
          });
          weightBtn.dataset.bound = "1";
        }
        const enabled = !!weightCfg.enabled;
        weightBtn.classList.toggle("active", enabled);
        weightBtn.textContent = enabled ? "Downweight holiday catch-up \xB7 ON" : "Downweight holiday catch-up \xB7 OFF";
      }
      if (manageDismissBtn && !manageDismissBtn.dataset.bound) {
        manageDismissBtn.addEventListener("click", () => {
          const list = loadDismissedResiduals2();
          if (!list.length) {
            window.alert("No dismissed residuals yet.");
            return;
          }
          const lines = list.map((item) => {
            const tagSummary = (item.tags || []).map((tag) => tag.minutes != null ? `${tag.reason} ${tag.minutes}m` : tag.reason).join(", ");
            return `${item.iso}${tagSummary ? ` \xB7 ${tagSummary}` : ""}`;
          }).join("\n");
          const input = window.prompt(`Dismissed residuals:
${lines}

Enter a date (yyyy-mm-dd) to reinstate, or leave blank to keep all:`, "");
          if (!input) return;
          const trimmed = input.trim();
          if (!trimmed) return;
          const updated = list.filter((item) => item.iso !== trimmed);
          if (updated.length === list.length) {
            window.alert(`No dismissed entry found for ${trimmed}.`);
            return;
          }
          saveDismissedResiduals2(updated);
          buildDiagnostics2(rows);
        });
        manageDismissBtn.dataset.bound = "1";
      }
      if (!model) {
        renderModelStrip(null);
        if (badge) badge.textContent = "Insufficient data";
        if (summaryEl) summaryEl.textContent = "Need more worked days with parcels/letters to estimate impact.";
        if (tbody) tbody.innerHTML = "";
        return;
      }
      const dismissedList = loadDismissedResiduals2();
      const dismissedMap = buildDismissedMap(dismissedList);
      const weight = learnedLetterWeight(model);
      if (weight != null) {
        const current = getCurrentLetterWeight();
        const smoothed = +(0.7 * current + 0.3 * weight).toFixed(4);
        setCurrentLetterWeight(smoothed);
      }
      if (badge) {
        const wTxt = weight != null ? weight.toFixed(2) : "\u2014";
        badge.innerHTML = `<small class="modelMetric">bp</small> <span>${model.bp.toFixed(2)}</span> \xB7 <small class="modelMetric">bl</small> <span>${model.bl.toFixed(3)}</span> \xB7 <small class="modelMetric">w</small> <span>${wTxt}</span>`;
      }
      const catchupSummary = summarizeHolidayCatchups2(filteredRows);
      let summaryTextForContext = "";
      if (summaryEl) {
        const pct = Math.round(Math.max(0, Math.min(1, model.r2)) * 100);
        let summaryText = `Fit on ${model.n} days \xB7 R\xB2 ${pct}% \xB7 Predicts route minutes from parcels & letters.`;
        if (catchupSummary.count) {
          const extraHours = catchupSummary.addedMinutes ? (catchupSummary.addedMinutes / 60).toFixed(1) : null;
          const ratioTxt = catchupSummary.avgRouteRatio ? `${catchupSummary.avgRouteRatio.toFixed(2)}\xD7 route` : null;
          const parts = [`${catchupSummary.count} holiday catch-up day${catchupSummary.count === 1 ? "" : "s"}`];
          if (extraHours && extraHours !== "0.0") parts.push(`${extraHours}h extra`);
          if (ratioTxt) parts.push(ratioTxt);
          summaryText += ` \xB7 ${parts.join(" \u2022 ")}`;
        }
        if (weightCfg.enabled) {
          const avgW = (_a5 = model.weighting) == null ? void 0 : _a5.averageWeight;
          const avgTxt = avgW ? ` (~${avgW.toFixed(2)}\xD7 weight)` : "";
          summaryText += ` \xB7 Holiday downweight ON${avgTxt}`;
        }
        if (dismissedList.length) {
          summaryText += ` \xB7 ${dismissedList.length} dismissed`;
        }
        summaryEl.textContent = summaryText;
        summaryTextForContext = summaryText;
      }
      if (weightNote) {
        if (!model) {
          weightNote.textContent = weightCfg.enabled ? "Need more data to apply weights." : "Weights off (full impact).";
        } else if (!weightCfg.enabled) {
          weightNote.textContent = "Weights off (full impact).";
        } else if (model.weighting) {
          const dw = model.weighting.downweighted || 0;
          const avg = model.weighting.averageWeight || 1;
          weightNote.textContent = dw ? `${dw} day${dw === 1 ? "" : "s"} at ~${avg.toFixed(2)}\xD7 weight` : "No holiday catch-up days in range.";
        } else {
          weightNote.textContent = "Weights off (full impact).";
        }
      }
      if (toggleBtn && details && !toggleBtn.dataset.bound) {
        const labelPill = toggleBtn.querySelector(".pill[aria-hidden]");
        const setLabel = () => {
          if (!labelPill) return;
          const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
          labelPill.textContent = expanded ? "Hide" : "Details";
        };
        toggleBtn.dataset.bound = "1";
        toggleBtn.addEventListener("click", () => {
          const show = details.style.display === "none" || !details.style.display;
          details.style.display = show ? "block" : "none";
          toggleBtn.setAttribute("aria-expanded", show ? "true" : "false");
          setLabel();
        });
        toggleBtn.setAttribute("aria-expanded", "false");
        setLabel();
      }
      if (tbody) {
        const residuals = model.residuals || [];
        const stats = (() => {
          const pool = residuals.filter((r) => !dismissedMap.has(r.iso));
          if (!pool.length) return { mean: 0, std: 0 };
          const mean = pool.reduce((acc, r) => acc + r.residMin, 0) / pool.length;
          if (pool.length < 2) return { mean, std: 0 };
          const variance = pool.reduce((acc, r) => {
            const diff = r.residMin - mean;
            return acc + diff * diff;
          }, 0) / (pool.length - 1);
          return { mean, std: Math.sqrt(Math.max(variance, 0)) };
        })();
        const visibleResiduals = residuals.filter((r) => !dismissedMap.has(r.iso));
        const top = [...visibleResiduals].sort((a, b) => Math.abs(b.residMin) - Math.abs(a.residMin)).slice(0, 10);
        const topContext = [];
        tbody.innerHTML = top.map((d) => {
          var _a6;
          const rowSummary = summarizeEntry(d.row, model, stats, dismissedMap);
          topContext.push({
            iso: d.iso,
            deltaMinutes: Math.round(d.residMin),
            parcels: Math.round(d.parcels || 0),
            letters: Math.round(d.letters || 0),
            expectedMinutes: d.predMin,
            actualMinutes: d.routeMin,
            boxholders: inferBoxholderLabel2(d.row),
            weather: rowSummary.weatherSnippet,
            notes: rowSummary.notesPlain,
            tags: Array.isArray((_a6 = d.row) == null ? void 0 : _a6._tags) ? d.row._tags : []
          });
          return `<tr>
          <td class="text-left">${rowSummary.dt}</td>
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
        }).join("");
        latestDiagnosticsContext = {
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          residuals: topContext,
          dismissed: dismissedList,
          summaryText: summaryTextForContext,
          stats: { mean: stats.mean, std: stats.std },
          catchupSummary,
          weight: {
            enabled: weightCfg.enabled,
            averageWeight: (_c = (_b = model.weighting) == null ? void 0 : _b.averageWeight) != null ? _c : null,
            downweighted: (_e = (_d = model.weighting) == null ? void 0 : _d.downweighted) != null ? _e : 0
          }
        };
        updateAiSummaryAvailability2 == null ? void 0 : updateAiSummaryAvailability2();
        const dismissBtns = tbody.querySelectorAll(".diag-dismiss");
        dismissBtns.forEach((btn) => {
          btn.addEventListener("click", () => {
            const iso = btn.dataset.dismissIso;
            if (!iso) return;
            const residual = residuals.find((r) => r.iso === iso);
            const deltaMinutes = residual ? Math.round(residual.residMin) : null;
            const parcels2 = residual ? Math.round(residual.parcels) : null;
            const letters2 = residual ? Math.round(residual.letters) : null;
            const defaultReason = (() => {
              if (!residual) return "";
              if (parcels2 != null && parcels2 > 0 && letters2 != null && letters2 === 0) return "parcels";
              if (letters2 != null && letters2 > parcels2) return "letters";
              return "";
            })();
            const hintParts = [];
            if (deltaMinutes != null) hintParts.push(`Residual: ${deltaMinutes}m`);
            if (parcels2 != null) hintParts.push(`Parcels: ${parcels2}`);
            if (letters2 != null) hintParts.push(`Letters: ${letters2}`);
            const basePrompt = hintParts.length ? `${hintParts.join(" \xB7 ")}
Reason (e.g., Road closure, Weather, Extra parcels):` : "Reason (e.g., Road closure, Weather, Extra parcels):";
            const reasonPrompt = window.prompt(`${basePrompt}
You can append minutes like "+15" (e.g., "parcels+15") and separate multiple reasons with commas (e.g., "parcels+15, flats+30").`, defaultReason);
            if (reasonPrompt === null) return;
            const reasonInput = reasonPrompt.trim();
            const nowIso = (/* @__PURE__ */ new Date()).toISOString();
            let tags = parseDismissReasonInput2(reasonInput);
            if (!tags.length) {
              let minutesFromReason = null;
              let reason = reasonInput;
              const reasonMatch = reasonInput.match(/(.+?)\s*\+\s*(\d+)/);
              if (reasonMatch) {
                reason = reasonMatch[1].trim();
                minutesFromReason = parseFloat(reasonMatch[2]);
              }
              const minutesPrompt = window.prompt("Minutes attributable to this reason (optional, numbers only):", minutesFromReason != null ? String(minutesFromReason) : deltaMinutes != null ? String(deltaMinutes) : "");
              let minutes = null;
              if (minutesPrompt && minutesPrompt.trim()) {
                const parsed = parseFloat(minutesPrompt.trim());
                if (Number.isFinite(parsed)) minutes = parsed;
              }
              const fallbackReason = reason.replace(/\s+/g, " ").trim();
              if (!fallbackReason) {
                window.alert("No reason provided; dismissal cancelled.");
                return;
              }
              tags = [{ reason: fallbackReason, minutes: minutes != null ? minutes : null }];
            } else {
              const tagsNeedingMinutes = tags.filter((tag) => tag.minutes == null);
              if (tagsNeedingMinutes.length === 1) {
                const minutesPrompt = window.prompt("Minutes attributable to this reason (optional, numbers only):", deltaMinutes != null ? String(deltaMinutes) : "");
                if (minutesPrompt && minutesPrompt.trim()) {
                  const parsed = parseFloat(minutesPrompt.trim());
                  if (Number.isFinite(parsed)) tagsNeedingMinutes[0].minutes = parsed;
                }
              }
            }
            const existing = loadDismissedResiduals2().filter((item) => item && item.iso !== iso);
            if (tags.length) {
              const entry = {
                iso,
                tags: tags.map((t) => ({
                  reason: t.reason,
                  minutes: t.minutes,
                  notedAt: Date.now()
                })),
                notedAt: nowIso
              };
              existing.push(entry);
              saveDismissedResiduals2(existing);
            } else {
              saveDismissedResiduals2(existing);
            }
            buildDiagnostics2(rows);
          });
        });
      }
      const noteButtons = (tbody == null ? void 0 : tbody.querySelectorAll(".diag-note")) || [];
      noteButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const note = btn.dataset.noteFull ? decodeURIComponent(btn.dataset.noteFull) : "";
          if (!note) {
            window.alert("No notes recorded for this day.");
          } else {
            window.alert(note);
          }
        });
      });
    }
    function formatNumber(val, opts) {
      var _a5;
      const decimals = (_a5 = opts == null ? void 0 : opts.decimals) != null ? _a5 : 2;
      const suffix = (opts == null ? void 0 : opts.suffix) || "";
      const n = val == null ? null : Number(val);
      if (n == null || !Number.isFinite(n)) return "\u2014";
      return `${n.toFixed(decimals)}${suffix}`;
    }
    function normalizeHours(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      if (Math.abs(n) > 24) return n / 60;
      return n;
    }
    function normalizeHours(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      if (Math.abs(n) > 24) return n / 60;
      return n;
    }
    function buildDayCompare2(rows) {
      var _a5;
      const flags = getFlags();
      const filteredRows = filterRowsForView2(rows || []);
      const card = document.getElementById("dayCompareCard");
      const dailyMovers = document.getElementById("dcDailyMovers");
      if (!card) {
        if (dailyMovers) dailyMovers.style.display = "none";
        return;
      }
      if (!flags || !flags.dayCompare) {
        card.style.display = "none";
        if (dailyMovers) dailyMovers.style.display = "none";
        return;
      }
      card.style.display = "block";
      const subjectSelect = document.getElementById("dcSubjectSelect");
      const referenceSelect = document.getElementById("dcReferenceMode");
      const manualPicker = document.getElementById("dcManualPicker");
      const manualSelect = document.getElementById("dcManualSelect");
      const emptyState = document.getElementById("dcEmpty");
      const compareState = document.getElementById("dcCompare");
      const subjectLabel = document.getElementById("dcSubjectLabel");
      const referenceLabel = document.getElementById("dcReferenceLabel");
      const subjectPills = document.getElementById("dcSubjectPills");
      const referencePills = document.getElementById("dcReferencePills");
      const subjectNotes = document.getElementById("dcSubjectNotes");
      const referenceNotes = document.getElementById("dcReferenceNotes");
      const highlightsRow = document.getElementById("dcHighlights");
      const reasoningEl = document.getElementById("dcReasoning");
      const tableBody = document.getElementById("dcTableBody");
      const toggleBtn = document.getElementById("dcToggleRef");
      if (!subjectSelect || !referenceSelect || !manualSelect || !emptyState || !compareState || !tableBody) return;
      const context = buildDayCompareContext(filteredRows, 365);
      const worked = context.worked;
      if (!worked.length) {
        emptyState.textContent = "No worked days yet. Add an entry to compare.";
        emptyState.style.display = "block";
        compareState.style.display = "none";
        if (toggleBtn) toggleBtn.style.display = "none";
        if (dailyMovers) dailyMovers.style.display = "none";
        return;
      }
      const storedSubject = localStorage.getItem(DAY_COMPARE_STORE.subject);
      let storedMode = localStorage.getItem(DAY_COMPARE_STORE.mode) || "last";
      const storedManualInitial = localStorage.getItem(DAY_COMPARE_STORE.manual);
      function formatOption(row) {
        try {
          const dt = DateTime.fromISO(row.work_date, { zone: ZONE });
          const weekday = dt.toFormat("ccc");
          const label = dt.toFormat("LLL dd");
          const total = Number(row.hours || row.totalHours || 0).toFixed(2);
          const moon = moonPhaseEmoji(row.work_date);
          return `${row.work_date} \xB7 ${weekday} ${label} \xB7 ${total}h ${moon}`;
        } catch (_) {
          return row.work_date;
        }
      }
      subjectSelect.innerHTML = worked.map((row) => `<option value="${row.work_date}">${formatOption(row)}</option>`).join("");
      subjectSelect.value = storedSubject && subjectSelect.querySelector(`option[value="${storedSubject}"]`) ? storedSubject : ((_a5 = worked[0]) == null ? void 0 : _a5.work_date) || "";
      const manualOption = referenceSelect.querySelector('option[value="manual"]');
      const manualAvailable = worked.length > 1;
      if (manualOption) {
        manualOption.disabled = !manualAvailable;
        if (!manualAvailable && storedMode === "manual") storedMode = "last";
      }
      referenceSelect.value = storedMode;
      function subjectIso() {
        var _a6;
        return subjectSelect.value || ((_a6 = worked[0]) == null ? void 0 : _a6.work_date);
      }
      function modeLabel(mode) {
        if (mode === "last") return "Last weekday";
        if (mode === "baseline") return "Baseline avg";
        if (mode === "manual") return "Picked day";
        return mode;
      }
      function populateManualOptions() {
        const current = subjectIso();
        const altRows = worked.filter((r) => r.work_date !== current);
        manualSelect.innerHTML = altRows.map((row) => `<option value="${row.work_date}">${formatOption(row)}</option>`).join("");
        if (!altRows.length) {
          manualSelect.value = "";
          return;
        }
        const latestStored = localStorage.getItem(DAY_COMPARE_STORE.manual) || storedManualInitial;
        manualSelect.value = latestStored && manualSelect.querySelector(`option[value="${latestStored}"]`) ? latestStored : altRows[0].work_date;
      }
      populateManualOptions();
      if (manualPicker) manualPicker.style.display = referenceSelect.value === "manual" ? "block" : "none";
      function summarizeExtras(metric) {
        if (!metric) return "";
        const parts = [];
        if (metric.mood) parts.push(`Mood: ${metric.mood}`);
        if (metric.weather) parts.push(`Weather: ${metric.weather}`);
        if (metric.reason) parts.push(`Reason: ${metric.reason}`);
        if (metric.notes) parts.push(`Notes: ${metric.notes}`);
        return parts.join(" \u2022 ");
      }
      function pillHtml(label, value) {
        return `<span class="pill"><small>${label}</small> <b>${value}</b></span>`;
      }
      function render() {
        const subjectMetrics = getSubjectMetrics(context, subjectIso());
        let referenceMetrics;
        const mode = referenceSelect.value;
        if (mode === "last") referenceMetrics = getLastSameWeekdayMetrics(context, subjectIso());
        else if (mode === "baseline") referenceMetrics = getWeekdayBaselineMetrics(context, subjectIso());
        else if (mode === "manual") referenceMetrics = getCustomReferenceMetrics(context, manualSelect.value);
        else referenceMetrics = null;
        if (!subjectMetrics || !referenceMetrics) {
          emptyState.textContent = "Need more comparison data. Add more worked days.";
          emptyState.style.display = "block";
          compareState.style.display = "none";
          if (dailyMovers) dailyMovers.style.display = "none";
          return;
        }
        emptyState.style.display = "none";
        compareState.style.display = "block";
        if (dailyMovers) dailyMovers.style.display = "block";
        subjectLabel.textContent = subjectMetrics.label || subjectMetrics.workDate;
        referenceLabel.textContent = referenceMetrics.label || referenceMetrics.workDate;
        const { rows: tableRows, highlights, reasoning } = computeDeltaDetails(subjectMetrics, referenceMetrics);
        subjectPills.innerHTML = [
          pillHtml("Total", formatNumber(subjectMetrics.totalHours, { decimals: 2, suffix: "h" })),
          pillHtml("Route", formatNumber(subjectMetrics.routeHours, { decimals: 2, suffix: "h" })),
          pillHtml("Office", formatNumber(subjectMetrics.officeHours, { decimals: 2, suffix: "h" })),
          pillHtml("Volume", formatNumber(subjectMetrics.volume, { decimals: 2 })),
          pillHtml("Eff.", formatNumber(subjectMetrics.efficiencyMinutes, { decimals: 1, suffix: "m/vol" }))
        ].join(" ");
        referencePills.innerHTML = [
          pillHtml("Total", formatNumber(referenceMetrics.totalHours, { decimals: 2, suffix: "h" })),
          pillHtml("Route", formatNumber(referenceMetrics.routeHours, { decimals: 2, suffix: "h" })),
          pillHtml("Office", formatNumber(referenceMetrics.officeHours, { decimals: 2, suffix: "h" })),
          pillHtml("Volume", formatNumber(referenceMetrics.volume, { decimals: 2 })),
          pillHtml("Eff.", formatNumber(referenceMetrics.efficiencyMinutes, { decimals: 1, suffix: "m/vol" }))
        ].join(" ");
        subjectNotes.textContent = summarizeExtras(subjectMetrics) || "\u2014";
        referenceNotes.textContent = summarizeExtras(referenceMetrics) || "\u2014";
        tableBody.innerHTML = tableRows.map((row) => {
          const color = row.color || "var(--muted)";
          return `<tr>
            <td style="padding:6px 4px">${row.label}</td>
            <td style="padding:6px 4px;text-align:right">${row.subjectText}</td>
            <td style="padding:6px 4px;text-align:right">${row.referenceText}</td>
            <td style="padding:6px 4px;text-align:right;color:${color}">${row.deltaText}</td>
          </tr>`;
        }).join("");
        if (dailyMovers) {
          if (tableRows.length) {
            const moverKeys = ["totalHours", "routeHours", "officeHours"];
            const moverLabels = {
              totalHours: "Total",
              routeHours: "Route",
              officeHours: "Office"
            };
            dailyMovers.innerHTML = moverKeys.map((key) => {
              const row = tableRows.find((r) => r.key === key);
              const text = row ? row.deltaText : "\u2014";
              const color = row ? row.color || "var(--muted)" : "var(--muted)";
              return `<span class="pill" style="border-color:var(--border);color:${color}"><small>${moverLabels[key]}</small> <b>${text}</b></span>`;
            }).join(" ");
            dailyMovers.style.display = "flex";
          } else {
            dailyMovers.style.display = "none";
            dailyMovers.innerHTML = "";
          }
        }
        const candidateHighlights = highlights.length ? highlights : tableRows.map((row) => ({ label: row.label, deltaText: row.deltaText, color: row.color || "var(--muted)" }));
        highlightsRow.innerHTML = candidateHighlights.slice(0, 3).map((h) => `<span class="pill" style="border-color:var(--border);color:${h.color || "var(--muted)"}"><small>${h.label}</small> <b>${h.deltaText}</b></span>`).join(" ") || '<span class="pill"><small>\u0394</small> <b style="color:var(--muted)">Similar</b></span>';
        reasoningEl.textContent = reasoning || "";
        localStorage.setItem(DAY_COMPARE_STORE.subject, subjectIso());
        localStorage.setItem(DAY_COMPARE_STORE.mode, mode);
        if (mode === "manual" && manualSelect.value) {
          localStorage.setItem(DAY_COMPARE_STORE.manual, manualSelect.value);
        }
      }
      subjectSelect.addEventListener("change", () => {
        populateManualOptions();
        render();
      });
      referenceSelect.addEventListener("change", () => {
        if (manualPicker) manualPicker.style.display = referenceSelect.value === "manual" ? "block" : "none";
        render();
      });
      manualSelect.addEventListener("change", render);
      if (toggleBtn) {
        const available = ["last", "baseline", ...worked.length > 1 ? ["manual"] : []];
        toggleBtn.style.display = available.length > 1 ? "" : "none";
        toggleBtn.onclick = () => {
          const current = referenceSelect.value;
          const idx = available.indexOf(current);
          const next = available[(idx + 1) % available.length];
          referenceSelect.value = next;
          referenceSelect.dispatchEvent(new Event("change"));
        };
      }
      render();
    }
    function buildVolumeLeaderboard2(rows) {
      const flags = getFlags();
      const panel = document.getElementById("volumeLeaderboard");
      const body = document.getElementById("volumeLeaderboardBody");
      const note = document.getElementById("volumeLeaderboardNote");
      if (!panel || !body) return;
      if (!flags || !flags.mixViz) {
        panel.style.display = "none";
        return;
      }
      const worked = filterRowsForView2(rows || []).filter((r) => r && r.status !== "off" && (+r.parcels || 0) + (+r.letters || 0) > 0);
      if (!worked.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:8px;color:var(--muted)">No worked days yet.</td></tr>';
        if (note) note.textContent = "\u2014";
        return;
      }
      const weight = getCurrentLetterWeight();
      const volumes = worked.map((r) => ({
        date: r.work_date,
        parcels: +r.parcels || 0,
        letters: +r.letters || 0,
        volume: combinedVolume2(r.parcels, r.letters, weight)
      }));
      const asc = [...volumes].sort((a, b) => a.volume - b.volume);
      const percentileByDate = /* @__PURE__ */ new Map();
      asc.forEach((item, idx) => {
        const pct = Math.round((idx + 1) / asc.length * 100);
        percentileByDate.set(item.date, pct);
      });
      const top = [...volumes].sort((a, b) => b.volume - a.volume).slice(0, Math.min(10, volumes.length));
      body.innerHTML = top.map((item) => {
        const dt = DateTime.fromISO(item.date, { zone: ZONE });
        const pct = percentileByDate.get(item.date);
        const pctText = pct != null ? `${pct}%` : "\u2014";
        return `<tr>
        <td>${dt.toFormat("ccc LLL dd")}</td>
        <td>${item.parcels}</td>
        <td>${item.letters}</td>
        <td>${item.volume.toFixed(1)}</td>
        <td>${pctText}</td>
      </tr>`;
      }).join("");
      if (note) note.textContent = `Combined volume = parcels + ${(weight || 0).toFixed(2)}\xD7letters`;
    }
    return {
      buildDiagnostics: buildDiagnostics2,
      buildDayCompare: buildDayCompare2,
      buildVolumeLeaderboard: buildVolumeLeaderboard2,
      fitVolumeTimeModel: fitVolumeTimeModel2,
      getResidualModel: getResidualModel2,
      getLatestDiagnosticsContext: () => latestDiagnosticsContext,
      resetDiagnosticsCache: () => {
        residModelCache = null;
      },
      __test: __testApi
    };
  }

  // src/features/aiSummary.js
  function loadLastSummary() {
    try {
      const raw = localStorage.getItem(AI_LAST_SUMMARY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  function saveLastSummary(summary) {
    try {
      if (summary) {
        localStorage.setItem(AI_LAST_SUMMARY_KEY, JSON.stringify(summary));
      } else {
        localStorage.removeItem(AI_LAST_SUMMARY_KEY);
      }
      return true;
    } catch (err) {
      console.error("[AI summary] failed to persist", err);
      return false;
    }
  }
  function isCollapsed() {
    try {
      return localStorage.getItem(AI_SUMMARY_COLLAPSED_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  function saveCollapsed(flag) {
    try {
      localStorage.setItem(AI_SUMMARY_COLLAPSED_KEY, flag ? "1" : "0");
    } catch (_) {
    }
  }
  function createAiSummary({
    elements,
    supabaseClient,
    getCurrentUserId,
    getDiagnosticsContext,
    defaultPrompt
  }) {
    const {
      card,
      button,
      toggleButton,
      hint,
      status,
      output,
      content,
      tokenUsageCard: tokenUsageCard2,
      tokenTodayEl: tokenTodayEl2,
      tokenWeekEl: tokenWeekEl2,
      tokenMonthEl: tokenMonthEl2,
      tokenLimitEl: tokenLimitEl2,
      tokenBarFill: tokenBarFill2,
      tokenBarNote: tokenBarNote2,
      tokenTodayInput: tokenTodayInput2,
      tokenWeekInput: tokenWeekInput2,
      tokenMonthInput: tokenMonthInput2,
      tokenLimitInput: tokenLimitInput2
    } = elements;
    const promptFallback = defaultPrompt || "Provide an upbeat summary.";
    function applyCollapsed(force) {
      const collapsed = typeof force === "boolean" ? force : isCollapsed();
      if (content) content.style.display = collapsed ? "none" : "block";
      if (toggleButton) toggleButton.textContent = collapsed ? "Expand" : "Collapse";
    }
    function setCollapsed(flag) {
      saveCollapsed(flag);
      applyCollapsed(flag);
    }
    function toggleCollapsed() {
      setCollapsed(!isCollapsed());
    }
    function updateTokenUsageCard(usage) {
      if (!usage || !tokenUsageCard2) return;
      const today = usage.today || 0;
      const week = usage.week || 0;
      const month = usage.month || 0;
      const limit = usage.monthlyLimit;
      if (tokenTodayEl2) tokenTodayEl2.textContent = today;
      if (tokenWeekEl2) tokenWeekEl2.textContent = week;
      if (tokenMonthEl2) tokenMonthEl2.textContent = month;
      if (tokenLimitEl2) tokenLimitEl2.textContent = limit != null ? limit : "\u2014";
      if (tokenBarFill2) {
        let percent = 0;
        if (limit && limit > 0) {
          percent = Math.min(month / limit * 100, 100);
        }
        tokenBarFill2.style.width = `${percent}%`;
        let color = "var(--brand)";
        if (percent > 90) color = "#ff4d4d";
        else if (percent > 60) color = "#ffcc00";
        tokenBarFill2.style.background = color;
      }
      if (tokenBarNote2) {
        tokenBarNote2.textContent = "Token totals update automatically after each AI summary.";
      }
      tokenUsageCard2.style.display = "block";
    }
    function populateTokenInputs(usage) {
      if (!usage) return;
      if (tokenTodayInput2) tokenTodayInput2.value = usage.today;
      if (tokenWeekInput2) tokenWeekInput2.value = usage.week;
      if (tokenMonthInput2) tokenMonthInput2.value = usage.month;
      if (tokenLimitInput2) tokenLimitInput2.value = usage.monthlyLimit != null ? usage.monthlyLimit : "";
    }
    function readTokenInputs() {
      const usage = loadTokenUsage();
      if (tokenTodayInput2) usage.today = Number(tokenTodayInput2.value) || 0;
      if (tokenWeekInput2) usage.week = Number(tokenWeekInput2.value) || 0;
      if (tokenMonthInput2) usage.month = Number(tokenMonthInput2.value) || 0;
      if (tokenLimitInput2) {
        const val = tokenLimitInput2.value;
        usage.monthlyLimit = val !== "" ? Number(val) : null;
      }
      saveTokenUsage(usage);
      updateTokenUsageCard(usage);
    }
    function addTokenUsage(deltaTokens) {
      if (!(deltaTokens > 0)) return;
      const usage = loadTokenUsage();
      usage.today += deltaTokens;
      usage.week += deltaTokens;
      usage.month += deltaTokens;
      saveTokenUsage(usage);
      updateTokenUsageCard(usage);
      populateTokenInputs(usage);
    }
    async function fetchAiSummaryFromSupabase() {
      const userId = getCurrentUserId();
      if (!userId || !supabaseClient) return null;
      try {
        const today = todayIso();
        const { data, error } = await supabaseClient.from("daily_reports").select("report,timestamp").eq("user_id", userId).eq("date", today).maybeSingle();
        if (error && error.code !== "PGRST116") {
          console.warn("[AI summary] load error", error.message);
          return null;
        }
        if (!data || !data.report) return null;
        let parsed;
        try {
          parsed = typeof data.report === "string" ? JSON.parse(data.report) : data.report;
        } catch (_) {
          parsed = { text: data.report };
        }
        if (!parsed || !parsed.text) return null;
        if (!parsed.timestamp && data.timestamp) {
          parsed.timestamp = data.timestamp;
        }
        saveLastSummary(parsed);
        return parsed;
      } catch (err) {
        console.warn("[AI summary] load exception", err);
        return null;
      }
    }
    async function saveAiSummaryToSupabase(summary) {
      const userId = getCurrentUserId();
      if (!userId || !supabaseClient) return false;
      try {
        const payload = {
          user_id: userId,
          date: todayIso(),
          report: JSON.stringify(summary || {})
        };
        const { error } = await supabaseClient.from("daily_reports").upsert(payload, { onConflict: ["user_id", "date"] });
        if (error) {
          console.warn("[AI summary] save error", error.message);
          return false;
        }
        return true;
      } catch (err) {
        console.warn("[AI summary] save exception", err);
        return false;
      }
    }
    function updateAvailability() {
      if (!card || !button || !hint) return;
      card.style.display = "block";
      const key = getOpenAiKey();
      button.disabled = !key;
      hint.textContent = key ? "AI summary uses OpenAI when you click the button. Data stays local until then." : "Set your OpenAI API key in Settings \u2192 AI Summary to enable.";
      applyCollapsed();
    }
    function renderLastSummary() {
      if (!output || !status) return;
      const saved = loadLastSummary();
      if (saved && saved.text) {
        output.textContent = saved.text;
        const stamp = saved.timestamp ? new Date(saved.timestamp) : null;
        status.textContent = stamp ? `Last updated ${stamp.toLocaleString()}` : "Last summary loaded.";
        return;
      }
      output.textContent = "";
      status.textContent = "No AI summary yet.";
      const userId = getCurrentUserId();
      if (!userId) return;
      fetchAiSummaryFromSupabase().then((remote) => {
        if (remote && remote.text) {
          output.textContent = remote.text;
          const stamp = remote.timestamp ? new Date(remote.timestamp) : null;
          status.textContent = stamp ? `Last updated ${stamp.toLocaleString()}` : "Loaded from cloud.";
        }
      });
    }
    function buildPrompt(ctx) {
      const lines = [];
      lines.push("You are helping a USPS route analyst interpret daily metrics.");
      if (ctx.summaryText) {
        lines.push(`Summary: ${ctx.summaryText}`);
      }
      if (ctx.catchupSummary && ctx.catchupSummary.count) {
        const c = ctx.catchupSummary;
        const extra = c.addedMinutes ? `${(c.addedMinutes / 60).toFixed(2)} extra hours tagged` : "";
        const ratio = c.avgRouteRatio ? `avg route ratio ${c.avgRouteRatio.toFixed(2)}\xD7` : "";
        const parts = [extra, ratio].filter(Boolean).join(" \xB7 ");
        lines.push(`Holiday catch-up context: ${c.count} day(s)${parts ? ` ${parts}` : ""}`);
      }
      if (ctx.weight && ctx.weight.enabled) {
        lines.push(`Holiday downweight applied: average weight ${(ctx.weight.averageWeight || 1).toFixed(2)}, ${ctx.weight.downweighted || 0} day(s) affected.`);
      }
      const residuals = ctx.residuals || [];
      if (residuals.length) {
        lines.push("Top residual days (actual - predicted route minutes):");
        residuals.forEach((r, idx) => {
          const tags = r.tags && r.tags.length ? ` tags: ${r.tags.join(", ")}` : "";
          const weather2 = r.weather ? ` weather: ${r.weather}` : "";
          const notes2 = r.notes ? ` notes: ${r.notes}` : "";
          lines.push(`${idx + 1}. ${r.iso}: ${r.deltaMinutes >= 0 ? "+" : ""}${r.deltaMinutes}m; parcels ${r.parcels}; letters ${r.letters}; boxholders ${r.boxholders || "\u2014"}${tags}${weather2}${notes2}`);
        });
      }
      const dismissed = ctx.dismissed || [];
      if (dismissed.length) {
        const list = dismissed.map((item) => {
          const tags = (item.tags || []).map((tag) => tag.minutes != null ? `${tag.reason} ${tag.minutes}m` : tag.reason).join(", ");
          return `${item.iso}${tags ? ": " + tags : ""}`;
        }).join("; ");
        lines.push(`Dismissed (already reviewed): ${list}`);
      }
      lines.push("Provide 3 concise bullet points: 1) root causes or contributing factors, 2) suggested actions or notes for tomorrow, 3) notable trends or items to watch. Keep it short and focused.");
      return lines.join("\n");
    }
    async function generateSummary() {
      var _a5, _b, _c, _d;
      if (!button) return;
      const key = getOpenAiKey();
      if (!key) {
        if (status) status.textContent = "Set your OpenAI API key in Settings first.";
        updateAvailability();
        return;
      }
      const ctx = typeof getDiagnosticsContext === "function" ? getDiagnosticsContext() : null;
      if (!ctx || !(ctx.residuals || []).length) {
        if (status) status.textContent = "Run diagnostics first so residuals are available.";
        return;
      }
      const prompt2 = buildPrompt(ctx);
      setCollapsed(false);
      button.disabled = true;
      if (status) status.textContent = "Generating summary\u2026";
      if (output) output.textContent = "";
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.4,
            messages: [
              { role: "system", content: getAiBasePrompt(promptFallback) },
              { role: "user", content: prompt2 }
            ]
          })
        });
        if (!response.ok) {
          const text2 = await response.text();
          throw new Error(text2 || `HTTP ${response.status}`);
        }
        const data = await response.json();
        let text = "";
        const content2 = (_c = (_b = (_a5 = data == null ? void 0 : data.choices) == null ? void 0 : _a5[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content;
        if (typeof content2 === "string") {
          text = content2;
        } else if (Array.isArray(content2)) {
          text = content2.map((part) => typeof part === "string" ? part : (part == null ? void 0 : part.text) || "").join("");
        } else if (content2 && typeof content2 === "object" && "text" in content2) {
          text = content2.text;
        }
        text = (text || "").trim() || "(No summary returned)";
        if (output) output.textContent = text;
        const stamp = (/* @__PURE__ */ new Date()).toISOString();
        if (status) status.textContent = `Updated ${new Date(stamp).toLocaleTimeString()}`;
        const summaryPayload = { text, timestamp: stamp, prompt: prompt2 };
        const persisted = saveLastSummary(summaryPayload);
        await saveAiSummaryToSupabase(summaryPayload);
        if (persisted) renderLastSummary();
        const tokensUsed = (_d = data == null ? void 0 : data.usage) == null ? void 0 : _d.total_tokens;
        if (Number.isFinite(tokensUsed) && tokensUsed > 0) {
          addTokenUsage(tokensUsed);
        }
        setCollapsed(false);
      } catch (err) {
        console.error("[AI summary] error", err);
        if (status) status.textContent = `AI summary failed: ${err.message || err}`;
      } finally {
        button.disabled = false;
      }
    }
    return {
      updateAvailability,
      renderLastSummary,
      generateSummary,
      populateTokenInputs,
      readTokenInputs,
      setCollapsed,
      toggleCollapsed,
      addTokenUsage,
      applyCollapsed,
      fetchAiSummaryFromSupabase,
      updateTokenUsageCard
    };
  }

  // src/features/charts.js
  function createCharts({
    getFlags,
    filterRowsForView: filterRowsForView2,
    vacGlyph: vacGlyph2,
    routeAdjustedHours: routeAdjustedHours2,
    boxholderAdjMinutes: boxholderAdjMinutes2,
    getLastNonEmptyWeek: getLastNonEmptyWeek2,
    buildDayCompare: buildDayCompare2
  }) {
    let dowChart;
    let parcelsChart;
    let lettersChart;
    function destroyCharts() {
      [dowChart, parcelsChart, lettersChart].forEach((c) => {
        if (c && typeof c.destroy === "function") {
          try {
            c.destroy();
          } catch (_) {
          }
        }
      });
      dowChart = parcelsChart = lettersChart = null;
    }
    function enableChartTap(chart, canvas) {
      if (!chart || !canvas) return;
      const handler = (ev) => {
        try {
          const rect = canvas.getBoundingClientRect();
          const touch = ev.touches && ev.touches[0];
          const cx = touch ? touch.clientX : ev.clientX;
          const cy = touch ? touch.clientY : ev.clientY;
          const x = cx - rect.left;
          const y = cy - rect.top;
          const points = chart.getElementsAtEventForMode(ev, "nearest", { intersect: false }, true);
          if (points && points.length) {
            const active = [{ datasetIndex: points[0].datasetIndex, index: points[0].index }];
            if (chart.setActiveElements) chart.setActiveElements(active);
            if (chart.tooltip && chart.tooltip.setActiveElements) chart.tooltip.setActiveElements(active, { x, y });
            chart.update();
          }
        } catch (_) {
        }
      };
      ["click", "touchstart", "pointerdown"].forEach((type) => {
        canvas.addEventListener(type, handler, { passive: true });
      });
    }
    function buildCharts2(rows) {
      rows = filterRowsForView2(rows || []);
      if (!window.Chart) {
        console.warn("Chart.js missing \u2014 skipping charts");
        return;
      }
      destroyCharts();
      const workRows = rows.filter((r) => r.status !== "off");
      const byDow = Array.from({ length: 7 }, () => ({ h: 0, c: 0 }));
      for (const r of workRows) {
        const h = Number(r.hours || 0);
        if (h > 0) {
          const d = dowIndex(r.work_date);
          byDow[d].h += h;
          byDow[d].c++;
        }
      }
      const dowLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const order = [1, 2, 3, 4, 5, 6, 0];
      const perDow = byDow.map((x) => x.c ? +(x.h / x.c).toFixed(2) : 0);
      const dowData = order.map((i) => perDow[i]);
      dowChart = new Chart(document.getElementById("dowChart"), {
        type: "bar",
        data: { labels: dowLabels, datasets: [{ label: "Avg Total Hours", data: dowData }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
      const sortedWork = [...workRows].sort((a, b) => a.work_date.localeCompare(b.work_date));
      const labels = sortedWork.map((r) => r.work_date);
      const parcelsCanvas = document.getElementById("parcelsChart");
      parcelsChart = new Chart(parcelsCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [{ label: "Parcels", data: sortedWork.map((r) => +r.parcels || 0), pointRadius: 3, pointHoverRadius: 8, pointHitRadius: 16 }]
        },
        options: {
          responsive: true,
          interaction: { mode: "nearest", intersect: false },
          events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "touchend"],
          animation: { duration: 0 },
          plugins: {
            legend: { display: false },
            tooltip: {
              animation: { duration: 0 },
              callbacks: {
                title: (items) => {
                  var _a5;
                  const iso = (_a5 = items == null ? void 0 : items[0]) == null ? void 0 : _a5.label;
                  if (!iso) return "";
                  const d = DateTime.fromISO(iso, { zone: ZONE });
                  return d.toFormat("cccc \u2022 MMM d, yyyy") + (vacGlyph2 ? vacGlyph2(iso) : "");
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 8,
                callback: function(value) {
                  const iso = this.getLabelForValue(value);
                  const d = DateTime.fromISO(iso, { zone: ZONE });
                  return [d.toFormat("ccc"), d.toFormat("M/d")];
                }
              }
            }
          }
        }
      });
      const lettersCanvas = document.getElementById("lettersChart");
      lettersChart = new Chart(lettersCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [{ label: "Letters", data: sortedWork.map((r) => +r.letters || 0), pointRadius: 3, pointHoverRadius: 8, pointHitRadius: 16 }]
        },
        options: {
          responsive: true,
          interaction: { mode: "nearest", intersect: false },
          events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "touchend"],
          animation: { duration: 0 },
          plugins: {
            legend: { display: false },
            tooltip: {
              animation: { duration: 0 },
              callbacks: {
                title: (items) => {
                  var _a5;
                  const iso = (_a5 = items == null ? void 0 : items[0]) == null ? void 0 : _a5.label;
                  if (!iso) return "";
                  const d = DateTime.fromISO(iso, { zone: ZONE });
                  return d.toFormat("cccc \u2022 MMM d, yyyy") + (vacGlyph2 ? vacGlyph2(iso) : "");
                }
              }
            }
          },
          scales: {
            x: {
              ticks: {
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 8,
                callback: function(value) {
                  const iso = this.getLabelForValue(value);
                  const d = DateTime.fromISO(iso, { zone: ZONE });
                  return [d.toFormat("ccc"), d.toFormat("M/d")];
                }
              }
            }
          }
        }
      });
      enableChartTap(parcelsChart, parcelsCanvas);
      enableChartTap(lettersChart, lettersCanvas);
    }
    function buildMonthlyGlance2(rows) {
      rows = filterRowsForView2(rows || []);
      const today = DateTime.now().setZone(ZONE);
      const weekStart0 = startOfWeekMonday(today);
      const weekEnd0 = endOfWeekSunday(today);
      const weekStart1 = startOfWeekMonday(today.minus({ weeks: 1 }));
      const weekEnd1 = endOfWeekSunday(today.minus({ weeks: 1 }));
      const weekStart2 = startOfWeekMonday(today.minus({ weeks: 2 }));
      const weekEnd2 = endOfWeekSunday(today.minus({ weeks: 2 }));
      const weekStart3 = startOfWeekMonday(today.minus({ weeks: 3 }));
      const weekEnd3 = endOfWeekSunday(today.minus({ weeks: 3 }));
      const inRange = (r, from, to) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };
      const worked = rows.filter((r) => r.status !== "off");
      const totals = (from, to) => {
        const arr = worked.filter((r) => inRange(r, from, to));
        const h = arr.reduce((t, r) => t + (+r.hours || 0), 0);
        const p = arr.reduce((t, r) => t + (+r.parcels || 0), 0);
        const l = arr.reduce((t, r) => t + (+r.letters || 0), 0);
        return { h, p, l };
      };
      const W3 = totals(weekStart3, weekEnd3);
      const W2 = totals(weekStart2, weekEnd2);
      const W1 = totals(weekStart1, weekEnd1);
      const W0 = totals(weekStart0, weekEnd0);
      const fmtH = (n) => (n || 0).toFixed(1);
      const labels = [weekEnd3, weekEnd2, weekEnd1, weekEnd0].map((d) => d.toFormat("LLL dd"));
      const hoursDiv = document.getElementById("mgHours");
      const parcelsDiv = document.getElementById("mgParcels");
      const lettersDiv = document.getElementById("mgLetters");
      if (!hoursDiv || !parcelsDiv || !lettersDiv) return;
      hoursDiv.textContent = `W4 ${fmtH(W3.h)} \u2022 W3 ${fmtH(W2.h)} \u2022 W2 ${fmtH(W1.h)} \u2022 W1 ${fmtH(W0.h)}`;
      parcelsDiv.textContent = `W4 ${W3.p} \u2022 W3 ${W2.p} \u2022 W2 ${W1.p} \u2022 W1 ${W0.p}`;
      lettersDiv.textContent = `W4 ${W3.l} \u2022 W3 ${W2.l} \u2022 W2 ${W1.l} \u2022 W1 ${W0.l}`;
      if (window.Chart) {
        try {
          const renderSpark = (target, dataArr, color, metricName, starts2, ends2) => {
            target.innerHTML = "";
            const nums = (dataArr || []).filter((v) => v != null && isFinite(v));
            const avg = nums.length ? nums.reduce((a, b) => a + Number(b), 0) / nums.length : null;
            const fmtAvg = (v) => {
              if (v == null) return "\u2014";
              return metricName === "Hours" ? (Math.round(v * 10) / 10).toFixed(1) + "h" : String(Math.round(v));
            };
            const wrap = document.createElement("div");
            wrap.style.display = "flex";
            wrap.style.flexDirection = "column";
            wrap.style.width = "100%";
            const avgEl = document.createElement("span");
            avgEl.className = "pill";
            avgEl.style.fontSize = "11px";
            avgEl.style.padding = "2px 6px";
            avgEl.style.alignSelf = "flex-start";
            avgEl.style.marginBottom = "4px";
            avgEl.innerHTML = `<small>Avg</small> <b>${fmtAvg(avg)}</b>`;
            wrap.appendChild(avgEl);
            const canvas = document.createElement("canvas");
            canvas.className = "sparkline";
            try {
              canvas.height = 56;
            } catch (_) {
            }
            canvas.style.height = "56px";
            canvas.style.maxHeight = "56px";
            canvas.style.width = "100%";
            canvas.style.cursor = "pointer";
            wrap.appendChild(canvas);
            const lbl = document.createElement("div");
            lbl.className = "sparkline-labels";
            lbl.textContent = labels.join(" \u2022 ");
            wrap.appendChild(lbl);
            const summary = document.createElement("div");
            summary.className = "sparkline-summary";
            summary.textContent = "Click a dot for details";
            wrap.appendChild(summary);
            target.appendChild(wrap);
            const ctx = canvas.getContext("2d");
            const chart = new Chart(ctx, {
              type: "line",
              data: { labels, datasets: [{
                label: metricName,
                data: dataArr,
                borderColor: color,
                backgroundColor: color,
                tension: 0.25,
                fill: false,
                borderWidth: 1,
                pointRadius: 3,
                pointHoverRadius: 6,
                pointHitRadius: 14
              }] },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 14, right: 24, bottom: 12, left: 24 } },
                interaction: { mode: "nearest", intersect: false },
                scales: { x: { display: false }, y: { display: false } },
                plugins: { legend: { display: false }, tooltip: {
                  enabled: true,
                  callbacks: {
                    title: (items) => {
                      try {
                        return fmtRange(items[0].dataIndex);
                      } catch (_) {
                        return "";
                      }
                    },
                    label: (item) => {
                      const v = item.parsed.y;
                      if (metricName === "Hours") return `Hours: ${(+v).toFixed(1)}h`;
                      return `${metricName}: ${Math.round(+v)}`;
                    }
                  }
                } }
              },
              plugins: []
            });
            const fmtVal = (v) => {
              if (v == null) return "\u2014";
              if (metricName === "Hours") return (Math.round(v * 10) / 10).toFixed(1) + "h";
              return String(Math.round(v));
            };
            const fmtRange = (i) => {
              try {
                const s = starts2[i];
                const e = ends2[i];
                if (s && e && s.toFormat && e.toFormat) {
                  return `${s.toFormat("LLL dd")} \u2013 ${e.toFormat("LLL dd")}`;
                }
              } catch (_) {
              }
              return labels[i] || "";
            };
            canvas.addEventListener("click", (evt) => {
              try {
                const points = chart.getElementsAtEventForMode(evt, "nearest", { intersect: true }, false);
                if (!points || !points.length) return;
                const idx = points[0].index;
                summary.textContent = `${metricName}: ${fmtVal(dataArr[idx])} \xB7 ${fmtRange(idx)}`;
              } catch (_) {
              }
            });
            canvas.tabIndex = 0;
            canvas.addEventListener("keydown", (e) => {
              var _a5;
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              const cur = (labels.indexOf((_a5 = (summary.textContent || "").split("\xB7").pop()) == null ? void 0 : _a5.trim()) + 1) % dataArr.length;
              summary.textContent = `${metricName}: ${fmtVal(dataArr[cur])} \xB7 ${fmtRange(cur)}`;
            });
          };
          const starts = [weekStart3, weekStart2, weekStart1, weekStart0];
          const ends = [weekEnd3, weekEnd2, weekEnd1, weekEnd0];
          const docStyle = getComputedStyle(document.documentElement);
          renderSpark(hoursDiv, [W3.h, W2.h, W1.h, W0.h].map((n) => +(n || 0).toFixed(1)), docStyle.getPropertyValue("--good").trim() || "#7CE38B", "Hours", starts, ends);
          renderSpark(parcelsDiv, [W3.p, W2.p, W1.p, W0.p], docStyle.getPropertyValue("--brand").trim() || "#2b7fff", "Parcels", starts, ends);
          renderSpark(lettersDiv, [W3.l, W2.l, W1.l, W0.l], docStyle.getPropertyValue("--warn").trim() || "#FFD27A", "Letters", starts, ends);
        } catch (e) {
          console.warn("Monthly Glance charts failed; showing text fallback", e);
        }
      } else if (!window.__chartLoadAttempted) {
        window.__chartLoadAttempted = true;
        try {
          const script = document.createElement("script");
          script.src = "vendor/chart.umd.js";
          script.async = true;
          script.onload = () => {
            try {
              if (window.Chart) {
                try {
                  buildMonthlyGlance2(rows);
                } catch (_) {
                }
                try {
                  buildCharts2(rows);
                } catch (_) {
                }
                try {
                  buildMixViz2(rows);
                } catch (_) {
                }
                try {
                  buildOfficeCompare2(rows);
                } catch (_) {
                }
                if (typeof buildDayCompare2 === "function") {
                  try {
                    buildDayCompare2(rows);
                  } catch (_) {
                  }
                }
                try {
                  buildQuickFilter2(rows);
                } catch (_) {
                }
              }
            } catch (_) {
            }
          };
          script.onerror = () => console.warn("Failed to load vendor/chart.umd.js; keeping text fallback");
          document.head.appendChild(script);
        } catch (e) {
          console.warn("Error injecting Chart.js script", e);
        }
      }
    }
    function mixSum(arr, fn) {
      let sum = 0;
      for (const item of arr) sum += +fn(item) || 0;
      return sum;
    }
    function mixRouteAdjustedMinutes(row) {
      try {
        if (typeof routeAdjustedHours2 === "function") {
          const hours = routeAdjustedHours2(row);
          if (isFinite(hours)) return hours * 60;
        }
      } catch (_) {
      }
      return Math.max(0, +row.route_minutes || 0);
    }
    function mixLoadLetterWeightFallback() {
      const DEF = 0.33;
      try {
        const stored = parseFloat(localStorage.getItem("routeStats.letterWeight"));
        if (isFinite(stored) && stored > 0) return stored;
      } catch (_) {
      }
      return DEF;
    }
    function mixComputeLetterWeight(rows) {
      const cleanRows = (rows || []).filter((r) => r && r.status !== "off");
      const n = cleanRows.length;
      if (!n) return mixLoadLetterWeightFallback();
      const Sy = mixSum(cleanRows, (r) => mixRouteAdjustedMinutes(r));
      const Sp = mixSum(cleanRows, (r) => +r.parcels || 0);
      const Sl = mixSum(cleanRows, (r) => +r.letters || 0);
      const Spp = mixSum(cleanRows, (r) => {
        const v = +r.parcels || 0;
        return v * v;
      });
      const Sll = mixSum(cleanRows, (r) => {
        const v = +r.letters || 0;
        return v * v;
      });
      const Spl = mixSum(cleanRows, (r) => {
        const p = +r.parcels || 0, l = +r.letters || 0;
        return p * l;
      });
      const Spy = mixSum(cleanRows, (r) => {
        const p = +r.parcels || 0;
        return p * mixRouteAdjustedMinutes(r);
      });
      const Sly = mixSum(cleanRows, (r) => {
        const l = +r.letters || 0;
        return l * mixRouteAdjustedMinutes(r);
      });
      const mp = Sp / n, ml = Sl / n, my = Sy / n;
      let Cpp = 0, Cll = 0, Cpl = 0, Cpy = 0, Cly = 0;
      for (const r of cleanRows) {
        const p = (+r.parcels || 0) - mp;
        const l = (+r.letters || 0) - ml;
        const y = mixRouteAdjustedMinutes(r) - my;
        Cpp += p * p;
        Cll += l * l;
        Cpl += p * l;
        Cpy += p * y;
        Cly += l * y;
      }
      const det = Cpp * Cll - Cpl * Cpl;
      if (!isFinite(det) || Math.abs(det) < 1e-6) {
        return mixLoadLetterWeightFallback();
      }
      const bp = (Cpy * Cll - Cpl * Cly) / det;
      const bl = (Cpp * Cly - Cpl * Cpy) / det;
      let w = isFinite(bp) && Math.abs(bp) > 1e-6 ? bl / bp : null;
      if (!isFinite(w) || w < 0) w = 0;
      if (w > 1.5) w = 1.5;
      const prev = mixLoadLetterWeightFallback();
      const alpha = 0.3;
      const smoothed = prev != null && isFinite(prev) ? alpha * w + (1 - alpha) * prev : w;
      try {
        localStorage.setItem("routeStats.letterWeight", String(smoothed));
      } catch (_) {
      }
      return smoothed;
    }
    function mixGetLetterWeight(rows) {
      try {
        const worked = (rows || []).filter((r) => r && r.status !== "off" && (+r.parcels || 0) + (+r.letters || 0) > 0).sort((a, b) => a.work_date < b.work_date ? -1 : 1);
        const sample = worked.slice(-60);
        return mixComputeLetterWeight(sample);
      } catch (_) {
        return mixLoadLetterWeightFallback();
      }
    }
    function mixCombinedVolume(p, l, w) {
      const weight = w == null ? mixLoadLetterWeightFallback() : w;
      const pp = +p || 0;
      const ll = +l || 0;
      return +(pp + weight * ll).toFixed(2);
    }
    function buildMixViz2(rows) {
      rows = filterRowsForView2(rows || []);
      const flags = getFlags();
      const card = document.getElementById("mixVizCard");
      if (!card) return;
      if (!flags.mixViz) {
        card.style.display = "none";
        return;
      }
      card.style.display = "block";
      const letterW = mixGetLetterWeight(rows);
      const docStyle = getComputedStyle(document.documentElement);
      const brand = docStyle.getPropertyValue("--brand").trim() || "#2b7fff";
      const warnColor = docStyle.getPropertyValue("--warn").trim() || "#FFD27A";
      const goodColor = docStyle.getPropertyValue("--good").trim() || "#7CE38B";
      const text = document.getElementById("mixText");
      const eff = document.getElementById("mixEff");
      const overlay = document.getElementById("weekOverlay");
      const culprits = document.getElementById("mixCulprits");
      const details = document.getElementById("mixCompareDetails");
      const btn = document.getElementById("mixCompareBtn");
      const driftLabel = document.getElementById("mixDriftText");
      const now = DateTime.now().setZone(ZONE);
      const startThis = startOfWeekMonday(now);
      const endThis = now.endOf("day");
      const inRange = (r, from, to) => {
        const d2 = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d2 >= from && d2 <= to;
      };
      const worked = rows.filter((r) => r.status !== "off");
      const baseWeek = getLastNonEmptyWeek2(worked, now, { excludeVacation: true });
      const startLast = baseWeek.start;
      const endLastFull = baseWeek.end;
      const lastEndSame = DateTime.min(endLastFull, baseWeek.start.plus({ days: Math.max(0, now.weekday - 1) }).endOf("day"));
      const W0 = worked.filter((r) => inRange(r, startThis, endThis));
      const W1 = baseWeek.rows.filter((r) => inRange(r, startLast, lastEndSame));
      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const p0 = sum(W0, (r) => +r.parcels || 0), p1 = sum(W1, (r) => +r.parcels || 0);
      const l0 = sum(W0, (r) => +r.letters || 0), l1 = sum(W1, (r) => +r.letters || 0);
      const ln0 = +(letterW * l0).toFixed(1);
      const ln1 = +(letterW * l1).toFixed(1);
      let rm0 = 0;
      let rm1 = 0;
      try {
        if (text) text.textContent = `W1: Parcels ${p0}, Letters ${l0} \u2022 W2: Parcels ${p1}, Letters ${l1}`;
        const wBadge = document.getElementById("mixWeight");
        if (wBadge) {
          wBadge.style.display = "inline-flex";
          wBadge.innerHTML = `<small class="modelMetric">Letter w</small> <span>${(Math.round(letterW * 100) / 100).toFixed(2)}</span>`;
        }
        const vol0 = mixCombinedVolume(p0, l0, letterW);
        const vol1 = mixCombinedVolume(p1, l1, letterW);
        rm0 = sum(W0, (r) => routeAdjustedHours2(r));
        rm1 = sum(W1, (r) => routeAdjustedHours2(r));
        const idx0 = vol0 > 0 && rm0 > 0 ? rm0 / vol0 : null;
        const idx1 = vol1 > 0 && rm1 > 0 ? rm1 / vol1 : null;
        let deltaStr = "\u2014";
        let deltaStyle = "";
        if (idx0 != null && idx1 != null && idx1 > 0) {
          const imp = (idx1 - idx0) / idx1 * 100;
          const s = Math.round(imp);
          const fg = imp >= 0 ? "var(--good)" : "var(--bad)";
          deltaStr = `${s >= 0 ? "\u2191" : "\u2193"} ${Math.abs(s)}%`;
          deltaStyle = `color:${fg}`;
        }
        if (eff) {
          const a = idx0 == null ? "\u2014" : (Math.round(idx0 * 100) / 100).toFixed(2);
          const b = idx1 == null ? "\u2014" : (Math.round(idx1 * 100) / 100).toFixed(2);
          eff.innerHTML = `Efficiency index (min/vol): ${a} vs ${b} <span style="${deltaStyle}">${deltaStr}</span>`;
        }
        try {
          if (culprits) {
            const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const routeByDow = (arr) => {
              const a = Array.from({ length: 7 }, () => 0);
              arr.forEach((r) => {
                const d2 = DateTime.fromISO(r.work_date, { zone: ZONE });
                const idx = (d2.weekday + 6) % 7;
                a[idx] += Math.max(0, (+r.route_minutes || 0) - boxholderAdjMinutes2(r));
              });
              return a.map((n) => +(Math.round(n * 100) / 100).toFixed(2));
            };
            const thisBy = routeByDow(W0);
            const lastBy = routeByDow(W1);
            const out = [];
            thisBy.forEach((val, idx) => {
              const prev = lastBy[idx] || 0;
              if (prev <= 0) return;
              const diff = Math.round((val - prev) / prev * 100);
              if (Math.abs(diff) >= 10) {
                out.push(`${days[idx]}: ${diff >= 0 ? "\u2191" : "\u2193"}${Math.abs(diff)}%`);
              }
            });
            culprits.textContent = out.length ? "Outliers: " + out.join(" \u2022 ") : "Outliers: \u2014";
          }
        } catch (_) {
        }
      } catch (_) {
      }
      const d = (a, b) => b > 0 ? Math.round((a - b) / b * 100) : null;
      const dH = d(sum(W0, (r) => +r.hours || 0), sum(W1, (r) => +r.hours || 0));
      let dP, dLx, lineLabelP = "Parcels", lineLabelL = "Letters";
      let resP = { used: 0 };
      let resL = { used: 0 };
      const baselines = ensureWeeklyBaselines(rows) || getWeeklyBaselines();
      const anchor = computeAnchorBaselines(rows, 8);
      const applyDriftLine = (message) => {
        if (driftLabel) {
          if (message) {
            driftLabel.textContent = message;
            driftLabel.style.display = "block";
          } else {
            driftLabel.textContent = "\u2014";
            driftLabel.style.display = "none";
          }
        }
        if (details) {
          let driftEl = details._driftEl;
          if (!driftEl) {
            driftEl = document.createElement("div");
            driftEl.className = "sparkline-labels mix-drift-line";
            if (details.parentNode) {
              details.parentNode.insertBefore(driftEl, details);
            }
            details._driftEl = driftEl;
          }
          if (message) {
            driftEl.textContent = message;
            driftEl.style.display = "block";
          } else if (driftEl) {
            driftEl.textContent = "\u2014";
            driftEl.style.display = "none";
          }
        }
      };
      const nowDayIdx = (now.weekday + 6) % 7;
      if (flags.baselineCompare) {
        const mins = 5;
        const byW = (arr, fn) => {
          const out = Array.from({ length: 7 }, () => 0);
          arr.forEach((r) => {
            const d2 = DateTime.fromISO(r.work_date, { zone: ZONE });
            const idx = (d2.weekday + 6) % 7;
            out[idx] += fn(r) || 0;
          });
          return out;
        };
        const alignedDelta = (curArr, baseArr, upto, min) => {
          let curSum = 0, baseSum = 0, used = 0;
          for (let i = 0; i <= upto; i++) {
            const base = baseArr ? baseArr[i] : null;
            if (base != null && base >= min) {
              curSum += curArr[i] || 0;
              baseSum += base;
              used++;
            }
          }
          if (!used || baseSum <= 0) return { delta: null, used: 0 };
          let delta = Math.round((curSum - baseSum) / baseSum * 100);
          if (delta > 100) delta = 100;
          if (delta < -100) delta = -100;
          return { delta, used };
        };
        const pThisW = byW(W0, (r) => +r.parcels || 0);
        const lThisW = byW(W0, (r) => +r.letters || 0);
        const bp = baselines ? baselines.parcels : null;
        const bl = baselines ? baselines.letters : null;
        resP = alignedDelta(pThisW, bp, nowDayIdx, mins);
        resL = alignedDelta(lThisW, bl, nowDayIdx, mins);
        dP = resP.delta;
        dLx = resL.delta;
        lineLabelP = "Parcels (vs baseline)";
        lineLabelL = "Letters (vs baseline)";
        const sumRange = (arr, upto) => {
          let s = 0;
          for (let i = 0; i <= upto; i++) {
            s += arr && arr[i] != null ? arr[i] : 0;
          }
          return s;
        };
        const bpSum = bp ? sumRange(bp, nowDayIdx) : null;
        const blSum = bl ? sumRange(bl, nowDayIdx) : null;
        let driftLine = "";
        if (anchor && Array.isArray(anchor.parcels) && Array.isArray(anchor.letters)) {
          const ap = sumRange(anchor.parcels, nowDayIdx);
          const al = sumRange(anchor.letters, nowDayIdx);
          const driftP = ap > 0 && bpSum != null ? Math.round((bpSum - ap) / ap * 100) : null;
          const driftL = al > 0 && blSum != null ? Math.round((blSum - al) / al * 100) : null;
          const fmt = (v) => v == null ? "\u2014" : v >= 0 ? `\u2191 ${v}%` : `\u2193 ${Math.abs(v)}%`;
          driftLine = `Baseline drift vs anchor \u2014 Parcels: ${fmt(driftP)} \u2022 Letters: ${fmt(driftL)}`;
        }
        applyDriftLine(driftLine);
      } else {
        dP = d(p0, p1);
        dLx = d(l0, l1);
        applyDriftLine(null);
      }
      const expectationStroke = "rgba(255,140,0,0.85)";
      const expectationFill = "rgba(255,140,0,0.22)";
      const dEff = p0 + ln0 > 0 && p1 + ln1 > 0 ? Math.round((rm1 / (p1 + ln1) - rm0 / (p0 + ln0)) / (rm1 / (p1 + ln1)) * 100) : null;
      const arrow = (v) => v == null ? "\u2014" : v >= 0 ? "\u2191 " + v + "%" : "\u2193 " + Math.abs(v) + "%";
      const color = (v) => v == null ? "var(--text)" : v >= 0 ? "var(--good)" : "var(--bad)";
      const line = (label, v, ctx, colorOverride) => {
        const labelHtml = colorOverride ? `<span style="color:${colorOverride};font-weight:600">${label}</span>` : label;
        return `<div>${labelHtml}: <span style="color:${color(v)}">${arrow(v)}</span> ${ctx || ""}</div>`;
      };
      if (details) {
        const usedP = resP && resP.used ? `, ${resP.used} day(s) used` : "";
        const usedL = resL && resL.used ? `, ${resL.used} day(s) used` : "";
        details.innerHTML = [
          line("Efficiency", dEff, `(${(rm0 / (p0 + ln0) || 0).toFixed(2)} vs ${(rm1 / (p1 + ln1) || 0).toFixed(2)})`),
          line(lineLabelP, dP, `(${p0} vs ${p1}${usedP})`, warnColor || "#f97316"),
          line(lineLabelL, dLx, `(${l0} vs ${l1}${usedL})`, "#60a5fa"),
          line("Hours", dH, `(${sum(W0, (r) => +r.hours || 0).toFixed(1)}h vs ${sum(W1, (r) => +r.hours || 0).toFixed(1)}h)`)
        ].join("");
        details.style.display = "block";
        if (btn) btn.setAttribute("aria-expanded", "true");
      }
      try {
        if (overlay && window.Chart && overlay.getContext) {
          const ctx = overlay.getContext("2d");
          if (overlay._chart) {
            try {
              overlay._chart.destroy();
            } catch (_) {
            }
          }
          const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
          const warn = warnColor;
          const good = goodColor;
          const volByDow = (arr) => {
            const a = Array.from({ length: 7 }, () => 0);
            arr.forEach((r) => {
              const d2 = DateTime.fromISO(r.work_date, { zone: ZONE });
              const idx = (d2.weekday + 6) % 7;
              a[idx] += mixCombinedVolume(+r.parcels || 0, +r.letters || 0, letterW);
            });
            return a.map((n) => +(Math.round(n * 10) / 10).toFixed(1));
          };
          const routeByDow = (arr) => {
            const a = Array.from({ length: 7 }, () => 0);
            arr.forEach((r) => {
              const d2 = DateTime.fromISO(r.work_date, { zone: ZONE });
              const idx = (d2.weekday + 6) % 7;
              a[idx] += Math.max(0, (+r.route_minutes || 0) - boxholderAdjMinutes2(r));
            });
            return a.map((n) => +(Math.round(n * 100) / 100).toFixed(2));
          };
          const thisBy = volByDow(W0);
          const W1full = baseWeek.rows;
          const lastBy = volByDow(W1full);
          const thisRoute = routeByDow(W0);
          const lastRoute = routeByDow(W1full);
          const dayIdxToday = (now.weekday + 6) % 7;
          const hasBand = !!(typeof bandMinData !== "undefined" && typeof bandMaxData !== "undefined" && bandMinData && bandMaxData);
          const isoForPoint = (datasetIndex, idx) => {
            try {
              if (hasBand) {
                if (datasetIndex === 0 || datasetIndex === 1) return startThis.plus({ days: idx }).toISODate();
                if (datasetIndex === 2) return startLast.plus({ days: idx }).toISODate();
                if (datasetIndex === 3 || datasetIndex === 4) return startThis.plus({ days: idx }).toISODate();
              } else {
                if (datasetIndex === 0) return startLast.plus({ days: idx }).toISODate();
                if (datasetIndex === 1 || datasetIndex === 2) return startThis.plus({ days: idx }).toISODate();
              }
            } catch (_) {
            }
            return null;
          };
          const thisMasked = thisBy.map((v, i) => i <= dayIdxToday ? v : null);
          const thisRouteMasked = thisRoute.map((v, i) => i <= dayIdxToday ? v : null);
          const datasets = [];
          if (hasBand) {
            datasets.push({
              label: "Vol expect min",
              data: bandMinData,
              borderColor: "rgba(255,140,0,0.85)",
              borderWidth: 1,
              borderDash: [6, 4],
              backgroundColor: "transparent",
              pointRadius: 0,
              spanGaps: true,
              fill: false
            });
            datasets.push({
              label: "Vol expect max",
              data: bandMaxData,
              borderColor: "rgba(0,0,0,0)",
              backgroundColor: "rgba(255,140,0,0.22)",
              pointRadius: 0,
              borderWidth: 0,
              spanGaps: true,
              fill: { target: "-1", above: "rgba(255,140,0,0.22)", below: "rgba(255,140,0,0.22)" }
            });
          }
          datasets.push(
            { label: "Vol last", data: lastBy, borderColor: brand, backgroundColor: "transparent", tension: 0.25, pointRadius: 3, pointHoverRadius: 6, pointHitRadius: 14, borderWidth: 2, spanGaps: true, yAxisID: "y" },
            { label: "Vol this", data: thisMasked, borderColor: warn, backgroundColor: "transparent", tension: 0.25, pointRadius: 3, pointHoverRadius: 6, pointHitRadius: 14, borderWidth: 2, spanGaps: true, yAxisID: "y" },
            { label: "Route h (this)", data: thisRouteMasked, borderColor: good, backgroundColor: "transparent", borderDash: [4, 3], tension: 0.25, pointRadius: 2, pointHoverRadius: 5, pointHitRadius: 12, borderWidth: 2, spanGaps: true, yAxisID: "y2" }
          );
          overlay._chart = new Chart(ctx, {
            type: "line",
            data: { labels: days, datasets },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              layout: { padding: { top: 12, right: 16, bottom: 10, left: 16 } },
              interaction: { mode: "nearest", intersect: false },
              plugins: { legend: { display: false }, tooltip: {
                callbacks: {
                  title: (items) => {
                    if (!items || !items.length) return "";
                    const item = items[0];
                    const iso = isoForPoint(item.datasetIndex, item.dataIndex);
                    if (iso) {
                      const dt = DateTime.fromISO(iso, { zone: ZONE });
                      return dt.toFormat("ccc \u2022 MMM d, yyyy") + (vacGlyph2 ? vacGlyph2(iso) : "");
                    }
                    const lbl = item.label || "";
                    return lbl + (vacGlyph2 ? vacGlyph2(lbl) : "");
                  },
                  label: (item) => {
                    const i = item.dataIndex;
                    const lw = lastBy[i];
                    const tw = thisBy[i];
                    const hasTw = i <= dayIdxToday && tw != null;
                    const routeStr = thisRouteMasked[i] != null ? `, Route: ${thisRouteMasked[i]}m` : "";
                    return hasTw ? `This: ${tw}${routeStr}` : `Last: ${lw}`;
                  }
                }
              } },
              scales: {
                x: { display: true, grid: { display: false } },
                y: { display: false },
                y2: { display: false }
              }
            }
          });
        }
      } catch (_) {
      }
      if (btn) {
        btn.onclick = () => {
          try {
            const body = document.querySelector("#mixCompareDetails");
            if (!body) return;
            const expanded = body.style.display !== "block";
            body.style.display = expanded ? "block" : "none";
            btn.setAttribute("aria-expanded", expanded ? "true" : "false");
          } catch (_) {
          }
        };
      }
    }
    function buildOfficeCompare2(rows) {
      rows = filterRowsForView2(rows || []);
      try {
        const card = document.getElementById("officeCompareCard");
        if (!card) return;
        const overlay = document.getElementById("officeOverlay");
        const summary = document.getElementById("officeSummary");
        const now = DateTime.now().setZone(ZONE);
        const startThis = startOfWeekMonday(now);
        const endThis = now.endOf("day");
        const inRange = (r, from, to) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          return d >= from && d <= to;
        };
        const worked = (rows || []).filter((r) => r.status !== "off");
        const baseWeek = getLastNonEmptyWeek2(worked, now, { excludeVacation: true });
        const startLast = baseWeek.start;
        const endLast = baseWeek.end;
        const lastEndSame = DateTime.min(endLast, baseWeek.start.plus({ days: Math.max(0, now.weekday - 1) }).endOf("day"));
        const W0 = worked.filter((r) => inRange(r, startThis, endThis));
        const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
        const offByDow = (arr) => {
          const a = Array.from({ length: 7 }, () => 0);
          arr.forEach((r) => {
            const d = DateTime.fromISO(r.work_date, { zone: ZONE });
            const idx = (d.weekday + 6) % 7;
            a[idx] += +r.office_minutes || 0;
          });
          return a.map((n) => +(Math.round(n * 100) / 100).toFixed(2));
        };
        const thisBy = offByDow(W0);
        const W1 = baseWeek.rows;
        const lastBy = offByDow(W1);
        const dayIdxToday = (now.weekday + 6) % 7;
        const thisMasked = thisBy.map((v, i) => i <= dayIdxToday ? v : null);
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const off0 = sum(W0, (r) => +r.office_minutes || 0);
        const off1same = sum(W1.filter((r) => inRange(r, startLast, lastEndSame)), (r) => +r.office_minutes || 0);
        const dPct = off1same > 0 ? Math.round((off0 - off1same) / off1same * 100) : null;
        if (summary) summary.textContent = `Office (so far): ${off0.toFixed(2)}h vs ${off1same.toFixed(2)}h (${dPct == null ? "\u2014" : dPct >= 0 ? "\u2191 " + dPct + "%" : "\u2193 " + Math.abs(dPct) + "%"})`;
        card.style.display = "block";
        if (overlay && window.Chart && overlay.getContext) {
          const ctx = overlay.getContext("2d");
          if (overlay._chart) {
            try {
              overlay._chart.destroy();
            } catch (_) {
            }
          }
          const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#2b7fff";
          const warn = getComputedStyle(document.documentElement).getPropertyValue("--warn").trim() || "#FFD27A";
          const isoForPoint = (datasetIndex, idx) => {
            try {
              if (datasetIndex === 0) return startLast.plus({ days: idx }).toISODate();
              if (datasetIndex === 1) return startThis.plus({ days: idx }).toISODate();
            } catch (_) {
            }
            return null;
          };
          overlay._chart = new Chart(ctx, {
            type: "line",
            data: { labels: days, datasets: [
              { label: "Last week", data: lastBy, borderColor: brand, backgroundColor: "transparent", tension: 0.25, pointRadius: 3, pointHoverRadius: 6, pointHitRadius: 14, borderWidth: 2, spanGaps: true },
              { label: "This week", data: thisMasked, borderColor: warn, backgroundColor: "transparent", tension: 0.25, pointRadius: 3, pointHoverRadius: 6, pointHitRadius: 14, borderWidth: 2, spanGaps: true }
            ] },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              layout: { padding: { top: 12, right: 16, bottom: 10, left: 16 } },
              interaction: { mode: "nearest", intersect: false },
              plugins: { legend: { display: false }, tooltip: {
                callbacks: {
                  title: (items) => {
                    if (!items || !items.length) return "";
                    const item = items[0];
                    const iso = isoForPoint(item.datasetIndex, item.dataIndex);
                    if (iso) {
                      const dt = DateTime.fromISO(iso, { zone: ZONE });
                      return dt.toFormat("ccc \u2022 MMM d, yyyy") + (vacGlyph2 ? vacGlyph2(iso) : "");
                    }
                    const lbl = item.label || "";
                    return lbl + (vacGlyph2 ? vacGlyph2(lbl) : "");
                  },
                  label: (item) => {
                    const i = item.dataIndex;
                    const lw = lastBy[i];
                    const tw = thisBy[i];
                    const hasTw = i <= dayIdxToday && tw != null;
                    return hasTw ? `This: ${tw}h (Last: ${lw}h)` : `Last: ${lw}h`;
                  }
                }
              } },
              scales: { x: { display: true, grid: { display: false } }, y: { display: false } }
            }
          });
        }
      } catch (_) {
      }
    }
    function buildQuickFilter2(rows) {
      rows = filterRowsForView2(rows || []);
      const flags = getFlags();
      const card = document.getElementById("quickFilterCard");
      if (!card) return;
      card.style.display = flags.quickFilter ? "block" : "none";
      if (!flags.quickFilter) return;
      const sel = document.getElementById("qfSelect");
      const stats = document.getElementById("qfStats");
      const spark = document.getElementById("qfSpark");
      const text = document.getElementById("qfText");
      const cbAll = document.getElementById("qfAllMetrics");
      const cbP = document.getElementById("qfShowParcels");
      const cbL = document.getElementById("qfShowLetters");
      const cbH = document.getElementById("qfShowHours");
      const selN = document.getElementById("qfLastN");
      const cbRuler = document.getElementById("qfShowRuler");
      const normBadge = document.getElementById("qfNormBadge");
      if (!stats || !spark || !text) return;
      const dayVal = sel && sel.value || "all";
      const worked = (rows || []).filter((r) => r.status !== "off");
      const filtered = worked.filter((r) => dayVal === "all" ? true : DateTime.fromISO(r.work_date, { zone: ZONE }).weekday % 7 == +dayVal);
      const count = filtered.length;
      const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
      const avg = (arr, fn) => arr.length ? sum(arr, fn) / arr.length : null;
      const avgH = avg(filtered, (r) => +r.hours || 0);
      const avgP = avg(filtered, (r) => +r.parcels || 0);
      const avgL = avg(filtered, (r) => +r.letters || 0);
      const avgR = avg(filtered, (r) => +r.route_minutes || 0);
      const pill = (label, val, fmt) => `<span class="pill"><small>${label}:</small> <b>${fmt(val)}</b></span>`;
      const nf = (v) => v == null ? "\u2014" : typeof v === "number" ? (Math.round(v * 100) / 100).toString() : String(v);
      stats.innerHTML = [
        pill("Days", count, nf),
        pill("Avg hours", avgH, (v) => v == null ? "\u2014" : (Math.round(v * 100) / 100).toFixed(2)),
        pill("Avg parcels", avgP, (v) => v == null ? "\u2014" : Math.round(v)),
        pill("Avg letters", avgL, (v) => v == null ? "\u2014" : Math.round(v)),
        pill("Avg route min", avgR, (v) => v == null ? "\u2014" : Math.round(v))
      ].join("");
      const available = filtered.length;
      const lastCount = selN && +selN.value || +(localStorage.getItem("routeStats.qf.lastN") || 12) || 12;
      if (selN) selN.value = String(lastCount);
      if (selN && selN.options) {
        try {
          Array.from(selN.options).forEach((o) => {
            o.disabled = +o.value > available;
          });
        } catch (_) {
        }
      }
      const lastN = filtered.slice().sort((a, b) => a.work_date < b.work_date ? -1 : 1).slice(-lastCount);
      const labels = lastN.map((r) => DateTime.fromISO(r.work_date, { zone: ZONE }).toFormat("LLL d"));
      try {
        if (cbRuler && typeof buildQuickFilter2._rulerInit === "undefined") {
          const pref = localStorage.getItem("routeStats.qf.ruler");
          if (pref != null) cbRuler.checked = pref === "1";
          buildQuickFilter2._rulerInit = true;
        }
      } catch (_) {
      }
      const availableMetrics = filtered.reduce((map, r) => {
        const iso = r.work_date;
        map.set(iso, {
          parcels: +r.parcels || 0,
          letters: +r.letters || 0,
          hours: +r.hours || 0
        });
        return map;
      }, /* @__PURE__ */ new Map());
      const serP = lastN.map((r) => {
        var _a5, _b;
        return (_b = (_a5 = availableMetrics.get(r.work_date)) == null ? void 0 : _a5.parcels) != null ? _b : null;
      });
      const serL = lastN.map((r) => {
        var _a5, _b;
        return (_b = (_a5 = availableMetrics.get(r.work_date)) == null ? void 0 : _a5.letters) != null ? _b : null;
      });
      const serH = lastN.map((r) => {
        var _a5, _b;
        return (_b = (_a5 = availableMetrics.get(r.work_date)) == null ? void 0 : _a5.hours) != null ? _b : null;
      });
      const showP = !!(cbP ? cbP.checked : true);
      const showL = !!(cbL ? cbL.checked : true);
      const showH = !!(cbH ? cbH.checked : true);
      const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#2b7fff";
      const warn = getComputedStyle(document.documentElement).getPropertyValue("--warn").trim() || "#FFD27A";
      const good = getComputedStyle(document.documentElement).getPropertyValue("--good").trim() || "#2E7D32";
      const datasets = [];
      const needNormalize = [showP, showL, showH].filter(Boolean).length > 1;
      const norm = (arr) => {
        const vals = arr || [];
        let min = Infinity, max = -Infinity;
        for (const v of vals) {
          if (v == null) continue;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (!isFinite(min) || !isFinite(max)) return vals.map((_) => null);
        if (max === min) return vals.map((_) => 50);
        return vals.map((v) => v == null ? null : Math.round((v - min) / (max - min) * 100));
      };
      const dataP = needNormalize ? norm(serP) : serP;
      const dataL = needNormalize ? norm(serL) : serL;
      const dataH = needNormalize ? norm(serH) : serH;
      if (showP) datasets.push({ label: "Parcels", data: dataP, borderColor: brand, backgroundColor: "transparent", tension: 0.25, pointRadius: 2, borderWidth: 2, spanGaps: true });
      if (showL) datasets.push({ label: "Letters", data: dataL, borderColor: warn, backgroundColor: "transparent", tension: 0.25, pointRadius: 2, borderWidth: 2, spanGaps: true });
      if (showH) datasets.push({ label: "Hours", data: dataH, borderColor: good, backgroundColor: "transparent", tension: 0.25, pointRadius: 2, borderWidth: 2, spanGaps: true });
      const summary = [];
      const fmtNum = (n) => (Math.round(n * 10) / 10).toFixed(1);
      if (showP) summary.push(`P: ${serP.slice(-labels.length).map(fmtNum).join(", ")}`);
      if (showL) summary.push(`L: ${serL.slice(-labels.length).map(fmtNum).join(", ")}`);
      if (showH) summary.push(`H: ${serH.slice(-labels.length).map(fmtNum).join(", ")}`);
      const showing = labels.length;
      const note = needNormalize ? " (normalized)" : "";
      if (normBadge) normBadge.style.display = needNormalize ? "inline-flex" : "none";
      const coverage = `Showing ${showing} of ${lastCount} requested${available ? `, available ${available}` : ""}`;
      text.textContent = datasets.length ? `${summary.join(" \u2022 ")} \u2014 ${coverage}${note}` : "\u2014";
      const daysBadge = document.getElementById("qfDaysBadge");
      if (daysBadge) {
        daysBadge.style.display = "inline-flex";
        daysBadge.innerHTML = `<small>Days</small> <b>${count}</b>`;
      }
      if (window.Chart && spark.getContext) {
        try {
          const ctx = spark.getContext("2d");
          if (spark._chart) {
            try {
              spark._chart.destroy();
            } catch (_) {
            }
          }
          try {
            spark.height = 64;
          } catch (_) {
          }
          const wantRuler = (cbRuler ? !!cbRuler.checked : false) && needNormalize;
          spark._chart = new Chart(ctx, {
            type: "line",
            data: { labels, datasets: datasets.map((d) => Object.assign({ tension: 0.25, pointRadius: 2, borderWidth: 2, spanGaps: true, fill: false }, d)) },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              layout: { padding: { top: 8, right: 6, bottom: 6, left: 6 } },
              interaction: { mode: "nearest", intersect: false },
              plugins: { legend: { display: false }, tooltip: { enabled: true } },
              scales: {
                x: { display: false, grid: { display: false } },
                y: {
                  display: wantRuler,
                  min: needNormalize ? 0 : void 0,
                  max: needNormalize ? 100 : void 0,
                  ticks: { display: false, stepSize: 50 },
                  grid: { display: wantRuler, color: "rgba(255,255,255,0.08)" }
                }
              }
            }
          });
        } catch (_) {
        }
      }
      const handler = () => buildQuickFilter2(rows);
      sel == null ? void 0 : sel.removeEventListener("change", buildQuickFilter2._handlerSel || (() => {
      }));
      cbP == null ? void 0 : cbP.removeEventListener("change", buildQuickFilter2._handlerP || (() => {
      }));
      cbL == null ? void 0 : cbL.removeEventListener("change", buildQuickFilter2._handlerL || (() => {
      }));
      cbH == null ? void 0 : cbH.removeEventListener("change", buildQuickFilter2._handlerH || (() => {
      }));
      selN == null ? void 0 : selN.removeEventListener("change", buildQuickFilter2._handlerN || (() => {
      }));
      cbAll == null ? void 0 : cbAll.removeEventListener("change", buildQuickFilter2._handlerAll || (() => {
      }));
      cbRuler == null ? void 0 : cbRuler.removeEventListener("change", buildQuickFilter2._handlerRuler || (() => {
      }));
      buildQuickFilter2._handlerSel = (e) => {
        try {
          const flagsLocal = getFlags();
          if (flagsLocal && flagsLocal.collapsedUi) {
            const body = document.querySelector("#quickFilterCard > .__collapseBody");
            if (body && body.style.display === "none") {
              try {
                (window.__collapse_set || (() => {
                }))("quickFilterCard", false);
              } catch (_) {
              }
            }
          }
        } catch (_) {
        }
        handler();
      };
      buildQuickFilter2._handlerP = handler;
      buildQuickFilter2._handlerL = handler;
      buildQuickFilter2._handlerH = handler;
      buildQuickFilter2._handlerN = (e) => {
        try {
          localStorage.setItem("routeStats.qf.lastN", String(e.target.value));
        } catch (_) {
        }
        handler();
      };
      buildQuickFilter2._handlerAll = () => {
        const on = !!(cbAll == null ? void 0 : cbAll.checked);
        if (cbP) cbP.checked = on;
        if (cbL) cbL.checked = on;
        if (cbH) cbH.checked = on;
        handler();
      };
      buildQuickFilter2._handlerRuler = (e) => {
        try {
          localStorage.setItem("routeStats.qf.ruler", e.target.checked ? "1" : "0");
        } catch (_) {
        }
        handler();
      };
      sel == null ? void 0 : sel.addEventListener("change", buildQuickFilter2._handlerSel);
      cbP == null ? void 0 : cbP.addEventListener("change", handler);
      cbL == null ? void 0 : cbL.addEventListener("change", handler);
      cbH == null ? void 0 : cbH.addEventListener("change", handler);
      selN == null ? void 0 : selN.addEventListener("change", buildQuickFilter2._handlerN);
      cbAll == null ? void 0 : cbAll.addEventListener("change", buildQuickFilter2._handlerAll);
      cbRuler == null ? void 0 : cbRuler.addEventListener("change", buildQuickFilter2._handlerRuler);
    }
    return {
      buildCharts: buildCharts2,
      buildMonthlyGlance: buildMonthlyGlance2,
      buildMixViz: buildMixViz2,
      buildOfficeCompare: buildOfficeCompare2,
      buildQuickFilter: buildQuickFilter2
    };
  }

  // src/features/summaries.js
  function createSummariesFeature({
    getFlags,
    filterRowsForView: filterRowsForView2,
    routeAdjustedHours: routeAdjustedHours2,
    computeLetterWeight: computeLetterWeight2,
    getCurrentLetterWeight,
    colorForDelta: colorForDelta2
  }) {
    if (typeof getFlags !== "function") throw new Error("createSummariesFeature: getFlags is required");
    if (typeof filterRowsForView2 !== "function") throw new Error("createSummariesFeature: filterRowsForView is required");
    if (typeof routeAdjustedHours2 !== "function") throw new Error("createSummariesFeature: routeAdjustedHours is required");
    if (typeof computeLetterWeight2 !== "function") throw new Error("createSummariesFeature: computeLetterWeight is required");
    if (typeof getCurrentLetterWeight !== "function") throw new Error("createSummariesFeature: getCurrentLetterWeight is required");
    if (typeof colorForDelta2 !== "function") throw new Error("createSummariesFeature: colorForDelta is required");
    function getLetterWeightForSummary2(rows) {
      try {
        const scoped = filterRowsForView2(rows || []).filter((r) => r && r.status !== "off" && (+r.parcels || 0) + (+r.letters || 0) > 0).sort((a, b) => a.work_date < b.work_date ? -1 : 1);
        const sample = scoped.slice(-60);
        const learned = computeLetterWeight2(sample);
        if (learned != null) return learned;
      } catch (_err) {
      }
      return getCurrentLetterWeight();
    }
    function buildSmartSummary2(rows) {
      const el = document.getElementById("smartSummary");
      if (!el) return;
      try {
        const flags = getFlags();
        if (!(flags == null ? void 0 : flags.smartSummary)) {
          el.style.display = "none";
          return;
        }
        const scoped = filterRowsForView2(rows || []);
        const now = DateTime.now().setZone(ZONE);
        const startThis = startOfWeekMonday(now);
        const endThis = now.endOf("day");
        const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
        const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf("day");
        const inRange = (r, from, to) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          return d >= from && d <= to;
        };
        const worked = scoped.filter((r) => r.status !== "off");
        const W0 = worked.filter((r) => inRange(r, startThis, endThis));
        const W1 = worked.filter((r) => inRange(r, startLast, lastEndSame));
        const daysThisWeek = [...new Set(W0.map((r) => r.work_date))].length;
        if (!daysThisWeek) {
          el.textContent = "No worked days yet \u2014 0 day(s) this week.";
          el.style.display = "block";
          return;
        }
        const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
        const h0 = sum(W0, (r) => +r.hours || 0);
        const h1 = sum(W1, (r) => +r.hours || 0);
        const p0 = sum(W0, (r) => +r.parcels || 0);
        const p1 = sum(W1, (r) => +r.parcels || 0);
        const l0 = sum(W0, (r) => +r.letters || 0);
        const l1 = sum(W1, (r) => +r.letters || 0);
        const letterW = getLetterWeightForSummary2(scoped);
        const volume = (p, l) => p + letterW * l;
        const v0 = volume(p0, l0);
        const v1 = volume(p1, l1);
        const rm0 = sum(W0, (r) => routeAdjustedHours2(r));
        const rm1 = sum(W1, (r) => routeAdjustedHours2(r));
        const idx = (hours, vol) => hours > 0 && vol > 0 ? hours / vol : null;
        const i0 = idx(rm0, v0);
        const i1 = idx(rm1, v1);
        const pct = (a, b) => b > 0 ? Math.round((a - b) / b * 100) : null;
        const dh = pct(h0, h1);
        const dv = pct(v0, v1);
        const di = i0 != null && i1 != null && i1 > 0 ? Math.round((i1 - i0) / i1 * 100) : null;
        const movers = [];
        if (dh != null && Math.abs(dh) >= 5) movers.push({ k: "Hours", v: dh });
        if (dv != null && Math.abs(dv) >= 5) movers.push({ k: "Volume", v: dv });
        if (di != null && Math.abs(di) >= 5) movers.push({ k: "Efficiency", v: di });
        movers.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
        const top = movers.slice(0, 2).map((it) => `${it.k} ${it.v >= 0 ? `\u2191 ${it.v}%` : `\u2193 ${Math.abs(it.v)}%`}`);
        const line = top.length ? top.join(" \u2022 ") : "Similar to last week";
        el.textContent = `${line} \u2014 ${daysThisWeek} day(s) this week.`;
        el.style.display = "block";
      } catch (_err) {
      }
    }
    function buildTrendingFactors2(rows) {
      const el = document.getElementById("trendFactors");
      if (!el) return;
      try {
        const scoped = filterRowsForView2(rows || []);
        const now = DateTime.now().setZone(ZONE);
        const startThis = startOfWeekMonday(now);
        const endThis = now.endOf("day");
        const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
        const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf("day");
        const inRange = (r, from, to) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          return d >= from && d <= to;
        };
        const worked = scoped.filter((r) => r.status !== "off");
        const thisWeek = worked.filter((r) => inRange(r, startThis, endThis));
        const lastWeek = worked.filter((r) => inRange(r, startLast, lastEndSame));
        if (!thisWeek.length) {
          el.style.display = "none";
          el.innerHTML = "";
          return;
        }
        const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
        const office0 = sum(thisWeek, (r) => +r.office_minutes || 0);
        const office1 = sum(lastWeek, (r) => +r.office_minutes || 0);
        const route0 = sum(thisWeek, (r) => routeAdjustedHours2(r));
        const route1 = sum(lastWeek, (r) => routeAdjustedHours2(r));
        const vol = (arr) => sum(arr, (r) => (+r.parcels || 0) + 0.33 * (+r.letters || 0));
        const vol0 = vol(thisWeek);
        const vol1 = vol(lastWeek);
        const pct = (a, b) => b > 0 ? Math.round((a - b) / b * 100) : null;
        const items = [];
        const pushIf = (label, delta) => {
          if (delta != null && Math.abs(delta) >= 5) items.push({ label, delta });
        };
        pushIf("Office", pct(office0, office1));
        pushIf("Route", pct(route0, route1));
        pushIf("Volume", pct(vol0, vol1));
        items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
        const top = items.slice(0, 2);
        if (!top.length) {
          el.style.display = "none";
          el.innerHTML = "";
          return;
        }
        const pills = top.map((it) => {
          const { fg } = colorForDelta2(it.delta || 0);
          const direction = it.delta >= 0 ? `\u2191 ${it.delta}%` : `\u2193 ${Math.abs(it.delta)}%`;
          return `<span class="pill"><small>${it.label}</small> <b style="color:${fg}">${direction}</b></span>`;
        }).join(" ");
        el.style.display = "block";
        el.innerHTML = `<small>Weekly Movers</small><div class="pill-row">${pills}</div>`;
      } catch (_err) {
      }
    }
    function buildHeavinessToday2(rows) {
      const el = document.getElementById("todayHeaviness");
      if (!el) return;
      try {
        const scoped = filterRowsForView2(rows || []);
        const now = DateTime.now().setZone(ZONE);
        const dow = now.weekday % 7;
        const worked = scoped.filter((r) => r.status !== "off");
        const todayIso2 = now.toISODate();
        const todayRow = worked.find((r) => r.work_date === todayIso2);
        if (!todayRow) {
          el.style.display = "none";
          return;
        }
        const offTodayH = +todayRow.office_minutes || 0;
        const rteTodayH = routeAdjustedHours2(todayRow);
        const totTodayH = +todayRow.hours || offTodayH + rteTodayH;
        const sameDow = worked.filter((r) => r.work_date !== todayIso2 && dowIndex(r.work_date) === dow);
        const avg = (arr, fn) => {
          const values = arr.map(fn).filter((val) => val > 0);
          return values.length ? values.reduce((sum, val) => sum + val, 0) / values.length : null;
        };
        const offAvgH = avg(sameDow, (r) => +r.office_minutes || 0);
        const rteAvgH = avg(sameDow, (r) => routeAdjustedHours2(r));
        const totAvgH = avg(sameDow, (r) => +r.hours || 0);
        if (offAvgH == null && rteAvgH == null && totAvgH == null) {
          el.style.display = "none";
          return;
        }
        const dOff = offAvgH == null ? null : offTodayH - offAvgH;
        const dRte = rteAvgH == null ? null : rteTodayH - rteAvgH;
        const dTot = totAvgH == null ? null : totTodayH - totAvgH;
        const baseTot = totAvgH && totAvgH > 0 ? totAvgH : (offAvgH || 0) + (rteAvgH || 0) || null;
        const pct = (delta) => delta == null || !baseTot ? null : Math.round(delta / baseTot * 100);
        const pill = (label, delta) => {
          const p = pct(delta);
          const deltaText = delta == null ? "\u2014" : `${delta >= 0 ? "+" : ""}${(Math.round(delta * 10) / 10).toFixed(1)}h`;
          const pctText = p == null ? "" : ` (${p >= 0 ? "+" : ""}${p}%)`;
          const { fg } = colorForDelta2(p || 0);
          return `<span class="pill"><small>${label}</small> <b style="color:${fg}">${deltaText}${pctText}</b></span>`;
        };
        el.style.display = "block";
        const pills = [pill("Office", dOff), pill("Route", dRte), pill("Total", dTot)].join(" ");
        el.innerHTML = `<small>Heaviness (today)</small><div class="pill-row">${pills}</div>`;
      } catch (_err) {
      }
    }
    function buildWeekHeaviness2(rows) {
      const el = document.getElementById("weekHeaviness");
      if (!el) return;
      try {
        const scoped = filterRowsForView2(rows || []);
        const now = DateTime.now().setZone(ZONE);
        const startThis = startOfWeekMonday(now);
        const endThis = now.endOf("day");
        const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
        const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf("day");
        const inRange = (r, from, to) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          return d >= from && d <= to;
        };
        const worked = scoped.filter((r) => r.status !== "off");
        const thisWeek = worked.filter((r) => inRange(r, startThis, endThis));
        const lastWeek = worked.filter((r) => inRange(r, startLast, lastEndSame));
        if (!thisWeek.length || !lastWeek.length) {
          el.style.display = "none";
          return;
        }
        const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
        const off0 = sum(thisWeek, (r) => +r.office_minutes || 0);
        const off1 = sum(lastWeek, (r) => +r.office_minutes || 0);
        const rte0 = sum(thisWeek, (r) => routeAdjustedHours2(r));
        const rte1 = sum(lastWeek, (r) => routeAdjustedHours2(r));
        const tot0 = sum(thisWeek, (r) => +r.hours || 0);
        const tot1 = sum(lastWeek, (r) => +r.hours || 0);
        const dOff = off0 - off1;
        const dRte = rte0 - rte1;
        const dTot = tot0 - tot1;
        const baseTot = tot1 > 0 ? tot1 : null;
        const pct = (delta) => baseTot && delta != null ? Math.round(delta / baseTot * 100) : null;
        const pill = (label, delta) => {
          const p = pct(delta);
          const deltaText = delta == null ? "\u2014" : `${delta >= 0 ? "+" : ""}${(Math.round(delta * 10) / 10).toFixed(1)}h`;
          const pctText = p == null ? "" : ` (${p >= 0 ? "+" : ""}${p}%)`;
          const { fg } = colorForDelta2(p || 0);
          return `<span class="pill"><small>${label}</small> <b style="color:${fg}">${deltaText}${pctText}</b></span>`;
        };
        el.style.display = "block";
        const pills = [pill("Office", dOff), pill("Route", dRte), pill("Total", dTot)].join(" ");
        el.innerHTML = `<small>Heaviness (week)</small><div class="pill-row">${pills}</div>`;
      } catch (_err) {
      }
    }
    function buildHeadlineDigest2(rows) {
      const el = document.getElementById("headlineDigest");
      if (!el) return;
      try {
        const flags = getFlags();
        if (!(flags == null ? void 0 : flags.headlineDigest)) {
          el.style.display = "none";
          return;
        }
        const scoped = filterRowsForView2(rows || []).filter((r) => r && r.status !== "off");
        if (!scoped.length) {
          el.style.display = "none";
          el.textContent = "\u2014";
          return;
        }
        const now = DateTime.now().setZone(ZONE);
        const startThis = startOfWeekMonday(now);
        const endThis = now.endOf("day");
        const startLast = startOfWeekMonday(now.minus({ weeks: 1 }));
        const lastEndSame = startLast.plus({ days: now.weekday - 1 }).endOf("day");
        const inRange = (row, from, to) => {
          const d = DateTime.fromISO(row.work_date, { zone: ZONE });
          return d >= from && d <= to;
        };
        const W0 = scoped.filter((r) => inRange(r, startThis, endThis));
        const W1 = scoped.filter((r) => inRange(r, startLast, lastEndSame));
        if (!W0.length || !W1.length) {
          el.style.display = "none";
          el.textContent = "\u2014";
          return;
        }
        const sum = (arr, fn) => arr.reduce((total, item) => total + (fn(item) || 0), 0);
        const hours0 = sum(W0, (r) => +r.hours || 0);
        const hours1 = sum(W1, (r) => +r.hours || 0);
        const parcels0 = sum(W0, (r) => +r.parcels || 0);
        const parcels1 = sum(W1, (r) => +r.parcels || 0);
        const letters0 = sum(W0, (r) => +r.letters || 0);
        const letters1 = sum(W1, (r) => +r.letters || 0);
        const letterWeight = getLetterWeightForSummary2(scoped);
        const volume = (p, l) => p + letterWeight * l;
        const volume0 = volume(parcels0, letters0);
        const volume1 = volume(parcels1, letters1);
        const route0 = sum(W0, (r) => routeAdjustedHours2(r));
        const route1 = sum(W1, (r) => routeAdjustedHours2(r));
        const efficiency0 = volume0 > 0 && route0 > 0 ? route0 / volume0 : null;
        const efficiency1 = volume1 > 0 && route1 > 0 ? route1 / volume1 : null;
        const pct = (current, baseline) => baseline > 0 ? Math.round((current - baseline) / baseline * 100) : null;
        const format = (label, delta) => {
          if (delta == null) return null;
          const clamped = Math.max(-99, Math.min(99, delta));
          const arrow = clamped >= 0 ? "\u2191" : "\u2193";
          return `${label} ${arrow} ${Math.abs(clamped)}%`;
        };
        const parts = [];
        const hoursDelta = pct(hours0, hours1);
        const volumeDelta = pct(volume0, volume1);
        const efficiencyDelta = efficiency0 != null && efficiency1 != null && efficiency1 > 0 ? Math.round((efficiency0 - efficiency1) / efficiency1 * 100) : null;
        const pushIf = (label, delta) => {
          const text = format(label, delta);
          if (text) parts.push(text);
        };
        pushIf("Hours", hoursDelta);
        pushIf("Volume", volumeDelta);
        pushIf("Efficiency", efficiencyDelta);
        if (!parts.length) {
          el.textContent = "Similar to last week.";
        } else {
          el.textContent = parts.join(" \u2022 ");
        }
        el.style.display = "block";
        el.title = `W1 vs W2 \u2014 Hours: ${hours0.toFixed(1)}h vs ${hours1.toFixed(1)}h \xB7 Volume: ${Math.round(volume0)} vs ${Math.round(volume1)} \xB7 Efficiency: ${efficiency0 != null ? efficiency0.toFixed(2) : "\u2014"} vs ${efficiency1 != null ? efficiency1.toFixed(2) : "\u2014"}`;
      } catch (_err) {
        el.style.display = "none";
      }
    }
    return {
      getLetterWeightForSummary: getLetterWeightForSummary2,
      buildSmartSummary: buildSmartSummary2,
      buildTrendingFactors: buildTrendingFactors2,
      buildHeavinessToday: buildHeavinessToday2,
      buildWeekHeaviness: buildWeekHeaviness2,
      buildHeadlineDigest: buildHeadlineDigest2
    };
  }

  // src/utils/diagnostics.js
  function parseDismissReasonInput(raw) {
    if (!raw) return [];
    let working = String(raw).replace(/[;\n]+/g, ",").replace(/\s*,\s*/g, ",").trim();
    if (!working) return [];
    const aggregated = /* @__PURE__ */ new Map();
    const upsert = (reasonRaw, minutesVal, hasMinutes = false) => {
      if (reasonRaw == null) return;
      const reason = String(reasonRaw).replace(/\s+/g, " ").trim();
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
      return " ";
    });
    working = working.replace(/([^,+:]+?)\s*:\s*([^,+\s]+)/g, (_, keyPart, valuePart) => {
      const key = keyPart.trim();
      const value = valuePart.trim();
      const label = value ? `${key}:${value}` : key;
      upsert(label, 0, false);
      return " ";
    });
    working.split(",").map((segment) => segment.trim()).filter(Boolean).forEach((segment) => {
      const cleaned = segment.replace(/\s+/g, " ").trim();
      if (!cleaned) return;
      if (/^[+\-]?\d+(?:\.\d+)?$/.test(cleaned)) return;
      upsert(cleaned, 0, false);
    });
    return Array.from(aggregated.values()).map((item) => ({
      reason: item.reason,
      minutes: item.hasMinutes ? item.minutes : null
    }));
  }

  // src/app.js
  (function() {
    function ready(fn) {
      if (document.readyState !== "loading") fn();
      else document.addEventListener("DOMContentLoaded", fn);
    }
    ready(function() {
      var missingCore = [];
      if (!window.luxon) missingCore.push("Luxon");
      if (!window.supabase) missingCore.push("Supabase");
      if (missingCore.length) {
        var div = document.createElement("div");
        div.style.cssText = "position:fixed;left:0;right:0;bottom:0;background:#c62828;color:#fff;padding:10px 14px;z-index:99999;font:14px/1.4 system-ui";
        div.textContent = "Missing libraries: " + missingCore.join(", ") + '. Run "Fetch Vendor Libraries.command" to download local copies, then reload.';
        document.body.appendChild(div);
      }
      if (!window.Chart) {
        console.warn("Chart.js missing \u2014 charts disabled. Everything else should work.");
      }
    });
  })();
  (function() {
    window.addEventListener("error", function(e) {
      try {
        var div = document.createElement("div");
        div.style.cssText = "position:fixed;left:0;right:0;top:0;background:#b00020;color:#fff;padding:10px 14px;z-index:100000;font:13px/1.4 system-ui";
        var loc = "";
        if (e && (e.filename || e.lineno)) {
          loc = " (" + (e.filename || "inline") + ":" + (e.lineno || "?") + ":" + (e.colno || "?") + ")";
        }
        div.textContent = "JavaScript error: " + (e && e.message ? e.message : "unknown") + loc;
        document.body.appendChild(div);
        console.error("[RouteStats] error", e);
      } catch (_) {
      }
    }, true);
  })();
  console.log("[RouteStats] boot start");
  var USPS_EVAL = loadEval();
  var VACATION = loadVacation();
  if (VACATION && Array.isArray(VACATION.ranges)) {
    const normalized = normalizeRanges(VACATION.ranges);
    if (normalized.length !== VACATION.ranges.length || normalized.some((r, i) => {
      var _a5, _b;
      return r.from !== ((_a5 = VACATION.ranges[i]) == null ? void 0 : _a5.from) || r.to !== ((_b = VACATION.ranges[i]) == null ? void 0 : _b.to);
    })) {
      VACATION = { ranges: normalized };
      saveVacation(VACATION);
    }
  }
  var DEFAULT_AI_BASE_PROMPT = "You are an upbeat, encouraging USPS route analyst. Be concise but creative, celebrate wins, suggest actionable next steps, and call out emerging or fading trends as new tags appear.";
  function addVacationRange(fromIso, toIso) {
    if (!fromIso || !toIso) return;
    const next = { ranges: [...(VACATION == null ? void 0 : VACATION.ranges) || [], { from: fromIso, to: toIso }] };
    next.ranges = normalizeRanges(next.ranges);
    VACATION = next;
    saveVacation(VACATION);
  }
  function removeVacationRange(index) {
    const ranges = Array.isArray(VACATION == null ? void 0 : VACATION.ranges) ? [...VACATION.ranges] : [];
    if (index < 0 || index >= ranges.length) return;
    ranges.splice(index, 1);
    VACATION = { ranges: normalizeRanges(ranges) };
    saveVacation(VACATION);
  }
  function listVacationRanges() {
    const cfg = VACATION || loadVacation();
    return Array.isArray(cfg == null ? void 0 : cfg.ranges) ? cfg.ranges : [];
  }
  function renderVacationRanges() {
    const container = document.getElementById("vacRanges");
    if (!container) return;
    const ranges = listVacationRanges();
    if (!ranges.length) {
      container.innerHTML = '<small class="muted">No vacation ranges saved.</small>';
      return;
    }
    const rows = ranges.map((r, idx) => {
      try {
        const from = DateTime.fromISO(r.from, { zone: ZONE });
        const to = DateTime.fromISO(r.to, { zone: ZONE });
        const days = Math.max(1, Math.round(to.endOf("day").diff(from.startOf("day"), "days").days + 1));
        const label = `${from.toFormat("LLL dd, yyyy")} \u2192 ${to.toFormat("LLL dd, yyyy")}`;
        return `<div class="vac-range-item"><div><strong>${label}</strong><br><small>${days} day${days === 1 ? "" : "s"}</small></div><button class="ghost vac-remove" type="button" data-index="${idx}">Remove</button></div>`;
      } catch (_) {
        return `<div class="vac-range-item"><div><strong>${r.from} \u2192 ${r.to}</strong></div><button class="ghost vac-remove" type="button" data-index="${idx}">Remove</button></div>`;
      }
    }).join("");
    container.innerHTML = rows;
  }
  function isVacationDate(iso) {
    try {
      const cfg = VACATION || loadVacation();
      if (!cfg || !Array.isArray(cfg.ranges)) return false;
      return cfg.ranges.some((r) => dateInRangeISO(iso, r.from, r.to));
    } catch (_) {
      return false;
    }
  }
  function filterRowsForView(rows) {
    try {
      const cfg = VACATION || loadVacation();
      if (!cfg || !Array.isArray(cfg.ranges) || !cfg.ranges.length) return rows || [];
      return (rows || []).filter((r) => !isVacationDate(r.work_date));
    } catch (_) {
      return rows || [];
    }
  }
  var FLAGS = loadFlags();
  var $ = (id) => document.getElementById(id);
  var dConn = $("dConn");
  var dAuth = $("dAuth");
  var dWrite = $("dWrite");
  function updateModelScopeBadge() {
    const el = document.getElementById("modelScopeBadge");
    if (!el) return;
    const scope = getModelScope();
    const isRolling = scope !== "all";
    el.classList.toggle("all", !isRolling);
    el.innerHTML = `<span class="dot" aria-hidden="true"></span>${isRolling ? "Rolling \xB7 120d" : "All-time"}`;
  }
  function rowsForModelScope(allRows2) {
    const rows = Array.isArray(allRows2) ? allRows2 : [];
    const scope = getModelScope();
    if (scope !== "rolling") return rows;
    const cutoff = DateTime.now().setZone(ZONE).minus({ days: 120 }).startOf("day");
    return rows.filter((r) => {
      try {
        if (!r || !r.work_date) return false;
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= cutoff;
      } catch (_) {
        return false;
      }
    });
  }
  (function initModelScopeUI() {
    const el = document.getElementById("modelScope");
    if (!el) return;
    el.value = getModelScope();
    el.addEventListener("change", () => {
      setModelScope(el.value);
      updateModelScopeBadge();
      rebuildAll();
    });
  })();
  (function() {
    const d = DateTime.now().setZone(ZONE);
    const el = document.getElementById("headerDate");
    if (el) el.textContent = d.toFormat("MMM d, yyyy");
    const ver = document.getElementById("verTag");
    if (ver) ver.textContent = "v" + d.toFormat("yyyy-MM-dd");
    updateModelScopeBadge();
  })();
  function renderUspsEvalTag() {
    try {
      const tag = document.getElementById("uspsEvalTag");
      if (!tag) return;
      if (!FLAGS.uspsEval) {
        tag.style.display = "none";
        return;
      }
      const cfg = USPS_EVAL || loadEval();
      $("evalRouteLabel").textContent = cfg.routeId || "\u2014";
      $("evalEvalCode").textContent = cfg.evalCode || "\u2014";
      $("evalBoxes").textContent = (cfg.boxes != null ? cfg.boxes : "\u2014") + " boxes";
      $("evalSalary").textContent = (cfg.annualSalary != null ? "$" + Number(cfg.annualSalary).toLocaleString() : "\u2014") + "/yr";
      const hp = cfg.hoursPerDay != null ? cfg.hoursPerDay : "\u2014";
      const oh = cfg.officeHoursPerDay != null ? cfg.officeHoursPerDay : "\u2014";
      $("evalHours").textContent = `${hp}h (${oh} office)`;
      tag.style.display = "block";
      tag.onclick = () => {
        var _a5;
        return (_a5 = document.getElementById("btnSettings")) == null ? void 0 : _a5.click();
      };
    } catch (_) {
    }
  }
  renderUspsEvalTag();
  renderVacationRanges();
  function getLastNonEmptyWeek(rows, now, { excludeVacation = true } = {}) {
    const worked = (rows || []).filter((r) => (+r.hours || 0) > 0);
    const weeksToScan = 12;
    const inRange = (r, from, to) => {
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      return d >= from && d <= to;
    };
    for (let w = 1; w <= weeksToScan; w++) {
      const start2 = startOfWeekMonday(now.minus({ weeks: w }));
      const end2 = endOfWeekSunday(now.minus({ weeks: w }));
      const bucket = worked.filter((r) => inRange(r, start2, end2) && (!excludeVacation || !isVacationDate(r.work_date)));
      if (bucket.length) return { start: start2, end: end2, rows: bucket };
    }
    const fallbackStart = startOfWeekMonday(now.minus({ weeks: 1 }));
    const fallbackEnd = endOfWeekSunday(now.minus({ weeks: 1 }));
    return {
      start: fallbackStart,
      end: fallbackEnd,
      rows: worked.filter((r) => inRange(r, fallbackStart, fallbackEnd))
    };
  }
  function vacMark(iso) {
    return iso && isVacationDate(iso) ? '<sup class="vac-mark" title="Vacation day">v</sup>' : "";
  }
  function vacGlyph(iso) {
    return iso && isVacationDate(iso) ? " (v)" : "";
  }
  function isHolidayMarked(row) {
    if (!row) return false;
    const text = String(row.weather_json || "");
    return /\bHoliday\b/i.test(text);
  }
  function ensurePostHolidayTags(rows) {
    if (!Array.isArray(rows)) return rows;
    try {
      const holidayOff = new Set(
        rows.filter((r) => r && r.status === "off" && isHolidayMarked(r)).map((r) => r.work_date).filter(Boolean)
      );
      const sorted = [...rows].filter((r) => r && r.work_date).sort((a, b) => a.work_date.localeCompare(b.work_date));
      const history = Array.from({ length: 7 }, () => ({ count: 0, parcels: 0, letters: 0, routeMinutes: 0 }));
      sorted.forEach((r) => {
        try {
          if (!r || r.status === "off") return;
          const dt = DateTime.fromISO(r.work_date, { zone: ZONE });
          if (!dt.isValid) return;
          const dow = dt.weekday % 7;
          const hist = history[dow];
          const baselineParcels = hist.count ? hist.parcels / hist.count : null;
          const baselineLetters = hist.count ? hist.letters / hist.count : null;
          const baselineRoute = hist.count ? hist.routeMinutes / hist.count : null;
          const parcels2 = +r.parcels || 0;
          const letters2 = +r.letters || 0;
          const routeMinutes = routeAdjustedMinutes(r);
          const prevIso = dt.minus({ days: 1 }).toISODate();
          const followsHoliday = prevIso && holidayOff.has(prevIso);
          let flagged = false;
          let context = null;
          if (followsHoliday) {
            const ratio = (a, b) => b && b > 0 ? a / b : null;
            const ratioParcels = ratio(parcels2, baselineParcels);
            const ratioLetters = ratio(letters2, baselineLetters);
            const ratioRoute = ratio(routeMinutes, baselineRoute);
            const overParcels = ratioParcels != null && ratioParcels >= 1.25;
            const overLetters = ratioLetters != null && ratioLetters >= 1.25;
            const overRoute = ratioRoute != null && ratioRoute >= 1.15;
            flagged = overParcels || overLetters || overRoute;
            if (flagged) {
              context = {
                baselineParcels,
                baselineLetters,
                baselineRouteMinutes: baselineRoute,
                parcels: parcels2,
                letters: letters2,
                routeMinutes,
                ratioParcels,
                ratioLetters,
                ratioRoute,
                prevHoliday: prevIso,
                sampleSize: hist.count
              };
            }
          }
          if (flagged) {
            if (!Array.isArray(r._tags)) r._tags = [];
            if (!r._tags.includes("post_holiday")) r._tags.push("post_holiday");
            if (!r._tags.includes("holiday_catchup")) r._tags.push("holiday_catchup");
            r._holidayCatchup = context;
            r._weightHints = Object.assign({}, r._weightHints, { holidayCatchup: { recommended: 0.65 } });
            const base = String(r.weather_json || "").trim();
            if (!/Reason:\s*Post-Holiday/i.test(base)) {
              r.weather_json = base ? `${base} \xB7 Reason: Post-Holiday` : "Reason: Post-Holiday";
            }
          }
          if (parcels2 > 0 || letters2 > 0 || routeMinutes > 0) {
            hist.count += 1;
            hist.parcels += parcels2;
            hist.letters += letters2;
            hist.routeMinutes += routeMinutes;
          }
        } catch (_) {
        }
      });
    } catch (_) {
    }
    return rows;
  }
  function hasTag(row, tag) {
    return !!(row && Array.isArray(row._tags) && row._tags.includes(tag));
  }
  function summarizeHolidayCatchups(rows) {
    const stats = { count: 0, addedMinutes: 0, avgRouteRatio: null };
    const ratios = [];
    (rows || []).forEach((row) => {
      if (!hasTag(row, "holiday_catchup")) return;
      stats.count++;
      const ctx = (row == null ? void 0 : row._holidayCatchup) || {};
      if (ctx.routeMinutes != null && ctx.baselineRouteMinutes != null) {
        const delta = Math.max(0, ctx.routeMinutes - ctx.baselineRouteMinutes);
        stats.addedMinutes += delta;
      }
      if (ctx.ratioRoute != null && isFinite(ctx.ratioRoute)) ratios.push(ctx.ratioRoute);
    });
    if (ratios.length) {
      const total = ratios.reduce((sum, val) => sum + val, 0);
      stats.avgRouteRatio = total / ratios.length;
    }
    return stats;
  }
  function isHolidayDownweightEnabled() {
    try {
      return localStorage.getItem(RESIDUAL_WEIGHT_PREF_KEY) === "1";
    } catch (_) {
      return false;
    }
  }
  function setHolidayDownweightEnabled(on) {
    try {
      localStorage.setItem(RESIDUAL_WEIGHT_PREF_KEY, on ? "1" : "0");
    } catch (_) {
    }
  }
  function getResidualWeighting() {
    const enabled = isHolidayDownweightEnabled();
    if (!enabled) return { enabled: false, fn: null };
    const fn = (row) => {
      var _a5, _b;
      if (!row) return 1;
      if (!hasTag(row, "holiday_catchup")) return 1;
      const hint = (_b = (_a5 = row._weightHints) == null ? void 0 : _a5.holidayCatchup) == null ? void 0 : _b.recommended;
      if (Number.isFinite(hint) && hint > 0 && hint <= 1) return hint;
      return 0.65;
    };
    return { enabled: true, fn };
  }
  var aiSummary = null;
  function updateAiSummaryAvailability() {
    try {
      aiSummary == null ? void 0 : aiSummary.updateAvailability();
    } catch (_) {
    }
  }
  var diagnosticsFeature = createDiagnostics({
    getFlags: () => FLAGS,
    filterRowsForView,
    rowsForModelScope,
    getResidualWeighting,
    setHolidayDownweightEnabled,
    isHolidayDownweightEnabled,
    loadDismissedResiduals: () => loadDismissedResiduals(parseDismissReasonInput),
    saveDismissedResiduals,
    parseDismissReasonInput,
    rebuildAll,
    updateAiSummaryAvailability,
    inferBoxholderLabel,
    hasTag,
    summarizeHolidayCatchups,
    getCurrentLetterWeight: () => CURRENT_LETTER_WEIGHT,
    setCurrentLetterWeight: (value) => {
      CURRENT_LETTER_WEIGHT = value;
      try {
        localStorage.setItem("routeStats.letterWeight", String(CURRENT_LETTER_WEIGHT));
      } catch (_) {
      }
    },
    combinedVolume,
    routeAdjustedMinutes,
    colorForDelta
  });
  var {
    buildDiagnostics,
    buildDayCompare,
    buildVolumeLeaderboard,
    fitVolumeTimeModel,
    getResidualModel,
    getLatestDiagnosticsContext,
    resetDiagnosticsCache
  } = diagnosticsFeature;
  var chartsFeature = createCharts({
    getFlags: () => FLAGS,
    filterRowsForView,
    vacGlyph,
    routeAdjustedHours,
    boxholderAdjMinutes,
    getLastNonEmptyWeek,
    buildDayCompare
  });
  var {
    buildCharts,
    buildMonthlyGlance,
    buildMixViz,
    buildOfficeCompare,
    buildQuickFilter
  } = chartsFeature;
  var sb = createSupabaseClient();
  var authReadyPromise = handleAuthCallback(sb);
  (async () => {
    const isRecoveryLink = /type=recovery/i.test(window.location.hash);
    if (!isRecoveryLink) return;
    const session = await authReadyPromise;
    if (!session) return;
    try {
      const p1 = prompt("Enter a new password (6+ characters)");
      if (p1 && p1.length >= 6) {
        const { error: uerr } = await sb.auth.updateUser({ password: p1 });
        if (uerr) alert("Update failed: " + uerr.message);
        else alert("Password updated. You can now sign in normally.");
      } else {
        alert("Password must be at least 6 characters.");
      }
    } catch (e) {
      console.warn("Auth callback error", e);
    }
  })();
  (async () => {
    try {
      await fetch(SUPABASE_URL, { mode: "no-cors" });
      dConn.textContent = "Connected";
    } catch (e) {
      dConn.textContent = "Error";
    }
  })();
  (async function ensureSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      await sb.auth.signInAnonymously().catch(() => {
      });
    }
    const { data: { user } } = await sb.auth.getUser();
    dAuth.textContent = user ? "Session" : "No session";
  })();
  var linkBtn = $("linkBtn");
  var linkDlg = $("linkDlg");
  var sendLink = $("sendLink");
  var email = $("email");
  linkBtn.addEventListener("click", () => linkDlg.showModal());
  sendLink.addEventListener("click", async (e) => {
    e.preventDefault();
    const redirectTo = location.origin + location.pathname;
    const { error } = await sb.auth.signInWithOtp({ email: email.value, options: { emailRedirectTo: redirectTo } });
    if (error) alert(error.message);
    else {
      alert("Check your email for the magic link.");
      linkDlg.close();
    }
  });
  $("signOut").addEventListener("click", () => sb.auth.signOut().then(() => location.reload()));
  var signInBtn = $("signInBtn");
  var pwDlg = $("pwDlg");
  var loginEmail = $("loginEmail");
  var loginPass = $("loginPass");
  var doLogin = $("doLogin");
  var doSignup = $("doSignup");
  var authMsg = $("authMsg");
  signInBtn == null ? void 0 : signInBtn.addEventListener("click", () => {
    authMsg.textContent = "";
    loginEmail.value = loginEmail.value || "";
    loginPass.value = "";
    pwDlg.showModal();
  });
  doLogin == null ? void 0 : doLogin.addEventListener("click", async (e) => {
    e.preventDefault();
    authMsg.textContent = "Signing in\u2026";
    const { error } = await sb.auth.signInWithPassword({
      email: (loginEmail.value || "").trim(),
      password: loginPass.value || ""
    });
    if (error) {
      if (/Email not confirmed/i.test(error.message)) authMsg.textContent = "Email not confirmed. Use reset link or check your inbox.";
      else if (/Invalid login credentials/i.test(error.message)) authMsg.textContent = "Invalid email or password. Try Reset or Create Account.";
      else authMsg.textContent = "Error: " + error.message;
      return;
    }
    authMsg.textContent = "Signed in!";
    pwDlg.close();
    const rows = await fetchEntries();
    allRows = rows;
    rebuildAll();
  });
  doSignup == null ? void 0 : doSignup.addEventListener("click", async () => {
    authMsg.textContent = "Creating account\u2026";
    const { error } = await sb.auth.signUp({
      email: (loginEmail.value || "").trim(),
      password: loginPass.value || ""
    });
    authMsg.textContent = error ? "Error: " + error.message : "Account created. If email confirmation is on, check your inbox, then Sign In.";
  });
  var setPwBtn = $("setPwBtn");
  var setPwDlg = $("setPwDlg");
  var newPass = $("newPass");
  var newPass2 = $("newPass2");
  var setPwMsg = $("setPwMsg");
  var doSetPw = $("doSetPw");
  setPwBtn == null ? void 0 : setPwBtn.addEventListener("click", () => {
    setPwMsg.textContent = "";
    newPass.value = "";
    newPass2.value = "";
    setPwDlg.showModal();
  });
  doSetPw == null ? void 0 : doSetPw.addEventListener("click", async (e) => {
    e.preventDefault();
    const p1 = newPass.value || "";
    const p2 = newPass2.value || "";
    if (p1.length < 6) {
      setPwMsg.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (p1 !== p2) {
      setPwMsg.textContent = "Passwords do not match.";
      return;
    }
    setPwMsg.textContent = "Updating\u2026";
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) {
      setPwMsg.textContent = "Error: " + error.message;
      return;
    }
    setPwMsg.textContent = "Password set! You can now sign in anywhere.";
    setTimeout(() => setPwDlg.close(), 600);
  });
  var settingsDlg = document.getElementById("settingsDlg");
  var btnSettings = document.getElementById("btnSettings");
  var modelScopeSelect = document.getElementById("modelScope");
  var flagWeekdayTicks = document.getElementById("flagWeekdayTicks");
  var flagProgressivePills = document.getElementById("flagProgressivePills");
  var flagMonthlyGlance = document.getElementById("flagMonthlyGlance");
  var flagHolidayAdjust = document.getElementById("flagHolidayAdjust");
  var flagTrendPills = document.getElementById("flagTrendPills");
  var flagSameRangeTotals = document.getElementById("flagSameRangeTotals");
  var flagHeadlineDigest = document.getElementById("flagHeadlineDigest");
  var flagMixViz = document.getElementById("flagMixViz");
  var flagBaselineCompare = document.getElementById("flagBaselineCompare");
  var flagCollapsedUi = document.getElementById("flagCollapsedUi");
  var flagQuickEntry = document.getElementById("flagQuickEntry");
  var flagSmartSummary = document.getElementById("flagSmartSummary");
  var flagDayCompare = document.getElementById("flagDayCompare");
  var flagUspsEval = document.getElementById("flagUspsEval");
  var settingsEmaRate = document.getElementById("settingsEmaRate");
  var evalRouteId = document.getElementById("evalRouteId");
  var evalCode = document.getElementById("evalCode");
  var evalBoxesIn = document.getElementById("evalBoxesIn");
  var evalStopsIn = document.getElementById("evalStopsIn");
  var evalHoursIn = document.getElementById("evalHoursIn");
  var evalOfficeHoursIn = document.getElementById("evalOfficeHoursIn");
  var evalSalaryIn = document.getElementById("evalSalaryIn");
  var vacFrom = document.getElementById("vacFrom");
  var vacTo = document.getElementById("vacTo");
  var vacAdd = document.getElementById("vacAdd");
  var vacRangesEl = document.getElementById("vacRanges");
  var saveSettings = document.getElementById("saveSettings");
  var settingsOpenAiKey = document.getElementById("settingsOpenAiKey");
  var clearOpenAiKeyBtn = document.getElementById("clearOpenAiKey");
  var aiSummaryCard = document.getElementById("aiSummaryCard");
  var aiSummaryBtn = document.getElementById("generateAiSummary");
  var toggleAiSummaryBtn = document.getElementById("toggleAiSummary");
  var aiSummaryHint = document.getElementById("aiSummaryHint");
  var aiSummaryStatus = document.getElementById("aiSummaryStatus");
  var aiSummaryOutput = document.getElementById("aiSummaryOutput");
  var aiSummaryContent = document.getElementById("aiSummaryContent");
  var tokenUsageCard = document.getElementById("tokenUsageCard");
  var tokenTodayEl = document.getElementById("token-today");
  var tokenWeekEl = document.getElementById("token-week");
  var tokenMonthEl = document.getElementById("token-month");
  var tokenLimitEl = document.getElementById("token-limit");
  var tokenBarFill = document.getElementById("token-bar-fill");
  var tokenBarNote = document.getElementById("token-bar-note");
  var tokenTodayInput = document.getElementById("tokenUsageToday");
  var tokenWeekInput = document.getElementById("tokenUsageWeek");
  var tokenMonthInput = document.getElementById("tokenUsageMonth");
  var tokenLimitInput = document.getElementById("tokenUsageLimit");
  var aiPromptTextarea = document.getElementById("aiSummaryBasePrompt");
  var CURRENT_USER_ID = null;
  aiSummary = createAiSummary({
    elements: {
      card: aiSummaryCard,
      button: aiSummaryBtn,
      toggleButton: toggleAiSummaryBtn,
      hint: aiSummaryHint,
      status: aiSummaryStatus,
      output: aiSummaryOutput,
      content: aiSummaryContent,
      tokenUsageCard,
      tokenTodayEl,
      tokenWeekEl,
      tokenMonthEl,
      tokenLimitEl,
      tokenBarFill,
      tokenBarNote,
      tokenTodayInput,
      tokenWeekInput,
      tokenMonthInput,
      tokenLimitInput
    },
    supabaseClient: sb,
    getCurrentUserId: () => CURRENT_USER_ID,
    getDiagnosticsContext: getLatestDiagnosticsContext,
    defaultPrompt: DEFAULT_AI_BASE_PROMPT
  });
  btnSettings == null ? void 0 : btnSettings.addEventListener("click", () => {
    flagWeekdayTicks.checked = !!FLAGS.weekdayTicks;
    flagProgressivePills.checked = !!FLAGS.progressivePills;
    if (modelScopeSelect) modelScopeSelect.value = getModelScope();
    if (flagMonthlyGlance) flagMonthlyGlance.checked = !!FLAGS.monthlyGlance;
    if (flagHolidayAdjust) flagHolidayAdjust.checked = !!FLAGS.holidayAdjustments;
    if (flagTrendPills) flagTrendPills.checked = !!FLAGS.trendPills;
    if (flagSameRangeTotals) flagSameRangeTotals.checked = !!FLAGS.sameRangeTotals;
    if (flagHeadlineDigest) flagHeadlineDigest.checked = !!FLAGS.headlineDigest;
    if (flagMixViz) flagMixViz.checked = !!FLAGS.mixViz;
    if (flagBaselineCompare) flagBaselineCompare.checked = !!FLAGS.baselineCompare;
    if (flagCollapsedUi) flagCollapsedUi.checked = !!FLAGS.collapsedUi;
    if (flagQuickEntry) flagQuickEntry.checked = !!FLAGS.quickEntry;
    if (flagSmartSummary) flagSmartSummary.checked = !!FLAGS.smartSummary;
    if (flagDayCompare) flagDayCompare.checked = !!FLAGS.dayCompare;
    if (flagUspsEval) flagUspsEval.checked = !!FLAGS.uspsEval;
    try {
      const cfg = USPS_EVAL || loadEval();
      if (evalRouteId) evalRouteId.value = cfg.routeId || "";
      if (evalCode) evalCode.value = cfg.evalCode || "";
      if (evalBoxesIn) evalBoxesIn.value = cfg.boxes != null ? cfg.boxes : "";
      if (evalStopsIn) evalStopsIn.value = cfg.stops != null ? cfg.stops : "";
      if (evalHoursIn) evalHoursIn.value = cfg.hoursPerDay != null ? cfg.hoursPerDay : "";
      if (evalOfficeHoursIn) evalOfficeHoursIn.value = cfg.officeHoursPerDay != null ? cfg.officeHoursPerDay : "";
      if (evalSalaryIn) evalSalaryIn.value = cfg.annualSalary != null ? cfg.annualSalary : "";
    } catch (_) {
    }
    try {
      const v = VACATION || loadVacation();
      const last = (v.ranges || [])[(v.ranges || []).length - 1];
      if (vacFrom) vacFrom.value = (last == null ? void 0 : last.from) || "";
      if (vacTo) vacTo.value = (last == null ? void 0 : last.to) || "";
    } catch (_) {
    }
    try {
      if (settingsEmaRate) {
        const stored = localStorage.getItem(SECOND_TRIP_EMA_KEY);
        settingsEmaRate.value = stored != null ? stored : (secondTripEmaInput == null ? void 0 : secondTripEmaInput.value) || "";
      }
    } catch (_) {
    }
    if (settingsOpenAiKey) {
      settingsOpenAiKey.value = getOpenAiKey() || "";
    }
    if (aiPromptTextarea) {
      aiPromptTextarea.value = getAiBasePrompt(DEFAULT_AI_BASE_PROMPT);
      aiPromptTextarea.placeholder = DEFAULT_AI_BASE_PROMPT;
    }
    aiSummary.populateTokenInputs(loadTokenUsage());
    renderVacationRanges();
    settingsDlg.showModal();
  });
  saveSettings == null ? void 0 : saveSettings.addEventListener("click", (e) => {
    e.preventDefault();
    if (modelScopeSelect) setModelScope(modelScopeSelect.value);
    updateModelScopeBadge();
    FLAGS.weekdayTicks = !!flagWeekdayTicks.checked;
    FLAGS.progressivePills = !!flagProgressivePills.checked;
    if (flagMonthlyGlance) FLAGS.monthlyGlance = !!flagMonthlyGlance.checked;
    if (flagHolidayAdjust) FLAGS.holidayAdjustments = !!flagHolidayAdjust.checked;
    if (flagTrendPills) FLAGS.trendPills = !!flagTrendPills.checked;
    if (flagSameRangeTotals) FLAGS.sameRangeTotals = !!flagSameRangeTotals.checked;
    if (flagHeadlineDigest) FLAGS.headlineDigest = !!flagHeadlineDigest.checked;
    if (flagMixViz) FLAGS.mixViz = !!flagMixViz.checked;
    if (flagBaselineCompare) FLAGS.baselineCompare = !!flagBaselineCompare.checked;
    if (flagCollapsedUi) FLAGS.collapsedUi = !!flagCollapsedUi.checked;
    if (flagQuickEntry) FLAGS.quickEntry = !!flagQuickEntry.checked;
    if (flagSmartSummary) FLAGS.smartSummary = !!flagSmartSummary.checked;
    if (flagDayCompare) FLAGS.dayCompare = !!flagDayCompare.checked;
    if (flagUspsEval) FLAGS.uspsEval = !!flagUspsEval.checked;
    try {
      USPS_EVAL = {
        routeId: ((evalRouteId == null ? void 0 : evalRouteId.value) || "").trim() || "R1",
        evalCode: ((evalCode == null ? void 0 : evalCode.value) || "").trim() || "44K",
        boxes: (evalBoxesIn == null ? void 0 : evalBoxesIn.value) !== "" ? +evalBoxesIn.value : null,
        stops: (evalStopsIn == null ? void 0 : evalStopsIn.value) !== "" ? +evalStopsIn.value : null,
        hoursPerDay: (evalHoursIn == null ? void 0 : evalHoursIn.value) !== "" ? +evalHoursIn.value : null,
        officeHoursPerDay: (evalOfficeHoursIn == null ? void 0 : evalOfficeHoursIn.value) !== "" ? +evalOfficeHoursIn.value : null,
        annualSalary: (evalSalaryIn == null ? void 0 : evalSalaryIn.value) !== "" ? +evalSalaryIn.value : null
      };
      saveEval(USPS_EVAL);
    } catch (_) {
    }
    try {
      const f = vacFrom == null ? void 0 : vacFrom.value;
      const t = vacTo == null ? void 0 : vacTo.value;
      if (f && t) addVacationRange(f, t);
      if (vacFrom) vacFrom.value = "";
      if (vacTo) vacTo.value = "";
    } catch (_) {
    }
    try {
      if (settingsEmaRate) {
        const val = settingsEmaRate.value;
        if (val !== "") {
          const parsed = parseFloat(val);
          if (isFinite(parsed) && parsed >= 0) {
            localStorage.setItem(SECOND_TRIP_EMA_KEY, String(parsed));
            if (secondTripEmaInput) {
              secondTripEmaInput.value = parsed;
            }
            try {
              updateSecondTripSummary();
            } catch (_) {
            }
          }
        }
        updateSecondTripSummary();
      }
    } catch (_) {
    }
    try {
      if (settingsOpenAiKey) {
        const val = settingsOpenAiKey.value || "";
        setOpenAiKey(val);
      }
    } catch (_) {
    }
    try {
      if (aiPromptTextarea) {
        setAiBasePrompt(aiPromptTextarea.value || "");
      }
    } catch (_) {
    }
    try {
      aiSummary.readTokenInputs();
    } catch (_) {
    }
    saveFlags(FLAGS);
    settingsDlg.close();
    renderVacationRanges();
    rebuildAll();
    renderUspsEvalTag();
    applyTrendPillsVisibility();
    applyCollapsedUi();
    applyRecentEntriesAutoCollapse();
    aiSummary.updateAvailability();
    aiSummary.renderLastSummary();
  });
  clearOpenAiKeyBtn == null ? void 0 : clearOpenAiKeyBtn.addEventListener("click", () => {
    if (settingsOpenAiKey) settingsOpenAiKey.value = "";
    setOpenAiKey("");
    aiSummary.updateAvailability();
    if (aiSummaryStatus) aiSummaryStatus.textContent = "OpenAI key cleared.";
  });
  aiSummaryBtn == null ? void 0 : aiSummaryBtn.addEventListener("click", aiSummary.generateSummary);
  toggleAiSummaryBtn == null ? void 0 : toggleAiSummaryBtn.addEventListener("click", () => {
    aiSummary.toggleCollapsed();
  });
  aiSummary.updateAvailability();
  aiSummary.renderLastSummary();
  var initialTokenUsage = loadTokenUsage();
  aiSummary.updateTokenUsageCard(initialTokenUsage);
  aiSummary.populateTokenInputs(initialTokenUsage);
  vacAdd == null ? void 0 : vacAdd.addEventListener("click", () => {
    try {
      const f = vacFrom == null ? void 0 : vacFrom.value;
      const t = vacTo == null ? void 0 : vacTo.value;
      if (f && t) {
        addVacationRange(f, t);
        if (vacFrom) vacFrom.value = "";
        if (vacTo) vacTo.value = "";
        renderVacationRanges();
        rebuildAll();
      }
    } catch (_) {
    }
  });
  vacRangesEl == null ? void 0 : vacRangesEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || !target.matches("button.vac-remove[data-index]")) return;
    const idx = parseInt(target.getAttribute("data-index") || "", 10);
    if (!Number.isNaN(idx)) {
      removeVacationRange(idx);
      renderVacationRanges();
      rebuildAll();
    }
  });
  var _a;
  (_a = document.getElementById("forceRefreshBtn")) == null ? void 0 : _a.addEventListener("click", async (e) => {
    var _a5;
    e.preventDefault();
    try {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {
      }
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        try {
          await (reg == null ? void 0 : reg.update());
        } catch (_) {
        }
        try {
          (_a5 = reg == null ? void 0 : reg.waiting) == null ? void 0 : _a5.postMessage({ type: "SKIP_WAITING" });
        } catch (_) {
        }
      }
    } finally {
      setTimeout(() => location.reload(), 200);
    }
  });
  function applyTrendPillsVisibility() {
    const ids = ["tileAdvHours", "tileAdvParcels", "tileAdvLetters"];
    const show = !!(FLAGS && FLAGS.trendPills);
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = show ? "" : "none";
    });
    const row = document.getElementById("trendPillsRow");
    if (row) row.style.display = show ? "grid" : "none";
  }
  function applyRecentEntriesAutoCollapse() {
    try {
      let setCollapsed = function(c) {
        body.style.display = c ? "none" : "";
        try {
          localStorage.setItem(KEY, c ? "1" : "0");
        } catch (_) {
        }
      };
      const sec = document.getElementById("recentEntriesCard");
      if (!sec) return;
      const headerEl = sec.firstElementChild;
      if (!headerEl) return;
      const KEY = "routeStats.collapse.recentEntriesCard";
      const collapseBody = sec.querySelector(":scope > .__collapseBody");
      const collapsedUiOn = !!(FLAGS && FLAGS.collapsedUi);
      if (collapseBody || collapsedUiOn) {
        if (localStorage.getItem(KEY) == null) {
          try {
            localStorage.setItem(KEY, "1");
          } catch (_) {
          }
        }
        try {
          (window.__collapse_set || (() => {
          }))("recentEntriesCard", true);
        } catch (_) {
        }
        return;
      }
      let body = sec.querySelector(":scope > .__rcBody");
      if (!body) {
        body = document.createElement("div");
        body.className = "__rcBody";
        const toMove = [];
        for (let i = 1; i < sec.children.length; i++) {
          toMove.push(sec.children[i]);
        }
        toMove.forEach((ch) => body.appendChild(ch));
        sec.appendChild(body);
      }
      const saved = localStorage.getItem(KEY);
      const initial = saved == null ? true : saved === "1";
      setCollapsed(initial);
      const toggle = () => setCollapsed(body.style.display !== "none" ? true : false);
      headerEl.style.cursor = "pointer";
      headerEl.addEventListener("click", (e) => {
        if (e.target.closest("button,a,input,select,textarea")) return;
        toggle();
      });
      headerEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    } catch (_) {
    }
  }
  sb.auth.onAuthStateChange((_evt, session) => {
    var _a5;
    const authed = !!session;
    CURRENT_USER_ID = authed ? ((_a5 = session == null ? void 0 : session.user) == null ? void 0 : _a5.id) || null : null;
    const signOutBtn = $("signOut");
    if (signOutBtn) signOutBtn.style.display = authed ? "inline-block" : "none";
    dAuth.textContent = authed ? "Session" : "No session";
    if (authed) {
      aiSummary.renderLastSummary();
    }
  });
  sb.auth.getSession().then(({ data }) => {
    var _a5;
    const session = (data == null ? void 0 : data.session) || null;
    CURRENT_USER_ID = ((_a5 = session == null ? void 0 : session.user) == null ? void 0 : _a5.id) || null;
    if (CURRENT_USER_ID) {
      aiSummary.renderLastSummary();
    }
  }).catch(() => {
  });
  function routeEndTime() {
    return $("returnTime").value || $("end").value || "";
  }
  var date = $("date");
  var route = $("route");
  var start = $("start");
  var end = $("end");
  var departTime = $("departTime");
  var returnTime = $("returnTime");
  var parcels = $("parcels");
  var letters = $("letters");
  var miles = $("miles");
  var mood = $("mood");
  var notes = $("notes");
  var secondTripMilesInput = $("secondTripMiles");
  var secondTripTimeInput = $("secondTripTime");
  var secondTripEmaInput = $("secondTripEma");
  var breakMinutesInput = $("breakMinutes");
  var secondTripPaidEl = $("secondTripPaid");
  var secondTripActualEl = $("secondTripActual");
  var secondTripReimburseEl = $("secondTripReimburse");
  var secondTripEmaRateEl = $("secondTripEmaRate");
  var SECOND_TRIP_EMA_KEY = "routeStats.secondTrip.ema";
  function readStoredEma() {
    try {
      const saved = parseFloat(localStorage.getItem(SECOND_TRIP_EMA_KEY));
      if (isFinite(saved) && saved >= 0) return saved;
    } catch (_) {
    }
    return 0.98;
  }
  try {
    if (secondTripEmaInput) {
      secondTripEmaInput.value = readStoredEma();
    }
  } catch (_) {
  }
  setSecondTripInputs(null);
  if (breakMinutesInput) breakMinutesInput.value = "0";
  var weather = $("weather");
  var temp = $("temp");
  var boxholders = $("boxholders");
  var holiday = $("holiday");
  var offDay = $("offDay");
  var officeH = $("officeH");
  var routeH = $("routeH");
  var totalH = $("totalH");
  var expEnd = $("expEnd");
  var expMeta = $("expMeta");
  var badgeVolume = $("badgeVolume");
  var badgeRouteEff = $("badgeRouteEff");
  var badgeOverall = $("badgeOverall");
  var dConnEl = $("dConn");
  var dAuthEl = $("dAuth");
  var dWriteEl = $("dWrite");
  badgeVolume.title = "Volume = parcels + w\xD7letters (learned from data, rank vs recent, 0\u201310)";
  badgeRouteEff.title = "Route Efficiency = today\u2019s street hours vs typical for this weekday (0\u201310)";
  badgeOverall.title = "Overall = total hours vs expected (weekday avg)";
  date.value = todayStr();
  route.value = "R1";
  function computeBreakdown() {
    const trip = getSecondTripInputs();
    const extraHours = trip.actualMinutes ? trip.actualMinutes / 60 : 0;
    const extraPaidMinutes = trip.miles ? trip.miles * 2 : 0;
    const breakMinutesVal = parseFloat((breakMinutesInput == null ? void 0 : breakMinutesInput.value) || "0");
    const breakHours = Number.isFinite(breakMinutesVal) && breakMinutesVal > 0 ? breakMinutesVal / 60 : 0;
    if (offDay.checked) {
      officeH.textContent = "0.00";
      routeH.textContent = "0.00";
      totalH.textContent = "0.00";
      return 0;
    }
    const d = date.value;
    const s = start.value || "08:00";
    const off = diffHours(d, s, departTime.value);
    let rte = diffHours(d, departTime.value, routeEndTime());
    if (rte == null && routeEndTime()) {
      const span = diffHours(d, s, routeEndTime());
      if (span != null && off != null) rte = Math.max(0, +(span - off).toFixed(2));
    }
    const officeDisplay = (off != null ? off : 0) + extraHours;
    const routeDisplay = rte != null ? Math.max(0, rte - breakHours) : null;
    const tot = Math.max(0, (off != null ? off : 0) + (rte != null ? rte : 0) + extraHours - breakHours);
    officeH.textContent = off != null || extraHours ? officeDisplay.toFixed(2) : "\u2014";
    routeH.textContent = routeDisplay != null ? routeDisplay.toFixed(2) : "\u2014";
    totalH.textContent = off != null || rte != null || extraHours || breakHours ? tot.toFixed(2) : "\u2014";
    const diag = $("diag");
    if (diag) {
      const extraTxt = extraHours ? ` \xB7 <b>Extra:</b> ${trip.actualMinutes.toFixed(0)}m (${extraPaidMinutes.toFixed(0)}m paid)` : "";
      const breakTxt = breakHours ? ` \xB7 <b>Break:</b> ${breakMinutesVal.toFixed(0)}m` : "";
      diag.innerHTML = `ROUTE STATS \xB7 Supabase: <b id="dConn">${dConn.textContent}</b> \xB7 Auth: <b id="dAuth">${dAuth.textContent}</b> \xB7 Write: <b id="dWrite">${dWrite.textContent}</b> \xB7 <b>Off:</b> ${off != null ? off : "\u2014"}h \xB7 <b>Route:</b> ${rte != null ? rte : "\u2014"}h \xB7 <b>Total:</b> ${tot.toFixed(2)}h${extraTxt}`;
      if (breakTxt) diag.innerHTML += breakTxt;
    }
    return tot;
  }
  function parseBoxholdersValue(v) {
    if (v == null || v === "") return 0;
    const raw = String(v).trim().toLowerCase();
    if (!raw) return 0;
    if (/none/.test(raw)) return 0;
    if (/light/.test(raw)) return 1;
    if (/medium/.test(raw)) return 2;
    if (/heavy/.test(raw)) return 3;
    const normalized = raw.replace(/×/g, "x").replace(/\s+/g, "");
    if (/^(x?1|1x)$/.test(normalized)) return 1;
    if (/^(x?2|2x)$/.test(normalized)) return 2;
    if (/^(x?3|3x)$/.test(normalized)) return 3;
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) {
      const rounded = Math.round(asNum);
      if (rounded >= 1 && rounded <= 3) return rounded;
    }
    return 0;
  }
  function boxholderAdjMinutes(valOrRow) {
    const v = valOrRow && typeof valOrRow === "object" ? valOrRow.boxholders : valOrRow;
    const n = parseBoxholdersValue(v);
    return n === 1 ? 30 : n === 2 ? 45 : n >= 3 ? 60 : 0;
  }
  function routeAdjustedHours(row) {
    const baseH = +row.route_minutes || 0;
    const adjBox = boxholderAdjMinutes(row);
    const adjBreak = parseBreakMinutesFromRow(row);
    const adjH = (adjBox + adjBreak) / 60;
    return Math.max(0, +(baseH - adjH).toFixed(2));
  }
  function formatBoxholderLabel(val) {
    if (val == null || val === "") return "\u2014";
    const parsed = parseBoxholdersValue(val);
    if (parsed > 0) return `${parsed}x`;
    const raw = String(val).trim().toLowerCase();
    if (/light/.test(raw)) return "1x";
    if (/medium/.test(raw)) return "2x";
    if (/heavy/.test(raw)) return "3x";
    return raw ? raw : "\u2014";
  }
  function inferBoxholderLabel(row) {
    if (!row) return "\u2014";
    const direct = formatBoxholderLabel(row.boxholders);
    if (direct !== "\u2014") return direct;
    const weatherStr = row.weather_json ? String(row.weather_json) : "";
    if (weatherStr) {
      const weatherMatch = weatherStr.match(/Box:\s*([^·]+)/i);
      if (weatherMatch) {
        const normalizedWeather = formatBoxholderLabel(weatherMatch[1].trim());
        if (normalizedWeather !== "\u2014") return normalizedWeather;
      }
    }
    const textSources = [row.reason, row.notes, weatherStr].filter(Boolean).map((v) => String(v).toLowerCase());
    if (!textSources.length) return "\u2014";
    const combined = textSources.join(" ");
    if (!/box/.test(combined)) return "\u2014";
    const match = combined.match(/box(?:holder)?[^a-z0-9]*(light|medium|heavy|x\s*\d|\d\s*x|\d+x)/i);
    if (!match) return "\u2014";
    const token = match[1] ? match[1] : match[0];
    return formatBoxholderLabel(token.replace(/\s+/g, ""));
  }
  function safeNumber(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }
  var CURRENT_LETTER_WEIGHT = 0.33;
  function __sum(arr, fn) {
    let s = 0;
    for (const x of arr) s += +fn(x) || 0;
    return s;
  }
  function routeAdjustedMinutes(row) {
    try {
      if (typeof routeAdjustedHours === "function") {
        const h = routeAdjustedHours(row);
        return isFinite(h) ? h * 60 : +row.route_minutes || 0;
      }
    } catch (_) {
    }
    return Math.max(0, +row.route_minutes || 0);
  }
  function computeLetterWeight(sampleRows) {
    const rows = (sampleRows || []).filter((r) => r && r.status !== "off");
    const n = rows.length;
    if (!n) return null;
    const mp = __sum(rows, (r) => +r.parcels || 0) / n;
    const ml = __sum(rows, (r) => +r.letters || 0) / n;
    const my = __sum(rows, (r) => routeAdjustedMinutes(r)) / n;
    let Cpp = 0, Cll = 0, Cpl = 0, Cpy = 0, Cly = 0;
    for (const r of rows) {
      const p = (+r.parcels || 0) - mp, l = (+r.letters || 0) - ml, y = routeAdjustedMinutes(r) - my;
      Cpp += p * p;
      Cll += l * l;
      Cpl += p * l;
      Cpy += p * y;
      Cly += l * y;
    }
    const det = Cpp * Cll - Cpl * Cpl;
    if (!isFinite(det) || Math.abs(det) < 1e-6) return null;
    const bp = (Cpy * Cll - Cpl * Cly) / det;
    const bl = (Cpp * Cly - Cpl * Cpy) / det;
    if (!isFinite(bp) || Math.abs(bp) < 1e-6) return null;
    let w = bl / bp;
    if (!isFinite(w) || w < 0) w = 0;
    if (w > 1.5) w = 1.5;
    return w;
  }
  function updateCurrentLetterWeight(allRows2) {
    try {
      const worked = (allRows2 || []).filter((r) => r && r.status !== "off" && (+r.parcels || 0) + (+r.letters || 0) > 0).sort((a, b) => a.work_date < b.work_date ? -1 : 1);
      const scoped = rowsForModelScope(worked);
      const w = computeLetterWeight(scoped);
      if (w != null) CURRENT_LETTER_WEIGHT = +(0.7 * CURRENT_LETTER_WEIGHT + 0.3 * w).toFixed(4);
      try {
        localStorage.setItem("routeStats.letterWeight", String(CURRENT_LETTER_WEIGHT));
      } catch (_) {
      }
    } catch (_) {
    }
  }
  (function loadSavedLetterWeight() {
    try {
      const v = parseFloat(localStorage.getItem("routeStats.letterWeight"));
      if (isFinite(v) && v > 0) CURRENT_LETTER_WEIGHT = v;
    } catch (_) {
    }
  })();
  function combinedVolume(p, l, w) {
    const W = w == null ? CURRENT_LETTER_WEIGHT : w;
    return safeNumber(p) + W * safeNumber(l);
  }
  function colorForDelta(pct) {
    if (pct == null) return { fg: "var(--muted)", bg: "transparent", bc: "var(--border)" };
    if (!FLAGS || !FLAGS.progressivePills) {
      return { fg: pct >= 0 ? "var(--good)" : "var(--bad)", bg: "transparent", bc: "transparent" };
    }
    const clamp = Math.max(-60, Math.min(60, pct));
    const t = Math.abs(clamp) / 60;
    const green = ["#A8E6A3", "#4CAF50", "#087F23"];
    const red = ["#F7A6A6", "#F44336", "#B71C1C"];
    const step = t < 0.17 ? 0 : t < 0.42 ? 1 : 2;
    const fg = clamp >= 0 ? green[step] : red[step];
    return { fg, bg: "transparent", bc: "transparent" };
  }
  var {
    getLetterWeightForSummary,
    buildSmartSummary,
    buildTrendingFactors,
    buildHeavinessToday,
    buildWeekHeaviness,
    buildHeadlineDigest
  } = createSummariesFeature({
    getFlags: () => FLAGS,
    filterRowsForView,
    routeAdjustedHours,
    computeLetterWeight,
    getCurrentLetterWeight: () => CURRENT_LETTER_WEIGHT,
    colorForDelta
  });
  function setNow(el) {
    el.value = hhmmNow();
    computeBreakdown();
  }
  $("btnStartNow").addEventListener("click", () => {
    if (!start.value) setNow(start);
  });
  $("btnStreetNow").addEventListener("click", () => setNow(departTime));
  $("btnClockNow").addEventListener("click", () => {
    setNow(end);
    if (!returnTime.value) {
      returnTime.value = end.value;
    }
  });
  $("btnStartNow2").addEventListener("click", () => setNow(start));
  $("btnStreetNow2").addEventListener("click", () => setNow(departTime));
  $("btnReturnNow").addEventListener("click", () => setNow(returnTime));
  $("btnClockNow2").addEventListener("click", () => {
    setNow(end);
    if (!returnTime.value) {
      returnTime.value = end.value;
    }
  });
  offDay.addEventListener("change", () => {
    if (offDay.checked) {
      end.value = hhmmNow();
      parcels.value = letters.value = miles.value = 0;
      mood.value = "\u{1F6D1} off";
      computeBreakdown();
    }
  });
  [date, start, departTime, returnTime, end, parcels, letters, miles, offDay, weather, temp, boxholders].forEach((el) => el.addEventListener("input", computeBreakdown));
  secondTripMilesInput == null ? void 0 : secondTripMilesInput.addEventListener("input", updateSecondTripSummary);
  secondTripTimeInput == null ? void 0 : secondTripTimeInput.addEventListener("input", updateSecondTripSummary);
  secondTripEmaInput == null ? void 0 : secondTripEmaInput.addEventListener("input", updateSecondTripSummary);
  document.addEventListener("keydown", (e) => {
    var _a5, _b, _c;
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      (_a5 = $("save")) == null ? void 0 : _a5.click();
    } else if (k === "d") {
      e.preventDefault();
      (_b = $("btnEditLast")) == null ? void 0 : _b.click();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      (_c = $("btnDeleteDay")) == null ? void 0 : _c.click();
    }
  });
  function weatherString() {
    const parts = [];
    if (weather == null ? void 0 : weather.value) parts.push(weather.value);
    if (temp == null ? void 0 : temp.value) parts.push(`${temp.value}\xB0F`);
    if (boxholders == null ? void 0 : boxholders.value) parts.push(`Box: ${boxholders.value}`);
    if (holiday == null ? void 0 : holiday.checked) parts.push("Holiday");
    if (reasonTag == null ? void 0 : reasonTag.value) parts.push(`Reason: ${reasonTag.value}`);
    const breakVal = parseFloat((breakMinutesInput == null ? void 0 : breakMinutesInput.value) || "0");
    if (Number.isFinite(breakVal) && breakVal > 0) parts.push(`Break:${breakVal}`);
    const st = getSecondTripPayload();
    if (st) {
      parts.push(`SecondTrip:${JSON.stringify(st)}`);
    }
    return parts.length ? parts.join(" \xB7 ") : null;
  }
  function collectPayload(userId) {
    const d = date.value;
    const s = start.value || "08:00";
    const offRaw = diffHours(d, s, departTime.value);
    let rteRaw = diffHours(d, departTime.value, routeEndTime());
    if (rteRaw == null && routeEndTime()) {
      const span = diffHours(d, s, routeEndTime());
      if (span != null && offRaw != null) rteRaw = Math.max(0, +(span - offRaw).toFixed(2));
    }
    const trip = getSecondTripInputs();
    const extraHours = trip.actualMinutes ? trip.actualMinutes / 60 : 0;
    const breakMinutesVal = parseFloat((breakMinutesInput == null ? void 0 : breakMinutesInput.value) || "0");
    const breakHours = Number.isFinite(breakMinutesVal) && breakMinutesVal > 0 ? breakMinutesVal / 60 : 0;
    const off = offDay.checked ? 0 : offRaw;
    const rte = offDay.checked ? 0 : rteRaw;
    const tot = offDay.checked ? 0 : Math.max(0, (off != null ? off : 0) + (rte != null ? rte : 0) + extraHours - breakHours);
    const officeForStore = offDay.checked ? 0 : offRaw != null ? +(offRaw + extraHours).toFixed(2) : extraHours ? +extraHours.toFixed(2) : null;
    return {
      user_id: userId,
      work_date: d,
      route: "R1",
      start_time: offDay.checked ? null : s || null,
      end_time: offDay.checked ? null : end.value || null,
      hours: offDay.checked ? 0 : tot || null,
      parcels: offDay.checked ? 0 : +parcels.value || 0,
      letters: offDay.checked ? 0 : +letters.value || 0,
      miles: offDay.checked ? 0 : +miles.value || 0,
      mood: offDay.checked ? "\u{1F6D1} off" : mood.value || null,
      notes: notes.value || null,
      status: offDay.checked ? "off" : "worked",
      office_start: s || null,
      depart_time: departTime.value || null,
      return_time: returnTime.value || null,
      office_minutes: offDay.checked ? 0 : officeForStore,
      route_minutes: offDay.checked ? 0 : rteRaw != null ? +rteRaw.toFixed(2) : null,
      weather_json: weatherString()
    };
  }
  function fillForm(r) {
    start.value = r.start_time || "08:00";
    end.value = r.end_time || "";
    departTime.value = r.depart_time || "";
    returnTime.value = r.return_time || "";
    parcels.value = r.parcels || 0;
    letters.value = r.letters || 0;
    miles.value = r.miles || 0;
    mood.value = r.mood || "";
    notes.value = r.notes || "";
    offDay.checked = r.status === "off";
    const raw = r.weather_json || "";
    if (!raw) {
      if (temp) temp.value = "";
      if (boxholders) boxholders.value = "";
      if (holiday) holiday.checked = false;
      weather.value = "";
      const reasonTag2 = document.getElementById("reasonTag");
      if (reasonTag2) reasonTag2.value = "";
      setSecondTripInputs(null);
      if (breakMinutesInput) breakMinutesInput.value = "0";
    } else {
      const parts = String(raw).split("\xB7").map((s) => s.trim());
      let w = "", t = "", b = "";
      let hol = false;
      let rsn = "";
      let stData = null;
      let brk = null;
      for (const p of parts) {
        if (/°F$/.test(p)) t = p.replace("\xB0F", "").trim();
        else if (/^Box:/i.test(p)) b = p.split(":").slice(1).join(":").trim();
        else if (/^Reason:/i.test(p)) rsn = p.split(":").slice(1).join(":").trim();
        else if (/^SecondTrip:/i.test(p)) {
          try {
            stData = JSON.parse(p.split(":").slice(1).join(":"));
          } catch (_) {
            stData = null;
          }
        } else if (/^Break:/i.test(p)) {
          const val = parseFloat(p.split(":").slice(1).join(":"));
          brk = Number.isFinite(val) && val >= 0 ? val : null;
        } else if (/^Holiday$/i.test(p)) hol = true;
        else w = p;
      }
      weather.value = w || "";
      if (temp) temp.value = t || "";
      if (boxholders) boxholders.value = b || "";
      if (holiday) holiday.checked = !!hol;
      const reasonTag2 = document.getElementById("reasonTag");
      if (reasonTag2) reasonTag2.value = rsn || "";
      setSecondTripInputs(stData);
      if (breakMinutesInput) breakMinutesInput.value = brk != null ? String(brk) : "0";
    }
    try {
      computeBreakdown();
    } catch (_) {
    }
  }
  var editingKey = null;
  var lastDeleted = null;
  var btnUndoDelete = $("btnUndoDelete");
  function showUndo(show) {
    if (!btnUndoDelete) return;
    btnUndoDelete.style.display = show ? "inline-block" : "none";
  }
  var searchBox = $("searchBox");
  var allRows = [];
  function applySearch(rows) {
    const q = (searchBox.value || "").trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const fields = [r.work_date, r.status, r.mood, r.weather_json, r.notes, String(r.parcels || ""), String(r.letters || ""), String(r.miles || "")];
      return fields.some((v) => String(v || "").toLowerCase().includes(q));
    });
  }
  function getSecondTripInputs() {
    if (!secondTripMilesInput) return { miles: 0, actualMinutes: 0, ema: 0.98 };
    const miles2 = parseFloat(secondTripMilesInput.value || "");
    const actual = parseInt(secondTripTimeInput.value || "");
    const emaRaw = secondTripEmaInput ? parseFloat(secondTripEmaInput.value || "") : NaN;
    const ema = isFinite(emaRaw) && emaRaw >= 0 ? emaRaw : readStoredEma();
    if (secondTripEmaInput && (!isFinite(emaRaw) || emaRaw < 0)) {
      secondTripEmaInput.value = ema;
    }
    return {
      miles: isFinite(miles2) && miles2 >= 0 ? miles2 : 0,
      actualMinutes: isFinite(actual) && actual >= 0 ? actual : 0,
      ema
    };
  }
  function getSecondTripPayload() {
    const { miles: miles2, actualMinutes, ema } = getSecondTripInputs();
    if (!(miles2 > 0 || actualMinutes > 0)) return null;
    return {
      m: +miles2.toFixed(2),
      t: actualMinutes,
      e: +ema.toFixed(2)
    };
  }
  function updateSecondTripSummary() {
    if (!secondTripMilesInput) return;
    const { miles: miles2, actualMinutes, ema } = getSecondTripInputs();
    const paidMinutes = miles2 * 2;
    const gas = miles2 * ema;
    if (secondTripPaidEl) secondTripPaidEl.textContent = paidMinutes.toFixed(0);
    if (secondTripActualEl) secondTripActualEl.textContent = actualMinutes.toFixed(0);
    if (secondTripReimburseEl) secondTripReimburseEl.textContent = gas.toFixed(2);
    if (secondTripEmaRateEl) secondTripEmaRateEl.textContent = ema.toFixed(2);
    try {
      if (ema > 0) localStorage.setItem(SECOND_TRIP_EMA_KEY, String(ema));
    } catch (_) {
    }
    try {
      computeBreakdown();
    } catch (_) {
    }
  }
  function setSecondTripInputs(data) {
    if (!secondTripMilesInput) return;
    const obj = data || { m: "", t: "", e: readStoredEma() };
    secondTripMilesInput.value = obj.m != null && obj.m !== "" ? obj.m : "";
    secondTripTimeInput.value = obj.t != null && obj.t !== "" ? obj.t : "";
    if (secondTripEmaInput) {
      const emaVal = obj.e != null && obj.e !== "" ? obj.e : readStoredEma();
      secondTripEmaInput.value = emaVal;
    }
    updateSecondTripSummary();
  }
  function parseSecondTripFromRow(row) {
    if (!row || !row.weather_json) return null;
    const part = row.weather_json.split("\xB7").map((s) => s.trim()).find((p) => /^SecondTrip:/i.test(p));
    if (!part) return null;
    try {
      return JSON.parse(part.split(":").slice(1).join(":"));
    } catch (_) {
      return null;
    }
  }
  function parseBreakMinutesFromRow(row) {
    if (!row || !row.weather_json) return 0;
    try {
      const part = row.weather_json.split("\xB7").map((s) => s.trim()).find((p) => /^Break:/i.test(p));
      if (!part) return 0;
      const val = parseFloat(part.split(":").slice(1).join(":"));
      return Number.isFinite(val) && val > 0 ? val : 0;
    } catch (_) {
      return 0;
    }
  }
  function getHourlyRateFromEval() {
    try {
      const cfg = USPS_EVAL || loadEval();
      if (!cfg || cfg.annualSalary == null || cfg.hoursPerDay == null) return null;
      const weeklyPay = cfg.annualSalary / 52;
      const hoursPerWeek = Math.max(0, (cfg.hoursPerDay || 0) * 5);
      if (!hoursPerWeek) return null;
      return weeklyPay / hoursPerWeek;
    } catch (_) {
      return null;
    }
  }
  function rebuildAll() {
    const rows = allRows || [];
    const rawRows = rows;
    const normalRows = rows.filter((r) => r && r.status !== "off");
    window.__rawRows = rawRows;
    window.allRows = rows;
    window.__holidayCatchupStats = summarizeHolidayCatchups(rawRows);
    updateCurrentLetterWeight(normalRows);
    renderTable(applySearch(rawRows));
    buildCharts(rawRows);
    buildSnapshot(rawRows);
    buildMonthlyGlance(rawRows);
    buildQuickFilter(rawRows);
    buildMixViz(rawRows);
    buildHeadlineDigest(rawRows);
    buildSmartSummary(rawRows);
    buildTrendingFactors(rawRows);
    buildOfficeCompare(rawRows);
    buildDayCompare(rawRows);
    buildHeavinessToday(rawRows);
    buildWeekHeaviness(rawRows);
    buildUspsTiles(rawRows);
    buildDiagnostics(normalRows);
    buildVolumeLeaderboard(rawRows);
  }
  async function loadByDate() {
    editingKey = null;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const d = date.value;
    if (!d) return;
    const { data, error } = await sb.from("entries").select("*").eq("user_id", user.id).eq("work_date", d).limit(1).maybeSingle();
    if (error && error.code !== "PGRST116") {
      console.error(error);
      return;
    }
    const saveBtn = $("save");
    saveBtn.classList.remove("ghost");
    if (data) {
      editingKey = { user_id: user.id, work_date: d };
      fillForm(data);
      saveBtn.textContent = "Update";
    } else {
      saveBtn.textContent = "Save";
    }
  }
  date.addEventListener("change", loadByDate);
  (function replaceSave() {
    const btn = $("save");
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener("click", async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        alert("No session. Try Link devices or refresh.");
        return;
      }
      const payload = collectPayload(user.id);
      let error;
      try {
        const { data: existing, error: findErr } = await sb.from("entries").select("work_date", { count: "exact", head: false }).eq("user_id", user.id).eq("work_date", payload.work_date);
        if (findErr) console.warn("find existing failed", findErr);
        const exists = Array.isArray(existing) && existing.length > 0;
        if (exists) {
          const { error: delErr } = await sb.from("entries").delete().eq("user_id", user.id).eq("work_date", payload.work_date);
          if (delErr) {
            error = delErr;
            throw delErr;
          }
          const { error: insErr } = await sb.from("entries").insert(payload);
          if (insErr) {
            error = insErr;
            throw insErr;
          }
        } else {
          const { error: insErr } = await sb.from("entries").insert(payload);
          if (insErr) {
            error = insErr;
            throw insErr;
          }
        }
      } catch (e) {
        error = e;
      }
      dWrite.textContent = error ? "Failed" : "OK";
      if (error) {
        alert(error.message);
        return;
      }
      clone.textContent = "Update";
      clone.disabled = true;
      clone.classList.add("saving", "savedFlash");
      setTimeout(() => {
        clone.disabled = false;
        clone.classList.remove("saving");
      }, 400);
      setTimeout(() => clone.classList.remove("savedFlash"), 700);
      const rows = await fetchEntries();
      allRows = rows;
      rebuildAll();
      editingKey = { user_id: user.id, work_date: date.value };
      clone.classList.remove("ghost");
    });
  })();
  var _a2;
  (_a2 = $("btnEditLast")) == null ? void 0 : _a2.addEventListener("click", async () => {
    const rows = await fetchEntries();
    if (!rows.length) {
      alert("No entries yet.");
      return;
    }
    const latest = rows[0];
    $("date").value = latest.work_date;
    await loadByDate();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  var _a3;
  (_a3 = $("btnDeleteDay")) == null ? void 0 : _a3.addEventListener("click", async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      alert("No session. Try Link devices.");
      return;
    }
    const d = $("date").value;
    if (!d) {
      alert("Pick a date first.");
      return;
    }
    const { data: rowToDelete, error: fetchErr } = await sb.from("entries").select("*").eq("user_id", user.id).eq("work_date", d).maybeSingle();
    if (fetchErr && fetchErr.code !== "PGRST116") {
      alert(fetchErr.message);
      return;
    }
    if (!rowToDelete) {
      alert("No entry exists for this date.");
      return;
    }
    if (!confirm(`Delete your entry for ${d}? This cannot be undone (unless you press Undo).`)) return;
    const { error } = await sb.from("entries").delete().eq("user_id", user.id).eq("work_date", d);
    if (error) {
      alert(error.message);
      return;
    }
    lastDeleted = rowToDelete;
    showUndo(true);
    $("notes").value = "";
    parcels.value = 0;
    letters.value = 0;
    miles.value = 53;
    offDay.checked = false;
    start.value = "08:00";
    end.value = "";
    departTime.value = "";
    returnTime.value = "";
    mood.value = "";
    weather.value = "";
    if (temp) temp.value = "";
    if (boxholders) boxholders.value = "";
    computeBreakdown();
    const rows = await fetchEntries();
    allRows = rows;
    rebuildAll();
    alert(`Deleted ${d}. You can Undo now.`);
  });
  btnUndoDelete == null ? void 0 : btnUndoDelete.addEventListener("click", async () => {
    if (!lastDeleted) {
      showUndo(false);
      return;
    }
    dWrite.textContent = "\u2014";
    const { error } = await sb.from("entries").insert(lastDeleted);
    if (error) {
      alert("Undo failed: " + error.message);
      return;
    }
    const rows = await fetchEntries();
    allRows = rows;
    rebuildAll();
    alert(`Restored ${lastDeleted.work_date}.`);
    $("date").value = lastDeleted.work_date;
    await loadByDate();
    lastDeleted = null;
    showUndo(false);
  });
  async function fetchEntries() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];
    const { data, error } = await sb.from("entries").select("*").eq("user_id", user.id).order("work_date", { ascending: false }).limit(365);
    if (error) {
      console.error(error);
      return [];
    }
    return ensurePostHolidayTags(data || []);
  }
  function classifyRow(total, avg) {
    if (total == null || avg == null) return "";
    const diff = (total - avg) / avg;
    if (diff <= -0.15) return "light";
    if (diff >= 0.15) return "heavy";
    return "typical";
  }
  function renderTable(rows) {
    rows = rows || [];
    const tbody = document.querySelector("#tbl tbody");
    tbody.innerHTML = "";
    resetDiagnosticsCache();
    const model = getResidualModel(rows);
    const byDow = Array.from({ length: 7 }, () => []);
    rows.forEach((r) => {
      if (r.status === "off") return;
      const h = Number(r.hours || 0);
      const d = dowIndex(r.work_date);
      if (h > 0) byDow[d].push(h);
    });
    const avgByDow = byDow.map((list) => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
    for (const r of rows) {
      const tot = Number(r.hours || 0) || null;
      const offH = r.office_minutes != null ? Number(r.office_minutes).toFixed(2) : "";
      const rteH = r.route_minutes != null ? Number(r.route_minutes).toFixed(2) : "";
      const dObj = DateTime.fromISO(r.work_date, { zone: ZONE });
      const dowShort = dObj.toFormat("ccc").charAt(0);
      const moon = moonPhaseEmoji(r.work_date);
      const d = dowIndex(r.work_date);
      const avg = avgByDow[d];
      const cls = classifyRow(tot, avg);
      const tr = document.createElement("tr");
      tr.classList.add("rowLink");
      if (cls) tr.classList.add(cls);
      tr.dataset.date = r.work_date;
      tr.tabIndex = 0;
      tr.innerHTML = `<td>${r.work_date}${vacMark(r.work_date)} (${dowShort}) ${moon}</td><td>R1</td><td>${r.status || "worked"}</td>
        <td class="right">${offH}</td><td class="right">${rteH}</td><td class="right">${tot != null ? tot.toFixed(2) : ""}</td>
        <td class="right">${r.parcels || 0}</td><td class="right">${r.letters || 0}</td><td class="right">${r.miles || 0}</td>
        <td>${r.weather_json || ""}</td><td></td>`;
      tbody.appendChild(tr);
    }
  }
  var VERSION_TAG = function() {
    try {
      return "v" + DateTime.now().setZone(ZONE).toFormat("yyyy-MM-dd");
    } catch (_) {
      return "v-current";
    }
  }();
  function toCsv(rows) {
    const headers = ["work_date", "route", "status", "start_time", "depart_time", "return_time", "end_time", "hours", "office_minutes", "route_minutes", "parcels", "letters", "miles", "mood", "notes", "weather_json", "created_at"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const vals = headers.map((h) => {
        let v;
        if (h === "route") v = "R1";
        else v = r[h];
        if (v == null) return "";
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      });
      lines.push(vals.join(","));
    }
    return lines.join("\n");
  }
  $("exportCsv").addEventListener("click", async () => {
    const rows = allRows.length ? allRows : await fetchEntries();
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `route-stats-all_${VERSION_TAG}.csv`;
    a.click();
  });
  $("exportCsvFiltered").addEventListener("click", async () => {
    const rows = applySearch(allRows.length ? allRows : await fetchEntries());
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `route-stats-filtered_${VERSION_TAG}.csv`;
    a.click();
  });
  var showUidBtn = $("showUid");
  showUidBtn == null ? void 0 : showUidBtn.addEventListener("click", async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      alert("No session. Use Link devices.");
      return;
    }
    alert(`Current user id (account key):
${user.id}

Entries are filtered by this id.`);
  });
  var importFile = $("importFile");
  var _a4;
  (_a4 = $("importCsv")) == null ? void 0 : _a4.addEventListener("click", () => importFile.click());
  importFile == null ? void 0 : importFile.addEventListener("change", async () => {
    var _a5;
    const file = (_a5 = importFile.files) == null ? void 0 : _a5[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      alert("CSV is empty");
      return;
    }
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const idx = (n) => headers.indexOf(n);
    const splitCsv = (row) => row.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
    const unq = (v) => /^".*"$/.test(v) ? v.slice(1, -1).replace(/""/g, '"') : v;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      alert("No session. Use Link devices.");
      return;
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsv(lines[i]);
      const get = (name) => {
        var _a6;
        return unq((_a6 = cols[idx(name)]) != null ? _a6 : "");
      };
      const r = { user_id: user.id, work_date: get("work_date"), route: "R1", status: get("status") || "worked", start_time: get("start_time") || null, depart_time: get("depart_time") || null, return_time: get("return_time") || null, end_time: get("end_time") || null, hours: +(get("hours") || 0) || null, office_minutes: get("office_minutes") || null, route_minutes: get("route_minutes") || null, parcels: +(get("parcels") || 0) || 0, letters: +(get("letters") || 0) || 0, miles: +(get("miles") || 0) || 0, mood: get("mood") || null, notes: get("notes") || null, weather_json: get("weather_json") || null };
      if (r.work_date) rows.push(r);
    }
    if (!rows.length) {
      alert("No rows detected");
      return;
    }
    const chunk = 200;
    for (let i = 0; i < rows.length; i += chunk) {
      const slice = rows.slice(i, i + chunk);
      const { error } = await sb.from("entries").insert(slice);
      if (error) {
        alert("Import failed: " + error.message);
        return;
      }
    }
    const fresh = await fetchEntries();
    allRows = fresh;
    rebuildAll();
    alert(`Imported ${rows.length} rows into this account.`);
  });
  function hhmmFrom(baseDateStr, hours) {
    if (hours == null) return "\u2014";
    const d = DateTime.fromISO(baseDateStr, { zone: ZONE }).set({ hour: 8, minute: 0 });
    return d.plus({ hours }).toFormat("h:mm a");
  }
  function buildSnapshot(rows) {
    var _a5, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u;
    rows = filterRowsForView(rows || []);
    const today = DateTime.now().setZone(ZONE);
    const dow = today.weekday % 7;
    const workRows = rows.filter((r) => r.status !== "off");
    const byDow = Array.from({ length: 7 }, () => ({ h: 0, c: 0 }));
    for (const r of workRows) {
      const h = Number(r.hours || 0);
      if (h > 0) {
        const d = dowIndex(r.work_date);
        byDow[d].h += h;
        byDow[d].c++;
      }
    }
    const avgH = byDow.map((x) => x.c ? x.h / x.c : null);
    const todayAvgH = avgH[dow];
    expEnd.textContent = todayAvgH ? hhmmFrom(today.toISODate(), todayAvgH) : "\u2014";
    expMeta.textContent = `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]} avg ${todayAvgH ? todayAvgH.toFixed(2) + "h" : "\u2014"}`;
    (function enableTileHelp() {
      try {
        const pairs = [
          { id: "badgeVolume", help: "helpVolume" },
          { id: "badgeRouteEff", help: "helpRouteEff" },
          { id: "badgeOverall", help: "helpOverall" }
        ];
        pairs.forEach((p) => {
          const badge = document.getElementById(p.id);
          const help = document.getElementById(p.help);
          const tile = badge == null ? void 0 : badge.closest(".stat");
          if (!badge || !help || !tile) return;
          if (tile.dataset.helpReady) return;
          tile.dataset.helpReady = "1";
          tile.style.cursor = "pointer";
          tile.setAttribute("tabindex", "0");
          const toggle = () => {
            help.style.display = help.style.display === "none" || !help.style.display ? "block" : "none";
          };
          tile.addEventListener("click", (e) => {
            if (e.target.closest("button,a,input,select,textarea")) return;
            toggle();
          });
          tile.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          });
        });
      } catch (_) {
      }
    })();
    const letterW = CURRENT_LETTER_WEIGHT || 0.33;
    const volMetric = (r) => combinedVolume(r.parcels || 0, r.letters || 0, letterW);
    const vols = workRows.map(volMetric);
    const v = vols.length ? volMetric(workRows[0] || {}) : 0;
    const rank = (arr, x) => {
      const s = [...arr].sort((a, b) => a - b);
      let idx = s.findIndex((n) => x <= n);
      if (idx < 0) idx = s.length - 1;
      return (idx + 1) / s.length;
    };
    const volScore10 = vols.length ? Math.round(rank(vols, v) * 10) : null;
    if (volScore10 == null) badgeVolume.textContent = "\u2014";
    else badgeVolume.textContent = `${volScore10}/10`;
    try {
      if (vols.length) {
        const s = [...vols].sort((a, b) => a - b);
        const min = s[0], max = s[s.length - 1];
        const mid = Math.floor(s.length / 2);
        const med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
        const pct2 = Math.round(rank(vols, v) * 100);
        const volTip = `Volume today: ${v.toFixed(1)} (parcels + ${letterW.toFixed(2)}\xD7letters)
Score: ${volScore10}/10 \u2248 ${pct2}th percentile of ${vols.length} worked day(s)
Range: min ${min.toFixed(1)} \u2022 median ${med.toFixed(1)} \u2022 max ${max.toFixed(1)}`;
        badgeVolume.title = volTip;
        try {
          const tile = badgeVolume.closest(".stat");
          if (tile) tile.title = volTip;
        } catch (_) {
        }
        const hv = document.getElementById("helpVolume");
        if (hv) hv.textContent = `Rank (all-time): ${volScore10}/10 (~${pct2}th percentile). Today ${v.toFixed(1)}; min ${min.toFixed(1)}, median ${med.toFixed(1)}, max ${max.toFixed(1)}.`;
      }
    } catch (_) {
    }
    const rhs = workRows.filter((r) => dowIndex(r.work_date) === dow).map((r) => routeAdjustedHours(r)).filter((n) => n > 0);
    const rteAvg = rhs.length ? rhs.reduce((a, b) => a + b, 0) / rhs.length : null;
    const todayRoute = workRows[0] ? routeAdjustedHours(workRows[0]) : null;
    const rteScore = rteAvg && todayRoute != null && rteAvg > 0 ? Math.max(0, Math.min(10, Math.round((1 - (todayRoute - rteAvg) / Math.max(1, rteAvg)) * 10))) : 0;
    badgeRouteEff.textContent = `${rteScore}/10`;
    try {
      const deltaPct = rteAvg && todayRoute != null && rteAvg > 0 ? Math.round((todayRoute - rteAvg) / rteAvg * 100) : null;
      const adjNote = `adjusted \u2212${boxholderAdjMinutes(workRows[0]) || 0}m (\u2248${(boxholderAdjMinutes(workRows[0]) || 0) / 60}h) for boxholders`;
      badgeRouteEff.title = `Route minutes (adjusted): ${todayRoute != null ? Math.round(todayRoute) : "\u2014"} vs weekday avg ${rteAvg != null ? Math.round(rteAvg) : "\u2014"}
\u0394 vs avg: ${deltaPct == null ? "\u2014" : deltaPct >= 0 ? "+" + deltaPct : "\u2212" + Math.abs(deltaPct)}%
Score: ${rteScore}/10 (higher is better)
Note: ${adjNote}`;
      const hr = document.getElementById("helpRouteEff");
      if (hr) {
        hr.innerHTML = `Adjusted route min vs weekday avg.<br>Today ${todayRoute != null ? Math.round(todayRoute) : "\u2014"} vs avg ${rteAvg != null ? Math.round(rteAvg) : "\u2014"}. Score ${rteScore}/10.
          <br><button id="linkRouteEffDetails" class="ghost btn-compact" type="button">Open Weekly Compare</button>`;
        setTimeout(() => {
          const btn = document.getElementById("linkRouteEffDetails");
          if (btn) {
            btn.onclick = (e) => {
              var _a6;
              e.preventDefault();
              try {
                (_a6 = document.getElementById("mixVizCard")) == null ? void 0 : _a6.scrollIntoView({ behavior: "smooth", block: "start" });
              } catch (_) {
              }
            };
          }
        }, 0);
      }
    } catch (_) {
    }
    const totToday = workRows[0] ? +workRows[0].hours || 0 : 0;
    const exp = todayAvgH || 0;
    const overallScore = exp > 0 ? Math.max(0, Math.min(10, Math.round((1 - (totToday - exp) / Math.max(1, exp)) * 10))) : 0;
    badgeOverall.textContent = `${overallScore}/10`;
    try {
      const deltaPctTot = exp > 0 ? Math.round((totToday - exp) / exp * 100) : null;
      badgeOverall.title = `Total hours: ${totToday.toFixed(2)} vs expected ${exp ? exp.toFixed(2) : "\u2014"} (weekday avg)
\u0394 vs expected: ${deltaPctTot == null ? "\u2014" : deltaPctTot >= 0 ? "+" + deltaPctTot : "\u2212" + Math.abs(deltaPctTot)}%
Score: ${overallScore}/10 (higher is better)`;
      const ho = document.getElementById("helpOverall");
      if (ho) ho.textContent = `Total hours vs weekday expected. Today ${totToday.toFixed(2)}h vs exp ${exp ? exp.toFixed(2) + "h" : "\u2014"}. Score ${overallScore}/10.`;
    } catch (_) {
    }
    const todayRow = workRows[0] || null;
    const tripRaw = todayRow ? parseSecondTripFromRow(todayRow) : null;
    const evalHourly = getHourlyRateFromEval();
    let extraTrip = null;
    if (tripRaw) {
      const miles2 = Math.max(0, +tripRaw.m || 0);
      const actual = Math.max(0, +tripRaw.t || 0);
      const emaRaw = tripRaw.e != null && tripRaw.e !== "" ? +tripRaw.e : NaN;
      const emaVal = Number.isFinite(emaRaw) && emaRaw >= 0 ? emaRaw : readStoredEma();
      if (miles2 > 0 || actual > 0) {
        const paidMinutes = miles2 * 2;
        const gas = miles2 * emaVal;
        const timePay = evalHourly != null ? paidMinutes / 60 * evalHourly : null;
        const payout = gas + (timePay || 0);
        extraTrip = {
          miles: miles2,
          actual,
          ema: emaVal,
          paidMinutes,
          gas,
          timePay,
          payout
        };
      }
    }
    try {
      const tile = document.getElementById("extraTripTodayTile");
      const valEl = document.getElementById("extraTripTodayVal");
      const metaEl = document.getElementById("extraTripTodayMeta");
      if (tile && valEl && metaEl) {
        if (!extraTrip) {
          tile.style.display = "none";
        } else {
          tile.style.display = "";
          valEl.textContent = `$${extraTrip.payout.toFixed(2)}`;
          const metaParts = [];
          metaParts.push(`${extraTrip.miles.toFixed(1)} mi`);
          metaParts.push(`Paid ${extraTrip.paidMinutes.toFixed(0)}m`);
          if (extraTrip.actual > 0) metaParts.push(`Actual ${extraTrip.actual.toFixed(0)}m`);
          metaParts.push(`Gas $${extraTrip.gas.toFixed(2)}`);
          if (extraTrip.timePay != null) metaParts.push(`Time $${extraTrip.timePay.toFixed(2)}`);
          metaEl.textContent = metaParts.join(" \xB7 ");
          tile.title = `Miles ${extraTrip.miles.toFixed(2)} \xB7 Paid ${extraTrip.paidMinutes.toFixed(0)}m \xB7 Actual ${extraTrip.actual.toFixed(0)}m \xB7 EMA $${extraTrip.ema.toFixed(2)}/mi`;
        }
      }
    } catch (_) {
    }
    try {
      const tile = document.getElementById("todayHourlyTile");
      const valEl = document.getElementById("todayHourlyRate");
      const metaEl = document.getElementById("todayHourlyMeta");
      if (tile && valEl && metaEl) {
        if (evalHourly == null || !(totToday > 0)) {
          tile.style.display = "none";
        } else {
          const basePay = evalHourly * totToday;
          const extraPay = extraTrip ? extraTrip.payout : 0;
          const runRate = (basePay + extraPay) / Math.max(totToday, 0.01);
          tile.style.display = "";
          valEl.textContent = `$${runRate.toFixed(2)}`;
          const metaParts = [`Base $${basePay.toFixed(2)}`];
          if (extraPay > 0) {
            metaParts.push(`Extra $${extraPay.toFixed(2)}`);
          }
          metaParts.push(`${totToday.toFixed(2)}h`);
          metaEl.textContent = metaParts.join(" \xB7 ");
          const lines = [`Base pay (est.): $${basePay.toFixed(2)} for ${totToday.toFixed(2)}h (@ $${evalHourly.toFixed(2)}/h)`];
          if (extraTrip) {
            const timeLine = extraTrip.timePay != null ? `Time $${extraTrip.timePay.toFixed(2)}` : null;
            const extras = [`Gas $${extraTrip.gas.toFixed(2)}`];
            if (timeLine) extras.push(timeLine);
            lines.push(`Extra trip payout: $${extraTrip.payout.toFixed(2)} (${extras.join(" + ")})`);
          }
          tile.title = lines.join("\n");
        }
      }
    } catch (_) {
    }
    const weekStart = startOfWeekMonday(today);
    const weekEnd = today.endOf("day");
    const prevWeekStart = startOfWeekMonday(today.minus({ weeks: 1 }));
    const prevWeekEnd = endOfWeekSunday(today.minus({ weeks: 1 }));
    const priorWeekStart = startOfWeekMonday(today.minus({ weeks: 2 }));
    const priorWeekEnd = endOfWeekSunday(today.minus({ weeks: 2 }));
    const inRange = (r, from, to) => {
      const d = DateTime.fromISO(r.work_date, { zone: ZONE });
      return d >= from && d <= to;
    };
    const sum = (arr, fn) => arr.reduce((t, x) => t + (fn(x) || 0), 0);
    const thisW = workRows.filter((r) => inRange(r, weekStart, weekEnd));
    const lastW = workRows.filter((r) => inRange(r, prevWeekStart, prevWeekEnd));
    const priorW = workRows.filter((r) => inRange(r, priorWeekStart, priorWeekEnd));
    const daysWorked = (arr) => arr.filter((r) => (r.hours || 0) > 0).length;
    const dThis = daysWorked(thisW), dLast = daysWorked(lastW), dPrior = daysWorked(priorW);
    const hThis = sum(thisW, (r) => +r.hours || 0), pThis = sum(thisW, (r) => +r.parcels || 0), lThis = sum(thisW, (r) => +r.letters || 0);
    const hLast = sum(lastW, (r) => +r.hours || 0), pLast = sum(lastW, (r) => +r.parcels || 0), lLast = sum(lastW, (r) => +r.letters || 0);
    $("wkHours").textContent = `${(hThis || 0).toFixed(2)} / ${(hLast || 0).toFixed(2)}`;
    $("wkParcels").textContent = `${pThis || 0} / ${pLast || 0}`;
    $("wkLetters").textContent = `${lThis || 0} / ${lLast || 0}`;
    const avgOrNull = (tot, days) => days ? tot / days : null;
    const pct = (a, b) => a == null || b == null || b === 0 ? null : (a - b) / b * 100;
    const hCarry = pct(avgOrNull(hLast, dLast), avgOrNull(sum(priorW, (r) => +r.hours || 0), dPrior));
    const pCarry = pct(avgOrNull(pLast, dLast), avgOrNull(sum(priorW, (r) => +r.parcels || 0), dPrior));
    const lCarry = pct(avgOrNull(lLast, dLast), avgOrNull(sum(priorW, (r) => +r.letters || 0), dPrior));
    const hTarget = pct(avgOrNull(hThis, dThis), avgOrNull(hLast, dLast));
    const pTarget = pct(avgOrNull(pThis, dThis), avgOrNull(pLast, dLast));
    const lTarget = pct(avgOrNull(lThis, dThis), avgOrNull(lLast, dLast));
    const progress = Math.min(1, dThis / 5);
    const blend = (carry, target) => carry == null && target == null ? null : carry == null ? target : target == null ? carry : carry * (1 - progress) + target * progress;
    const dh = blend(hCarry, hTarget);
    const dp = blend(pCarry, pTarget);
    const dl = blend(lCarry, lTarget);
    const fmt = (p) => {
      if (p == null) return "\u2014";
      const rounded = Math.round(p);
      return rounded >= 0 ? `\u2191 ${rounded}%` : `\u2193 ${Math.abs(rounded)}%`;
    };
    const setPill = (el, delta) => {
      el.textContent = fmt(delta);
      el.className = "pill";
      const { fg } = colorForDelta(delta || 0);
      el.style.color = fg || "var(--text)";
      el.style.background = "transparent";
      el.style.borderColor = "transparent";
    };
    setPill($("wkHoursDelta"), dh);
    setPill($("wkParcelsDelta"), dp);
    setPill($("wkLettersDelta"), dl);
    const extraMilesEl = document.getElementById("extraMilesWeekVal");
    const extraTimeEl = document.getElementById("extraTimeWeekVal");
    const extraPayoutEl = document.getElementById("extraPayoutWeekVal");
    const extraTiles = [document.getElementById("extraMilesWeek"), document.getElementById("extraTimeWeek"), document.getElementById("extraPayoutWeek")];
    const tripsThisWeek = (rows || []).map((r) => ({ row: r, data: parseSecondTripFromRow(r) })).filter((entry) => entry.data && inRange(entry.row, weekStart, weekEnd));
    if (!tripsThisWeek.length) {
      extraTiles.forEach((el) => {
        if (el) el.style.display = "";
      });
      if (extraMilesEl) extraMilesEl.textContent = "0 mi";
      if (extraTimeEl) {
        extraTimeEl.textContent = "0 min";
        extraTimeEl.title = "No extra trips logged yet";
      }
      if (extraPayoutEl) {
        extraPayoutEl.textContent = "$0.00";
        extraPayoutEl.title = "No extra trips logged yet";
      }
    } else {
      const totalMiles = tripsThisWeek.reduce((sum2, entry) => sum2 + (+entry.data.m || 0), 0);
      const totalActual = tripsThisWeek.reduce((sum2, entry) => sum2 + (+entry.data.t || 0), 0);
      const totalPaid = tripsThisWeek.reduce((sum2, entry) => sum2 + (+entry.data.m || 0) * 2, 0);
      const totalGas = tripsThisWeek.reduce((sum2, entry) => {
        var _a6;
        const miles2 = +entry.data.m || 0;
        const emaRaw = (_a6 = entry.data) == null ? void 0 : _a6.e;
        const ema = Number.isFinite(+emaRaw) && +emaRaw >= 0 ? +emaRaw : readStoredEma();
        return sum2 + miles2 * ema;
      }, 0);
      const hourlyRate = getHourlyRateFromEval();
      const timeComp = hourlyRate != null ? totalPaid / 60 * hourlyRate : null;
      const payout = (timeComp != null ? timeComp : 0) + totalGas;
      if (extraTiles[0]) extraTiles[0].style.display = "";
      if (extraTiles[1]) extraTiles[1].style.display = "";
      if (extraTiles[2]) extraTiles[2].style.display = "";
      if (extraMilesEl) extraMilesEl.textContent = `${totalMiles.toFixed(1)} mi`;
      if (extraTimeEl) {
        const paidNote = totalPaid.toFixed(0);
        extraTimeEl.textContent = `${totalActual.toFixed(0)} min`;
        extraTimeEl.title = `Actual minutes: ${totalActual.toFixed(0)} \xB7 Paid minutes: ${paidNote}`;
      }
      if (extraPayoutEl) {
        extraPayoutEl.textContent = `$${payout.toFixed(2)}`;
        extraPayoutEl.title = timeComp != null ? `Gas: $${totalGas.toFixed(2)} \xB7 Time pay: $${timeComp.toFixed(2)}` : `Gas: $${totalGas.toFixed(2)} \xB7 Add salary in Settings to include paid time`;
      }
    }
    const dayIndexToday = (today.weekday + 6) % 7;
    const toWeekArray = (from, to) => {
      const out = Array.from({ length: 7 }, () => ({ h: 0, p: 0, l: 0 }));
      const inRange2 = (r) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        return d >= from && d <= to;
      };
      workRows.filter(inRange2).forEach((r) => {
        const d = DateTime.fromISO(r.work_date, { zone: ZONE });
        const idx = (d.weekday + 6) % 7;
        const h = +r.hours || 0;
        const p = +r.parcels || 0;
        const l = +r.letters || 0;
        out[idx].h += h;
        out[idx].p += p;
        out[idx].l += l;
      });
      return out;
    };
    const thisWeek = toWeekArray(weekStart, weekEnd);
    const lastWeek = toWeekArray(prevWeekStart, prevWeekEnd);
    const holidayAdjEnabled = !!(FLAGS && FLAGS.holidayAdjustments);
    const carryNext = /* @__PURE__ */ new Set();
    if (holidayAdjEnabled) {
      try {
        const inWeek = (r) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          return d >= weekStart && d <= weekEnd;
        };
        const isHolidayMarked2 = (r) => /(^|\b)Holiday(\b|$)/i.test(String(r.weather_json || ""));
        rows.filter((r) => r.status === "off" && inWeek(r) && isHolidayMarked2(r)).forEach((r) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          const idx = (d.weekday + 6) % 7;
          if (idx < 6) carryNext.add(idx + 1);
        });
      } catch (_) {
      }
    }
    const offIdxThisWeek = new Set(rows.filter((r) => r.status === "off" && inRange(r, weekStart, weekEnd)).map((r) => (DateTime.fromISO(r.work_date, { zone: ZONE }).weekday + 6) % 7));
    const dailyDeltas = (key) => {
      var _a6, _b2;
      const arr = [];
      for (let i = 0; i <= dayIndexToday && i < 7; i++) {
        const cur = offIdxThisWeek.has(i) ? null : thisWeek[i][key];
        let base = lastWeek[i][key];
        if (holidayAdjEnabled && carryNext.has(i)) {
          base = (((_a6 = lastWeek[i - 1]) == null ? void 0 : _a6[key]) || 0) + (((_b2 = lastWeek[i]) == null ? void 0 : _b2[key]) || 0);
        }
        arr.push(cur == null ? null : pct(cur || 0, base || 0));
      }
      return arr;
    };
    const dH = dailyDeltas("h");
    const dP = dailyDeltas("p");
    const dL = dailyDeltas("l");
    const weightedAvg = (arr) => {
      let s = 0, wsum = 0;
      for (let i = 0; i < arr.length; i++) {
        const v2 = arr[i];
        if (v2 == null || !isFinite(v2)) continue;
        const w = i + 1;
        s += v2 * w;
        wsum += w;
      }
      return wsum ? s / wsum : null;
    };
    const cumulative = (arr) => {
      let s = 0, seen = false;
      for (const v2 of arr) {
        if (v2 == null || !isFinite(v2)) continue;
        s += v2;
        seen = true;
      }
      return seen ? s : null;
    };
    const advH = weightedAvg(dH);
    const advP = weightedAvg(dP);
    const advL = weightedAvg(dL);
    const cumH = cumulative(dH);
    const cumP = cumulative(dP);
    const cumL = cumulative(dL);
    function sameCountDelta(key) {
      var _a6, _b2;
      const cur = [];
      for (let i = 0; i <= dayIndexToday && i < 7; i++) {
        const v2 = ((_a6 = thisWeek[i]) == null ? void 0 : _a6[key]) || 0;
        if (v2 > 0) cur.push(v2);
      }
      const N = cur.length;
      const prior = [];
      for (let i = 0; i < 7; i++) {
        const v2 = ((_b2 = lastWeek[i]) == null ? void 0 : _b2[key]) || 0;
        if (v2 > 0) prior.push(v2);
      }
      const M = prior.length;
      if (!N || !M) return { delta: null, n: N, m: M, avgThis: null, avgLast: null };
      const nUse = Math.min(N, M);
      const sumArr = (a) => a.reduce((t, x) => t + (+x || 0), 0);
      const avgThis = sumArr(cur) / N;
      const avgLast = sumArr(prior.slice(0, nUse)) / nUse;
      const delta = pct(avgThis, avgLast);
      return { delta, n: N, m: M, avgThis, avgLast };
    }
    const scH = sameCountDelta("h");
    const scP = sameCountDelta("p");
    const scL = sameCountDelta("l");
    const pick = (sc, w, c) => sc != null ? sc : w != null ? w : c;
    setPill($("advHoursTrend"), pick(scH.delta, advH, cumH));
    setPill($("advParcelsTrend"), pick(scP.delta, advP, cumP));
    setPill($("advLettersTrend"), pick(scL.delta, advL, cumL));
    try {
      const panelBody = document.getElementById("wkHoursDetailsBody");
      if (panelBody) {
        const dNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const rowsHtml = [];
        let tThis = 0, tLast = 0;
        for (let i = 0; i < 7; i++) {
          const cur = i <= dayIndexToday ? offIdxThisWeek.has(i) ? null : ((_a5 = thisWeek[i]) == null ? void 0 : _a5.h) || 0 : null;
          let base = ((_b = lastWeek[i]) == null ? void 0 : _b.h) || 0;
          let adjMark = "";
          if (holidayAdjEnabled && carryNext && carryNext.has(i)) {
            base = (((_c = lastWeek[i - 1]) == null ? void 0 : _c.h) || 0) + (((_d = lastWeek[i]) == null ? void 0 : _d.h) || 0);
            adjMark = " (adj)";
          }
          if (cur != null) tThis += cur;
          if (i <= dayIndexToday) tLast += base;
          const delta = cur == null || base === 0 ? null : (cur - base) / base * 100;
          const curTxt = cur == null ? "Off" : cur.toFixed(2);
          const baseTxt = base === 0 ? "Off" : base.toFixed(2);
          const { fg } = colorForDelta(delta || 0);
          const deltaTxt = delta == null ? "\u2014" : delta >= 0 ? `\u2191 ${Math.round(delta)}%` : `\u2193 ${Math.abs(Math.round(delta))}%`;
          rowsHtml.push(`<tr><td>${dNames[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${deltaTxt}</td></tr>`);
        }
        const totalDelta = tLast === 0 ? null : (tThis - tLast) / tLast * 100;
        const { fg: totFg } = colorForDelta(totalDelta || 0);
        const totalRow = `<tr><th>Total</th><th class="right">${tThis.toFixed(2)}</th><th class="right">${tLast.toFixed(2)}</th><th class="right" style="color:${totFg}">${totalDelta == null ? "\u2014" : totalDelta >= 0 ? `\u2191 ${Math.round(totalDelta)}%` : `\u2193 ${Math.abs(Math.round(totalDelta))}%`}</th></tr>`;
        const summaryHtml = `<small><span>This week so far: </span><span style="color:var(--warn)">${tThis.toFixed(2)}h over ${dThis} day(s). Last week: ${tLast.toFixed(2)}h over ${dLast} day(s).</span></small>`;
        panelBody.innerHTML = `
          <div style="padding:8px 10px;border-bottom:1px solid var(--border)">${summaryHtml}</div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr><th>Day</th><th class="right">This week</th><th class="right">Last week</th><th class="right">\u0394%</th></tr>
            </thead>
            <tbody>
              ${rowsHtml.join("")}
            </tbody>
            <tfoot>
              ${totalRow}
            </tfoot>
          </table>
        `;
      }
    } catch (e) {
      console.warn("Failed to populate weekly hours details", e);
    }
    try {
      const panelBody = document.getElementById("wkParcelsDetailsBody");
      if (panelBody) {
        const dNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const rowsHtml = [];
        let tThis = 0, tLast = 0;
        for (let i = 0; i < 7; i++) {
          const cur = i <= dayIndexToday ? offIdxThisWeek.has(i) ? null : ((_e = thisWeek[i]) == null ? void 0 : _e.p) || 0 : null;
          let base = ((_f = lastWeek[i]) == null ? void 0 : _f.p) || 0;
          let adjMark = "";
          if (holidayAdjEnabled && carryNext && carryNext.has(i)) {
            base = (((_g = lastWeek[i - 1]) == null ? void 0 : _g.p) || 0) + (((_h = lastWeek[i]) == null ? void 0 : _h.p) || 0);
            adjMark = " (adj)";
          }
          if (cur != null) tThis += cur;
          if (i <= dayIndexToday) tLast += base;
          const delta = cur == null || base === 0 ? null : (cur - base) / base * 100;
          const curTxt = cur == null ? "\u2014" : String(cur);
          const baseTxt = String(base);
          const { fg } = colorForDelta(delta || 0);
          const deltaTxt = delta == null ? "\u2014" : delta >= 0 ? `\u2191 ${Math.round(delta)}%` : `\u2193 ${Math.abs(Math.round(delta))}%`;
          rowsHtml.push(`<tr><td>${dNames[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${deltaTxt}</td></tr>`);
        }
        const totalDelta = tLast === 0 ? null : (tThis - tLast) / tLast * 100;
        const { fg: totFg } = colorForDelta(totalDelta || 0);
        const totalRow = `<tr><th style="color:var(--brand)">Total (this week vs last)</th><th class="right">${tThis}</th><th class="right">${tLast}</th><th class="right" style="color:${totFg}">${totalDelta == null ? "\u2014" : totalDelta >= 0 ? `\u2191 ${Math.round(totalDelta)}%` : `\u2193 ${Math.abs(Math.round(totalDelta))}%`}</th></tr>`;
        const summaryHtml = `<small><span>This week so far: </span><span style="color:var(--warn)">${tThis} parcels over ${dThis} day(s). Last week: ${tLast} parcels over ${dLast} day(s).</span></small>`;
        panelBody.innerHTML = `
          <div style="padding:8px 10px;border-bottom:1px solid var(--border)">${summaryHtml}</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr><th>Day</th><th class="right">This week</th><th class="right">Last week</th><th class="right">\u0394%</th></tr></thead>
            <tbody>${rowsHtml.join("")}</tbody>
            <tfoot>${totalRow}</tfoot>
          </table>`;
      }
    } catch (e) {
      console.warn("Failed to populate weekly parcels details", e);
    }
    try {
      const panelBody = document.getElementById("wkLettersDetailsBody");
      if (panelBody) {
        const dNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const rowsHtml = [];
        let tThis = 0, tLast = 0;
        for (let i = 0; i < 7; i++) {
          const cur = i <= dayIndexToday ? offIdxThisWeek.has(i) ? null : ((_i = thisWeek[i]) == null ? void 0 : _i.l) || 0 : null;
          let base = ((_j = lastWeek[i]) == null ? void 0 : _j.l) || 0;
          let adjMark = "";
          if (holidayAdjEnabled && carryNext && carryNext.has(i)) {
            base = (((_k = lastWeek[i - 1]) == null ? void 0 : _k.l) || 0) + (((_l = lastWeek[i]) == null ? void 0 : _l.l) || 0);
            adjMark = " (adj)";
          }
          if (cur != null) tThis += cur;
          if (i <= dayIndexToday) tLast += base;
          const delta = cur == null || base === 0 ? null : (cur - base) / base * 100;
          const curTxt = cur == null ? "\u2014" : String(cur);
          const baseTxt = String(base);
          const { fg } = colorForDelta(delta || 0);
          const deltaTxt = delta == null ? "\u2014" : delta >= 0 ? `\u2191 ${Math.round(delta)}%` : `\u2193 ${Math.abs(Math.round(delta))}%`;
          rowsHtml.push(`<tr><td>${dNames[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${deltaTxt}</td></tr>`);
        }
        const totalDelta = tLast === 0 ? null : (tThis - tLast) / tLast * 100;
        const { fg: totFg } = colorForDelta(totalDelta || 0);
        const totalRow = `<tr><th style="color:var(--brand)">Total (this week vs last)</th><th class="right">${tThis}</th><th class="right">${tLast}</th><th class="right" style="color:${totFg}">${totalDelta == null ? "\u2014" : totalDelta >= 0 ? `\u2191 ${Math.round(totalDelta)}%` : `\u2193 ${Math.abs(Math.round(totalDelta))}%`}</th></tr>`;
        const summaryHtml = `<small><span>This week so far: </span><span style="color:var(--warn)">${tThis} letters over ${dThis} day(s). Last week: ${tLast} letters over ${dLast} day(s).</span></small>`;
        panelBody.innerHTML = `
          <div style="padding:8px 10px;border-bottom:1px solid var(--border)">${summaryHtml}</div>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr><th>Day</th><th class="right">This week</th><th class="right">Last week</th><th class="right">\u0394%</th></tr></thead>
            <tbody>${rowsHtml.join("")}</tbody>
            <tfoot>${totalRow}</tfoot>
          </table>`;
      }
    } catch (e) {
      console.warn("Failed to populate weekly letters details", e);
    }
    const renderTrendPanel = (bodyId, dailyArr, weightedVal, cumulativeVal, key, sc) => {
      var _a6, _b2, _c2, _d2;
      const body = document.getElementById(bodyId);
      if (!body) return;
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const rows2 = [];
      for (let i = 0; i <= dayIndexToday && i < 7; i++) {
        const v2 = dailyArr[i];
        const cur = offIdxThisWeek.has(i) ? null : ((_a6 = thisWeek[i]) == null ? void 0 : _a6[key]) || 0;
        let base = ((_b2 = lastWeek[i]) == null ? void 0 : _b2[key]) || 0;
        let adjMark = "";
        if (holidayAdjEnabled && carryNext && carryNext.has(i)) {
          base = (((_c2 = lastWeek[i - 1]) == null ? void 0 : _c2[key]) || 0) + (((_d2 = lastWeek[i]) == null ? void 0 : _d2[key]) || 0);
          adjMark = " (adj)";
        }
        const pctTxt = v2 == null || !isFinite(v2) ? "\u2014" : v2 >= 0 ? `\u2191 ${Math.round(v2)}%` : `\u2193 ${Math.abs(Math.round(v2))}%`;
        const { fg } = colorForDelta(v2 || 0);
        const fmt2 = key === "h" ? (n) => n.toFixed(2) : (n) => String(n);
        const curTxt = i <= dayIndexToday ? cur == null ? key === "h" ? "Off" : "\u2014" : fmt2(cur) : "\u2014";
        const baseTxt = key === "h" ? base === 0 ? "Off" : fmt2(base) : fmt2(base);
        rows2.push(`<tr><td>${days[i]}${adjMark}</td><td class="right">${curTxt}</td><td class="right">${baseTxt}</td><td class="right" style="color:${fg};white-space:nowrap">${pctTxt}</td></tr>`);
      }
      const pickUsed = sc && sc.delta != null && isFinite(sc.delta) ? `Weekly Avg (N=${sc.n}${sc.m && sc.m !== sc.n ? `, last N=${Math.min(sc.n, sc.m)}` : ""})` : weightedVal != null && isFinite(weightedVal) ? "Weighted" : "Cumulative";
      const wTxt = weightedVal == null || !isFinite(weightedVal) ? "\u2014" : `${weightedVal >= 0 ? "\u2191" : "\u2193"} ${Math.abs(Math.round(weightedVal))}%`;
      const cTxt = cumulativeVal == null || !isFinite(cumulativeVal) ? "\u2014" : `${cumulativeVal >= 0 ? "\u2191" : "\u2193"} ${Math.abs(Math.round(cumulativeVal))}%`;
      const sTxt = !sc || sc.delta == null || !isFinite(sc.delta) ? "\u2014" : `${sc.delta >= 0 ? "\u2191" : "\u2193"} ${Math.abs(Math.round(sc.delta))}%`;
      const { fg: sFg } = colorForDelta(sc && sc.delta || 0);
      const { fg: wFg } = colorForDelta(weightedVal || 0);
      const { fg: cFg } = colorForDelta(cumulativeVal || 0);
      body.innerHTML = `
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th>Day</th><th class="right">This week</th><th class="right">Last week</th><th class="right">\u0394%</th></tr></thead>
          <tbody>${rows2.join("")}</tbody>
          <tfoot>
            <tr><th colspan="3" class="right">Weekly Avg \u0394% ${sc ? `<small class=\\"muted\\">(N=${sc.n}${sc.m && sc.m !== sc.n ? `, last N=${Math.min(sc.n, sc.m)}` : ""})</small>` : ""}</th><th class="right" style="color:${sFg}">${sTxt}</th></tr>
            <tr><th colspan="3" class="right">Weighted avg \u0394%</th><th class="right" style="color:${wFg}">${wTxt}</th></tr>
            <tr><th colspan="3" class="right">Cumulative \u0394%</th><th class="right" style="color:${cFg}">${cTxt}</th></tr>
            <tr><th colspan="4" class="right"><small class="muted">Using: ${pickUsed}</small></th></tr>
          </tfoot>
        </table>`;
    };
    try {
      renderTrendPanel("advHoursDetailsBody", dH, advH, cumH, "h", scH);
      renderTrendPanel("advParcelsDetailsBody", dP, advP, cumP, "p", scP);
      renderTrendPanel("advLettersDetailsBody", dL, advL, cumL, "l", scL);
    } catch (e) {
      console.warn("Failed to populate trend panels", e);
    }
    const todayIso2 = today.toISODate();
    const todaysRow = workRows.find((r) => r.work_date === todayIso2);
    const sameDow = workRows.filter((r) => r.work_date !== todayIso2 && dowIndex(r.work_date) === dow);
    const lastSame = sameDow.length ? sameDow[0] : null;
    const baseParcels = lastSame ? +lastSame.parcels || 0 : null;
    const baseLetters = lastSame ? +lastSame.letters || 0 : null;
    const todayParcels = todaysRow ? +todaysRow.parcels || 0 : null;
    const todayLetters = todaysRow ? +todaysRow.letters || 0 : null;
    const dayPct = (val, base) => val == null || !base ? null : (val - base) / base * 100;
    const tdp = dayPct(todayParcels, baseParcels), tdl = dayPct(todayLetters, baseLetters);
    const wkNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    (_o = (_n = (_m = document.querySelector("#todayParcelsDelta")) == null ? void 0 : _m.closest(".stat")) == null ? void 0 : _n.querySelector("small.muted")) == null ? void 0 : _o.replaceChildren(document.createTextNode(`vs last ${wkNames[dow]} (worked)`));
    (_r = (_q = (_p = document.querySelector("#todayLettersDelta")) == null ? void 0 : _p.closest(".stat")) == null ? void 0 : _q.querySelector("small.muted")) == null ? void 0 : _r.replaceChildren(document.createTextNode(`vs last ${wkNames[dow]} (worked)`));
    (_u = (_t = (_s = document.querySelector("#todayOfficeDelta")) == null ? void 0 : _s.closest(".stat")) == null ? void 0 : _t.querySelector("small.muted")) == null ? void 0 : _u.replaceChildren(document.createTextNode(`vs last ${wkNames[dow]} (worked)`));
    const baseOffice = lastSame ? +lastSame.office_minutes || 0 : null;
    const todayOffice = todaysRow ? +todaysRow.office_minutes || 0 : null;
    const fmtTiny = (p) => p == null ? "\u2014" : p >= 0 ? `\u2191 ${p.toFixed(0)}%` : `\u2193 ${Math.abs(p).toFixed(0)}%`;
    const tdo = dayPct(todayOffice, baseOffice);
    $("todayParcelsDelta").textContent = fmtTiny(tdp);
    $("todayLettersDelta").textContent = fmtTiny(tdl);
    $("todayOfficeDelta").textContent = fmtTiny(tdo);
    (() => {
      const tp = document.getElementById("todayParcelsDelta");
      const tl = document.getElementById("todayLettersDelta");
      const to = document.getElementById("todayOfficeDelta");
      const { fg: fgP } = colorForDelta(tdp);
      const { fg: fgL } = colorForDelta(tdl);
      const { fg: fgO } = colorForDelta(tdo);
      if (tp) {
        tp.className = "pill statDelta";
        tp.style.color = fgP;
        tp.style.background = "transparent";
        tp.style.borderColor = "transparent";
      }
      if (tl) {
        tl.className = "pill statDelta";
        tl.style.color = fgL;
        tl.style.background = "transparent";
        tl.style.borderColor = "transparent";
      }
      if (to) {
        to.className = "pill statDelta";
        to.style.color = fgO;
        to.style.background = "transparent";
        to.style.borderColor = "transparent";
      }
    })();
  }
  try {
    sb.channel("entries-feed").on("postgres_changes", { event: "*", schema: "public", table: "entries" }, async () => {
      const rows = await fetchEntries();
      allRows = rows;
      rebuildAll();
    }).subscribe();
  } catch (e) {
    console.warn("Realtime not enabled:", (e == null ? void 0 : e.message) || e);
  }
  $("fab").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("departTime").focus();
  });
  $("searchBox").addEventListener("input", () => {
    renderTable(applySearch(allRows));
  });
  (function enableRowNavigation() {
    const tbody = document.querySelector("#tbl tbody");
    if (!tbody) return;
    function activate(e) {
      const tr = e.target.closest("tr.rowLink");
      if (!tr) return;
      $("date").value = tr.dataset.date;
      loadByDate();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    tbody.addEventListener("click", activate);
    tbody.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (e.target.closest("tr.rowLink")) {
          e.preventDefault();
          activate(e);
        }
      }
    });
  })();
  function applyCollapsedUi() {
    const enabled = !!(FLAGS && FLAGS.collapsedUi);
    const targets = [
      { id: "addEntryCard" },
      { id: "dowCard" },
      { id: "parcelsOverTimeCard" },
      { id: "lettersOverTimeCard" },
      { id: "monthlyGlanceCard" },
      { id: "quickFilterCard" },
      { id: "dayCompareCard" },
      { id: "recentEntriesCard" }
    ];
    const storeKey = (id) => `routeStats.collapse.${id}`;
    const $body = (id) => document.querySelector("#" + id + " > .__collapseBody");
    const $btn = (id) => document.querySelector("#" + id + " .__collapseToggle");
    function setSectionCollapsed(id, collapsed) {
      const body = $body(id);
      const btn = $btn(id);
      if (body) body.style.display = collapsed ? "none" : "";
      if (btn) {
        btn.textContent = collapsed ? "Expand" : "Collapse";
        btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        const ctrl = btn.getAttribute("aria-controls");
        if (!ctrl && body && body.id) btn.setAttribute("aria-controls", body.id);
      }
      try {
        localStorage.setItem(storeKey(id), collapsed ? "1" : "0");
      } catch (_) {
      }
      if (id === "addEntryCard") updateQuickEntryVisibility(collapsed);
    }
    for (const t of targets) {
      const sec = document.getElementById(t.id);
      if (!sec) continue;
      const headerEl = sec.firstElementChild;
      if (!headerEl) continue;
      let body = sec.querySelector(":scope > .__collapseBody");
      if (!body) {
        body = document.createElement("div");
        body.className = "__collapseBody";
        const toMove = [];
        for (let i = 1; i < sec.children.length; i++) toMove.push(sec.children[i]);
        toMove.forEach((node) => body.appendChild(node));
        try {
          if (!body.id) body.id = `__cb_${t.id}`;
        } catch (_) {
        }
        sec.appendChild(body);
      }
      try {
        const toggles = sec.querySelectorAll(".__collapseToggle");
        if (toggles && toggles.length > 1) {
          toggles.forEach((b, idx) => {
            if (!headerEl.contains(b) || idx > 0) b.remove();
          });
        }
      } catch (_) {
      }
      let btn = headerEl.querySelector(".__collapseToggle");
      if (!btn) {
        btn = document.createElement("button");
        btn.className = "ghost __collapseToggle";
        btn.type = "button";
        btn.style.marginLeft = "auto";
        btn.style.float = "right";
        btn.style.fontSize = "12px";
        btn.textContent = "Collapse";
        btn.setAttribute("aria-expanded", "true");
        if (body && body.id) btn.setAttribute("aria-controls", body.id);
        try {
          headerEl.appendChild(btn);
        } catch (_) {
          sec.insertBefore(btn, sec.firstChild);
        }
      }
      const setCollapsed = (collapsed) => setSectionCollapsed(t.id, collapsed);
      const saved = localStorage.getItem(storeKey(t.id)) === "1";
      btn.style.display = enabled ? "none" : "none";
      if (!enabled) {
        setCollapsed(false);
        continue;
      }
      if ((t.id === "addEntryCard" || t.id === "recentEntriesCard") && localStorage.getItem(storeKey(t.id)) == null) {
        try {
          localStorage.setItem(storeKey(t.id), "1");
        } catch (_) {
        }
      }
      const initialCollapsed = localStorage.getItem(storeKey(t.id)) === "1";
      setCollapsed(initialCollapsed);
      const headerToggle = (ev) => {
        const trg = ev.target;
        if (trg.closest && (trg.closest("#quickEntryBar") || trg.closest("button") || trg.closest("input") || trg.closest("a"))) return;
        const bodyNow = $body(t.id);
        const nowCollapsed = bodyNow && bodyNow.style.display !== "none" ? true : false;
        setCollapsed(nowCollapsed);
      };
      headerEl.style.cursor = "pointer";
      headerEl.title = "Click to expand/collapse";
      headerEl.addEventListener("click", headerToggle);
      headerEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          headerToggle(e);
        }
      });
      if (t.id === "addEntryCard") ensureQuickEntryControls(headerEl);
    }
    window.__collapse_targets = targets.map((t) => t.id);
    window.__collapse_set = setSectionCollapsed;
  }
  function applyFocusMode() {
    try {
      const btn = document.getElementById("btnFocusMode");
      const enabled = !!(FLAGS && FLAGS.collapsedUi);
      if (!btn) return;
      if (!enabled) {
        btn.style.display = "none";
        return;
      }
      btn.style.display = "";
      const on = !!(FLAGS && FLAGS.focusMode);
      btn.textContent = `Focus Mode: ${on ? "On" : "Off"}`;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.onclick = () => {
        FLAGS.focusMode = !FLAGS.focusMode;
        saveFlags(FLAGS);
        applyFocusMode();
      };
      const targets = window.__collapse_targets || [];
      if (!targets.length) return;
      if (on) {
        targets.forEach((id) => {
          if (id === "snapshotCard") return;
          try {
            (window.__collapse_set || (() => {
            }))(id, true);
          } catch (_) {
          }
        });
      } else {
      }
    } catch (_) {
    }
  }
  function ensureQuickEntryControls(headerEl) {
    if (!FLAGS.quickEntry) return;
    let bar = document.getElementById("quickEntryBar");
    if (!bar) {
      bar = document.createElement("span");
      bar.id = "quickEntryBar";
      bar.style.cssText = "float:right; display:none; gap:8px; align-items:center; font-size:12px";
      bar.className = "row";
      const hitBtn = document.createElement("button");
      hitBtn.id = "quickHitBtn";
      hitBtn.className = "ghost btn-compact";
      hitBtn.type = "button";
      hitBtn.textContent = "Hit Street (now)";
      const retBtn = document.createElement("button");
      retBtn.id = "quickReturnBtn";
      retBtn.className = "ghost btn-compact";
      retBtn.type = "button";
      retBtn.textContent = "Return (now)";
      bar.appendChild(hitBtn);
      bar.appendChild(retBtn);
      try {
        headerEl.appendChild(bar);
      } catch (_) {
      }
      hitBtn.onclick = () => {
        try {
          $("departTime").value = hhmmNow();
          computeBreakdown();
        } catch (_) {
        }
      };
      retBtn.onclick = () => {
        try {
          $("returnTime").value = hhmmNow();
          computeBreakdown();
        } catch (_) {
        }
      };
    }
    updateQuickEntryVisibility(localStorage.getItem("routeStats.collapse.addEntryCard") === "1");
  }
  function updateQuickEntryVisibility(isCollapsed2) {
    const bar = document.getElementById("quickEntryBar");
    if (!bar) {
      return;
    }
    const show = !!FLAGS.quickEntry && !!isCollapsed2;
    bar.style.display = show ? "inline-flex" : "none";
  }
  (function bindVolumeLeaderboard() {
    const openBtn = document.getElementById("openVolumeLeaderboard");
    const closeBtn = document.getElementById("closeVolumeLeaderboard");
    const panel = document.getElementById("volumeLeaderboard");
    const showPanel = () => {
      if (!panel) return;
      buildVolumeLeaderboard(window.__rawRows || allRows || []);
      panel.style.display = "block";
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    openBtn == null ? void 0 : openBtn.addEventListener("click", showPanel);
    openBtn == null ? void 0 : openBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showPanel();
      }
    });
    closeBtn == null ? void 0 : closeBtn.addEventListener("click", () => {
      if (panel) panel.style.display = "none";
    });
  })();
  (function enableWeeklyPanels() {
    const panels = ["wkHoursDetails", "wkParcelsDetails", "wkLettersDetails", "advHoursDetails", "advParcelsDetails", "advLettersDetails"];
    function hideOthers(except) {
      panels.forEach((id) => {
        if (id !== except) {
          const el = document.getElementById(id);
          if (el) el.style.display = "none";
        }
      });
    }
    function enable(tileId, panelId, closeId) {
      const tile = document.getElementById(tileId);
      const panel = document.getElementById(panelId);
      const close = document.getElementById(closeId);
      const toggle = () => {
        if (!panel) return;
        const show = panel.style.display === "none";
        if (show) {
          hideOthers(panelId);
          panel.style.display = "block";
          panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          panel.style.display = "none";
        }
      };
      tile == null ? void 0 : tile.addEventListener("click", toggle);
      tile == null ? void 0 : tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
      close == null ? void 0 : close.addEventListener("click", () => {
        if (panel) panel.style.display = "none";
      });
    }
    enable("tileWkHours", "wkHoursDetails", "closeWkHoursDetails");
    enable("tileWkParcels", "wkParcelsDetails", "closeWkParcelsDetails");
    enable("tileWkLetters", "wkLettersDetails", "closeWkLettersDetails");
    enable("tileAdvHours", "advHoursDetails", "closeAdvHoursDetails");
    enable("tileAdvParcels", "advParcelsDetails", "closeAdvParcelsDetails");
    enable("tileAdvLetters", "advLettersDetails", "closeAdvLettersDetails");
  })();
  (async () => {
    $("date").value = todayStr();
    await loadByDate();
    const sessionFromCallback = await authReadyPromise.catch(() => null);
    const session = sessionFromCallback || await sb.auth.getSession().then((r) => r.data.session).catch(() => null);
    let rows = [];
    if (session) {
      try {
        rows = await fetchEntries();
      } catch (err) {
        console.warn("Initial fetchEntries failed:", err);
        rows = [];
      }
    }
    allRows = rows;
    window.allRows = rows;
    rebuildAll();
    computeBreakdown();
    applyTrendPillsVisibility();
    applyCollapsedUi();
    applyRecentEntriesAutoCollapse();
    applyFocusMode();
  })();
  console.log("Route Stats loaded \u2014", VERSION_TAG);
  window.showDiagnostics = function() {
    try {
      if (typeof fitVolumeTimeModel !== "function") {
        console.log("Model not loaded");
        return;
      }
      const rows = rowsForModelScope((window.allRows || []).filter((r) => r && r.status !== "off" && (+r.parcels || 0) + (+r.letters || 0) > 0).sort((a, b) => a.work_date < b.work_date ? -1 : 1));
      const m = fitVolumeTimeModel(rows);
      if (!m) {
        console.log("Not enough data for diagnostics");
        return;
      }
      console.table(m.residuals.map((d) => ({
        date: d.iso,
        parcels: d.parcels,
        letters: d.letters,
        routeH: (d.routeMin / 60).toFixed(2),
        predH: (d.predMin / 60).toFixed(2),
        residMin: +d.residMin.toFixed(0)
      })).sort((a, b) => Math.abs(b.residMin) - Math.abs(a.residMin)).slice(0, 5));
      console.log("bp=", m.bp.toFixed(2), "bl=", m.bl.toFixed(3), "w=", (m.bl / m.bp).toFixed(2), "R^2=", (Math.max(0, Math.min(1, m.r2)) * 100).toFixed(0) + "%");
      return m;
    } catch (err) {
      console.warn("showDiagnostics error", err);
      return null;
    }
  };
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
      navigator.serviceWorker.register("sw.js").catch(function(err) {
        console.error("Service worker registration failed:", err);
      });
    });
  }
  function buildUspsTiles(rows) {
    try {
      rows = filterRowsForView(rows || []);
      const routeTile = document.getElementById("tileUspsRouteEff");
      const hourlyTile = document.getElementById("tileUspsHourly");
      if (!routeTile || !hourlyTile) return;
      const show = !!(FLAGS && FLAGS.uspsEval);
      routeTile.style.display = show ? "" : "none";
      hourlyTile.style.display = show ? "" : "none";
      if (!show) return;
      const cfg = USPS_EVAL || loadEval();
      try {
        const now = DateTime.now().setZone(ZONE);
        const start2 = startOfWeekMonday(now);
        const end2 = now.endOf("day");
        const inRange = (r) => {
          const d = DateTime.fromISO(r.work_date, { zone: ZONE });
          return d >= start2 && d <= end2;
        };
        const worked = (rows || []).filter((r) => r.status !== "off" && inRange(r));
        const days = Array.from(new Set(worked.map((r) => r.work_date))).length;
        const valEl = document.getElementById("uspsRouteEffVal");
        if (!days || cfg.hoursPerDay == null) {
          valEl.textContent = "\u2014";
          valEl.style.color = "";
        } else {
          const expHoursTotal = Math.max(0, cfg.hoursPerDay) * days;
          const hoursTotal = worked.reduce((t, r) => t + (+r.hours || 0), 0);
          const progress = expHoursTotal > 0 ? hoursTotal / expHoursTotal * 100 : null;
          if (progress == null || !isFinite(progress)) {
            valEl.textContent = "\u2014";
            valEl.style.color = "";
          } else {
            const s = Math.round(progress);
            valEl.textContent = `${s}%`;
            valEl.style.color = "";
            valEl.title = `${(Math.round(hoursTotal * 100) / 100).toFixed(2)}h of ${(Math.round(expHoursTotal * 100) / 100).toFixed(2)}h eval over ${days} day(s)`;
          }
        }
      } catch (_) {
      }
      try {
        const now = DateTime.now().setZone(ZONE);
        const weeksBack = 4;
        const ranges = [];
        for (let w = 1; w <= weeksBack; w++) {
          ranges.push({ s: startOfWeekMonday(now.minus({ weeks: w })), e: endOfWeekSunday(now.minus({ weeks: w })) });
        }
        const val = document.getElementById("uspsHourlyRateVal");
        if (!cfg || cfg.annualSalary == null) {
          val.textContent = "\u2014";
          val.style.color = "";
        } else {
          const weeklyPay = cfg.annualSalary / 52;
          let totalHours = 0, usedWeeks = 0;
          for (const rg of ranges) {
            const wk = (rows || []).filter((r) => r.status !== "off" && (() => {
              const d = DateTime.fromISO(r.work_date, { zone: ZONE });
              return d >= rg.s && d <= rg.e;
            })());
            const h = wk.reduce((t, r) => t + (+r.hours || 0), 0);
            if (h > 0) {
              totalHours += h;
              usedWeeks++;
            }
          }
          if (!usedWeeks || totalHours <= 0) {
            val.textContent = "\u2014";
            val.style.color = "";
          } else {
            const rate = usedWeeks * weeklyPay / totalHours;
            val.textContent = `$${(Math.round(rate * 100) / 100).toFixed(2)}`;
            val.title = `${usedWeeks}wk avg: ${totalHours.toFixed(2)}h total`;
            val.style.color = "";
          }
        }
      } catch (_) {
      }
    } catch (_) {
    }
  }
})();
