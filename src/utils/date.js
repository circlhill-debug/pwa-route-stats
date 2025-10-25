/* global luxon */

// Date/time helpers shared across the PWA (vacation ranges, baselines, formatting).
const { DateTime } = luxon;

export const ZONE = 'America/Detroit';

export function todayStr(){
  return DateTime.now().setZone(ZONE).toISODate();
}

export function todayIso(){
  return DateTime.now().setZone(ZONE).toISODate();
}

export function hhmmNow(){
  const d = DateTime.now().setZone(ZONE);
  return `${String(d.hour).padStart(2,'0')}:${String(d.minute).padStart(2,'0')}`;
}

export function dowIndex(dateStr){
  return DateTime.fromFormat(dateStr,'yyyy-MM-dd',{zone:ZONE}).weekday % 7;
}

export function startOfWeekMonday(dt){
  const w = dt.weekday;
  const shift = (w + 6) % 7;
  return dt.startOf('day').minus({ days: shift });
}

export function endOfWeekSunday(dt){
  return startOfWeekMonday(dt).plus({ days: 6 }).endOf('day');
}

export function dateInRangeISO(iso, fromIso, toIso){
  try{
    if (!iso || !fromIso || !toIso) return false;
    const d = DateTime.fromISO(iso, { zone: ZONE }).startOf('day');
    const a = DateTime.fromISO(fromIso, { zone: ZONE }).startOf('day');
    const b = DateTime.fromISO(toIso, { zone: ZONE }).endOf('day');
    return d >= a && d <= b;
  }catch(_){
    return false;
  }
}

export function normalizeRanges(ranges){
  try{
    const parse = iso => DateTime.fromISO(iso, {zone: ZONE}).startOf('day');
    const items = (ranges||[])
      .map(r => ({ from: r.from, to: r.to }))
      .filter(r => r.from && r.to)
      .map(r => ({ a: parse(r.from), b: DateTime.fromISO(r.to, {zone: ZONE}).endOf('day') }))
      .sort((x,y) => x.a.toMillis() - y.a.toMillis());
    const merged = [];
    for (const it of items){
      if (!merged.length) {
        merged.push({ ...it });
        continue;
      }
      const last = merged[merged.length-1];
      if (it.a <= last.b.plus({ days: 0 })){
        if (it.b > last.b) last.b = it.b;
      } else {
        merged.push({ ...it });
      }
    }
    return merged.map(x => ({ from: x.a.toISODate(), to: x.b.toISODate() }));
  }catch(_){
    return ranges || [];
  }
}

export function diffHours(dateIso, t1, t2){
  if(!t1 || !t2) return null;
  const a = DateTime.fromISO(`${dateIso}T${t1}`, { zone: ZONE });
  const b = DateTime.fromISO(`${dateIso}T${t2}`, { zone: ZONE });
  let h = (b.toMillis()-a.toMillis())/3.6e6;
  if(h < 0) h += 24;
  return Math.round(h * 100) / 100;
}

export function moonPhaseEmoji(dateStr){
  const d = DateTime.fromISO(dateStr, { zone: ZONE });
  const lp = 2551442.8; // synodic month (sec)
  const newMoon = DateTime.fromISO('2000-01-06T18:14:00Z').toSeconds();
  const phase = ((d.toSeconds() - newMoon) % lp + lp) % lp / lp;

  if (phase < 0.03 || phase > 0.97) return '🌑';
  if (phase < 0.25) return '🌒';
  if (phase < 0.27) return '🌓';
  if (phase < 0.48) return '🌔';
  if (phase < 0.52) return '🌕';
  if (phase < 0.75) return '🌖';
  if (phase < 0.77) return '🌗';
  return '🌘';
}

export { DateTime };
