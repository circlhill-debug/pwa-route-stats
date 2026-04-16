import { DateTime, ZONE } from '../utils/date.js';

export function buildForecastRenderPlan({ now, latestForecastMessage, computeForecastText }) {
  const hour = now.hour;

  if (hour >= 20) {
    const targetDate = now.plus({ days: 1 });
    const targetDow = targetDate.weekday === 7 ? 0 : targetDate.weekday;
    if (targetDow === 0) {
      return {
        title: '🌤 Tomorrow’s Forecast',
        message: 'Enjoy your day off ❤️',
        shouldSyncBeforeRender: true,
        shouldPersistRemote: false,
        iso: targetDate.toISODate(),
        targetDow
      };
    }
    const forecastText = computeForecastText({ targetDow }) || 'Forecast unavailable';
    return {
      title: '🌤 Tomorrow’s Forecast',
      message: forecastText,
      shouldSyncBeforeRender: true,
      shouldPersistRemote: true,
      iso: targetDate.toISODate(),
      targetDow
    };
  }

  if (hour < 8) {
    const todayIso = now.toISODate();
    if (latestForecastMessage?.iso === todayIso && latestForecastMessage?.text) {
      return {
        title: '🌤 Tomorrow’s Forecast',
        message: latestForecastMessage.text,
        shouldSyncBeforeRender: false,
        shouldPersistRemote: false,
        iso: todayIso,
        targetDow: now.weekday === 7 ? 0 : now.weekday
      };
    }
    const todayDow = now.weekday === 7 ? 0 : now.weekday;
    const forecastText = computeForecastText({ targetDow: todayDow }) || 'Forecast unavailable';
    return {
      title: '🌤 Tomorrow’s Forecast',
      message: forecastText,
      shouldSyncBeforeRender: false,
      shouldPersistRemote: true,
      iso: todayIso,
      targetDow: todayDow
    };
  }

  return {
    title: '❤',
    message: 'Stay safe out there my Stallion.',
    shouldSyncBeforeRender: false,
    shouldPersistRemote: false,
    iso: null,
    targetDow: null
  };
}

export function buildForecastSnapshotFromPayload(payload, { userId = null, tags = [] } = {}) {
  if (!payload || !payload.work_date) return null;
  if (payload.status === 'off') return null;
  const iso = payload.work_date;
  const dt = DateTime.fromISO(iso, { zone: ZONE });
  const weekday = dt.isValid ? (dt.weekday % 7) : (new Date(iso)).getDay();
  const hours = Number(payload.hours);
  const officeHours = Number(payload.office_minutes);
  return {
    iso,
    weekday,
    totalTime: Number.isFinite(hours) ? Math.round(hours * 60) : null,
    officeTime: Number.isFinite(officeHours) ? Math.round(officeHours * 60) : null,
    endTime: payload.end_time || payload.return_time || null,
    tags,
    user_id: userId || null
  };
}
